const normalizeText = (value) => value.replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();

function xmlDocument(source) {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('The document contains invalid XML.');
  return document;
}

function getXmlParagraphs(document, selector) {
  return [...document.getElementsByTagName('*')]
    .filter((element) => selector.includes(element.localName))
    .map((element) => normalizeText(element.textContent || ''))
    .filter(Boolean)
    .join('\n\n');
}

function resolveArchivePath(baseFile, target) {
  const parts = `${baseFile.slice(0, baseFile.lastIndexOf('/') + 1)}${target}`.split('/');
  const resolved = [];
  parts.forEach((part) => {
    if (part === '..') resolved.pop();
    else if (part && part !== '.') resolved.push(part);
  });
  return resolved.join('/');
}

async function extractEpub(file) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('This EPUB is missing its book metadata.');
  const container = xmlDocument(await containerFile.async('text'));
  const packagePath = container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
  if (!packagePath) throw new Error('This EPUB has no readable package document.');

  const packageFile = zip.file(packagePath);
  if (!packageFile) throw new Error('The EPUB package document could not be found.');
  const packageDocument = xmlDocument(await packageFile.async('text'));
  const manifest = new Map([...packageDocument.getElementsByTagName('item')]
    .map((item) => [item.getAttribute('id'), item.getAttribute('href')]));
  const spine = [...packageDocument.getElementsByTagName('itemref')];
  const chapters = [];

  for (const item of spine) {
    const href = manifest.get(item.getAttribute('idref'));
    if (!href) continue;
    const chapterPath = resolveArchivePath(packagePath, decodeURIComponent(href.split('#')[0]));
    const chapterFile = zip.file(chapterPath);
    if (!chapterFile) continue;
    const chapterDocument = new DOMParser().parseFromString(await chapterFile.async('text'), 'text/html');
    const blocks = [...chapterDocument.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote')]
      .map((element) => normalizeText(element.textContent || ''))
      .filter(Boolean);
    const chapterText = blocks.length ? blocks.join('\n\n') : normalizeText(chapterDocument.body?.textContent || '');
    if (chapterText) chapters.push(chapterText);
  }

  return chapters.join('\n\n');
}

async function extractPdf(file) {
  const [pdfjsModule, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.js'),
    import('pdfjs-dist/legacy/build/pdf.worker.js?url'),
  ]);
  const pdfjs = pdfjsModule.default || pdfjsModule;
  const pdfWorkerUrl = workerModule.default;
  if (!pdfjs.GlobalWorkerOptions || typeof pdfjs.getDocument !== 'function') {
    throw new Error('The PDF reader could not initialize in this browser.');
  }
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let previousY = null;
    let previousEndX = null;
    const lines = [];
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = item.transform?.[5];
      const x = item.transform?.[4];
      const lineBreak = previousY !== null && typeof y === 'number' && Math.abs(previousY - y) > 2;
      const gap = previousEndX !== null && typeof x === 'number' ? x - previousEndX : 0;
      const separator = lineBreak ? '\n' : (gap > 1.5 ? ' ' : '');
      lines.push(`${separator}${item.str}`);
      previousY = typeof y === 'number' ? y : previousY;
      previousEndX = typeof x === 'number' && Number.isFinite(item.width) ? x + item.width : null;
    }
    const pageText = normalizeText(lines.join(''));
    if (pageText) pages.push(pageText);
  }
  return pages.join('\n\n');
}

function extractRtf(source) {
  return normalizeText(source
    .replace(/\\u(-?\d+)\??/g, (_, code) => String.fromCharCode((Number(code) + 65536) % 65536))
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\(?:par[d]?|line)\b ?/gi, '\n\n')
    .replace(/\\tab\b ?/gi, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/\\([{}\\])/g, '$1')
    .replace(/[{}]/g, ''));
}

async function extractZipXml(file, kind) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const path = kind === 'odt' ? 'content.xml' : 'word/document.xml';
  const documentFile = zip.file(path);
  if (!documentFile) throw new Error(`Could not find readable ${kind.toUpperCase()} text in this file.`);
  const document = xmlDocument(await documentFile.async('text'));
  return getXmlParagraphs(document, kind === 'odt' ? ['h', 'p'] : ['p']);
}

async function extractHtml(file) {
  const document = new DOMParser().parseFromString(await file.text(), 'text/html');
  document.querySelectorAll('script,style,noscript,template').forEach((element) => element.remove());
  const blocks = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre')]
    .map((element) => normalizeText(element.textContent || ''))
    .filter(Boolean);
  return blocks.length ? blocks.join('\n\n') : normalizeText(document.body?.textContent || '');
}

async function extractFb2(file) {
  const document = xmlDocument(await file.text());
  return getXmlParagraphs(document, ['subtitle', 'p']);
}

export async function extractNovelText(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'txt':
    case 'text':
    case 'md':
    case 'markdown':
      return normalizeText(await file.text());
    case 'html':
    case 'htm':
    case 'xhtml':
      return extractHtml(file);
    case 'xml':
    case 'fb2':
      return extractFb2(file);
    case 'rtf':
      return extractRtf(await file.text());
    case 'epub':
      return extractEpub(file);
    case 'pdf':
      return extractPdf(file);
    case 'docx':
      {
        const { default: mammoth } = await import('mammoth/mammoth.browser.js');
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
      }
    case 'odt':
      return extractZipXml(file, 'odt');
    default:
      throw new Error('Choose a supported book or text file.');
  }
}

export const SUPPORTED_BOOK_EXTENSIONS = [
  '.txt', '.text', '.md', '.markdown', '.html', '.htm', '.xhtml', '.xml',
  '.rtf', '.epub', '.pdf', '.docx', '.odt', '.fb2',
];
