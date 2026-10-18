import { useEffect, useMemo, useRef, useState } from 'react';
import { extractNovelText, SUPPORTED_BOOK_EXTENSIONS } from './fileImport.js';
import {
  getStoredBookText,
  getStoredProgress,
  listStoredBooks,
  removeStoredBook,
  saveStoredBook,
  saveStoredProgress,
} from './bookStorage.js';

const SEGMENT_SIZE = 760;
let firebaseAnalyticsModulePromise;

function loadFirebaseAnalyticsModule() {
  if (!firebaseAnalyticsModulePromise) {
    firebaseAnalyticsModulePromise = new Promise((resolve, reject) => {
      if (window.novelSyncFirebaseAnalytics) {
        resolve(window.novelSyncFirebaseAnalytics);
        return;
      }

      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/firebase-analytics.js';
      script.onload = () => {
        if (window.novelSyncFirebaseAnalytics) resolve(window.novelSyncFirebaseAnalytics);
        else reject(new Error('Firebase Analytics module did not initialize.'));
      };
      script.onerror = () => reject(new Error('Firebase Analytics module could not be loaded.'));
      document.head.appendChild(script);
    });
  }

  return firebaseAnalyticsModulePromise;
}

function getVoiceOptionLabel(voice) {
  return voice.name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+Online\s+\(Natural\)/i, ' (Natural)')
    .replace(/\s+Online\s+\([^)]*\)/i, '')
    .trim();
}

const UI_LANGUAGES = {
  en: { name: 'English', translations: {} },
  sn: {
    name: 'Shona',
    translations: {
      Language: 'Mutauro', Reader: 'Kuverenga', Controls: 'Zvidzoreso', Dialogue: 'Nhaurirano', Voices: 'Manzwi',
      'Narrator language': 'Mutauro wezwi remuverengi',
      'Voice options': 'Sarudzo dzezwi',
      'One narrator voice reads the entire book.': 'Izwi remuverengi rimwe chete rinoverenga bhuku rose.',
      'Choose a language available in your browser. Available languages depend on the voices installed on this device.': 'Sarudza mutauro unowanikwa mubrowser. Mitauro iripo inoenderana nemanzwi akaiswa pamudziyo uyu.',
      'Main navigation': 'Menyu huru', 'from this device': 'kubva pamudziyo uyu', Preview: 'Teerera',
      'No browser voices available': 'Hapana manzwi ebrowser aripo',
      'Allow usage analytics?': 'Unobvumira analytics yekushandiswa here?',
      'Google Analytics records visits and basic feature use after you allow it. NovelSync does not send book text, filenames, or reading position.': 'Google Analytics inorekodha kushanya nekushandiswa kwezvimwe zvinhu kana waibvumira. NovelSync haitumiri mashoko ebhuku, mazita emafaira kana nzvimbo yawasvika.',
      'Allow analytics': 'Bvumira analytics', 'No thanks': 'Kwete, mazvita', 'Privacy and analytics': 'Zvekuvanzika neanalytics',
      'Character voices can be assigned below.': 'Unogona kugovera izwi remutambi pazasi.',
      'Saved reading bookmarks': 'Zviratidzo zvekuverenga zvakachengetwa',
      'Every Story Deserves a Voice.': 'Nyaya Yese Inokodzera Kuva Neizwi.',
      'Phase Three': 'Chikamu chechitatu', 'Listen to your books with browser voices.': 'Teerera kumabhuku ako uchishandisa manzwi ebrowser.',
      'Upload a readable book file. NovelSync saves it and your reading position in a private library on this device.': 'Isa bhuku rinoverengeka. NovelSync inochengeta bhuku nenzvimbo yawasvika muraibhurari yakavanzika pamudziyo uyu.',
      'Upload a book or text file': 'Isa bhuku kana faira remashoko',
      'Supported files: TXT, EPUB, PDF, DOCX, RTF, HTML, Markdown, FB2, ODT, and XML': 'Mafaira anotsigirwa: TXT, EPUB, PDF, DOCX, RTF, HTML, Markdown, FB2, ODT neXML',
      'On this device': 'Pamudziyo uyu', 'My Library': 'Raibhurari yangu',
      Saved: 'Zvachengetwa',
      'Your uploaded books will appear here and stay on this device.': 'Mabhuku aunoisa achaonekwa pano uye acharamba ari pamudziyo uyu.',
      'Currently open': 'Rakavhurwa parizvino', Open: 'Vhura', 'Open again': 'Vhura zvakare', Remove: 'Bvisa',
      'Reading flow': 'Mafambiro ekuverenga', 'Chapter navigation': 'Kufamba pakati pezvitsauko',
      'Upload a novel to build a chapter guide.': 'Isa bhuku kuti ugadzire gwara rezvitsauko.',
      'Voice assignment': 'Kugovera manzwi', 'Automatic voice mapping': 'Kugovera manzwi otomatiki',
      'Auto assign': 'Govera otomatiki', 'Narrator voice': 'Izwi remuverengi', 'Add a character': 'Wedzera mutambi',
      'Each identified character gets a separate browser voice when enough voices are available. You can change any character’s voice below.': 'Mutambi mumwe nemumwe anopiwa izwi rakasiyana rebrowser kana paine manzwi akakwana. Unogona kuchinja izwi remutambi pazasi.',
      'Enter character name': 'Nyora zita remutambi', Add: 'Wedzera',
      'Upload a novel first to add and assign character voices.': 'Tanga waisa bhuku kuti uwedzere vatambi uye ugovagovera manzwi.',
      'No character names detected yet. Add a character above to assign a voice manually.': 'Hapana mazita evatambi awanikwa. Wedzera mutambi pamusoro kuti umugovere izwi.',
      'Emotion mapping': 'Kuziva manzwiro', 'Detected expressions': 'Mashoko anoratidza manzwiro',
      'Upload a novel to detect emotional phrasing.': 'Isa bhuku kuti uwane mashoko anoratidza manzwiro.',
      'Character registry': 'Rondedzero yevatambi', 'Characters in this book': 'Vatambi vari mubhuku rino', 'dialogue lines': 'mitsara yenhaurirano',
      'No characters detected yet.': 'Hapana vatambi vawanikwa.', 'Dialogue review': 'Kuongorora nhaurirano',
      'Speaker assignments': 'Kugovera vatauri', Speaker: 'Mutauri', Unknown: 'Hazvizivikanwi',
      'Upload a novel to detect dialogue and speakers.': 'Isa bhuku kuti uwane nhaurirano nevatauri.',
      Ready: 'Zvakagadzirira', Playing: 'Iri kuverengwa', Paused: 'Yambomira', 'No book loaded': 'Hapana bhuku raiswa',
      Play: 'Tanga', Pause: 'Misa zvishoma', Resume: 'Enderera', Stop: 'Misa', Speed: 'Kumhanya', More: 'Zvimwe', 'Close book': 'Vhara bhuku',
      'Remove bookmark': 'Bvisa chiratidzo', 'Bookmark segment': 'Isa chiratidzo pachikamu', 'Resume last': 'Enderera pawakapedzisira',
      'Reset progress': 'Tangazve kubva pakutanga', 'Export backup': 'Bvisa kopi yekuchengetedza', 'Import backup': 'Isa kopi yekuchengetedza',
      'Reading view': 'Maonero ekuverenga', 'Your reading space': 'Nzvimbo yako yekuverengera',
      'No novel loaded yet.': 'Hapana bhuku raiswa.', 'Upload a supported book or text file to view and listen to it.': 'Isa bhuku kana faira remashoko rinotsigirwa kuti urione nekuriteerera.',
      'No bookmarks yet. Save a spot in the current segment.': 'Hapana zviratidzo parizvino. Chengetedza nzvimbo muchikamu chauri kuverenga.',
      'Choose where to start': 'Sarudza paunoda kutangira', 'Choose reading start segment': 'Sarudza chikamu chekutangira kuverenga', 'Start here': 'Tanga pano',
      'words across': 'mazwi muzvikamu', 'speech segments': 'zvikamu zvekuteerera', 'Ready to read': 'Zvakagadzirira kuverenga',
      book: 'bhuku', books: 'mabhuku', saved: 'zvachengetwa', bookmark: 'chiratidzo', bookmarks: 'zviratidzo',
      'Last position': 'Nzvimbo yekupedzisira', 'Full text': 'Chinyorwa chose', Segment: 'Chikamu', of: 'pa', says: 'anoti',
      Narration: 'Kurondedzera', Neutral: 'Zvakajairika', Angry: 'Hasha', Soft: 'Zvinyoronyoro', Sad: 'Kusuwa', Excited: 'Mufaro mukuru', Nervous: 'Kutya', Calm: 'Kudzikama',
    },
  },
  nd: {
    name: 'isiNdebele',
    translations: {
      Language: 'Ulimi', Reader: 'Ukubala', Controls: 'Izilawuli', Dialogue: 'Ingxoxo', Voices: 'Amazwi',
      'Narrator language': 'Ulimi lwelizwi lomlandisi',
      'Voice options': 'Okukhethwa kwelizwi',
      'One narrator voice reads the entire book.': 'Ilizwi elilodwa lomlandisi libala ibhuku lonke.',
      'Choose a language available in your browser. Available languages depend on the voices installed on this device.': 'Khetha ulimi olukhona kusiphequluli. Izilimi ezikhona zincike emazwini afakwe kule divayisi.',
      'Main navigation': 'Imenyu enkulu', 'from this device': 'kule divayisi', Preview: 'Lalela',
      'No browser voices available': 'Akulamazwi esiphequluli akhona',
      'Allow usage analytics?': 'Uyavumela ukuhlaziywa kokusetshenziswa?',
      'Google Analytics records visits and basic feature use after you allow it. NovelSync does not send book text, filenames, or reading position.': 'I-Google Analytics ibhala ukuvakashelwa lokusetshenziswa kwezinto ezithile nxa uyivumela. I-NovelSync ayithumeli umbhalo webhuku, amabizo amafayela kumbe indawo ofike kuyo.',
      'Allow analytics': 'Vumela ukuhlaziywa', 'No thanks': 'Hatshi, ngiyabonga', 'Privacy and analytics': 'Ubumfihlo lokuhlaziywa',
      'Character voices can be assigned below.': 'Ungabela umlingiswa ngamunye ilizwi ngezansi.',
      'Saved reading bookmarks': 'Izimpawu zokubala ezigciniweyo',
      'Every Story Deserves a Voice.': 'Indaba ngayinye ifanele ukuba lelizwi.',
      'Phase Three': 'Isigaba sesithathu', 'Listen to your books with browser voices.': 'Lalela amabhuku akho usebenzisa amazwi esiphequluli.',
      'Upload a readable book file. NovelSync saves it and your reading position in a private library on this device.': 'Faka ifayela lebhuku elifundekayo. I-NovelSync igcina ibhuku lendawo ofike kuyo kulabhulali eyimfihlo kule divayisi.',
      'Upload a book or text file': 'Faka ibhuku kumbe ifayela lombhalo',
      'Supported files: TXT, EPUB, PDF, DOCX, RTF, HTML, Markdown, FB2, ODT, and XML': 'Amafayela avunyelwayo: TXT, EPUB, PDF, DOCX, RTF, HTML, Markdown, FB2, ODT leXML',
      'On this device': 'Kule divayisi', 'My Library': 'Ilabhulali yami',
      Saved: 'Kugciniwe',
      'Your uploaded books will appear here and stay on this device.': 'Amabhuku owafakileyo azavela lapha ahlale kule divayisi.',
      'Currently open': 'Livuliwe khathesi', Open: 'Vula', 'Open again': 'Vula futhi', Remove: 'Susa',
      'Reading flow': 'Ukuqhubeka kokubala', 'Chapter navigation': 'Ukuya ezahlukweni',
      'Upload a novel to build a chapter guide.': 'Faka ibhuku ukuze wenze uluhlu lwezahluko.',
      'Voice assignment': 'Ukwabela amazwi', 'Automatic voice mapping': 'Ukwabela amazwi ngokuzenzakalela',
      'Auto assign': 'Yabela ngokuzenzakalela', 'Narrator voice': 'Ilizwi lomlandisi', 'Add a character': 'Faka umlingiswa',
      'Each identified character gets a separate browser voice when enough voices are available. You can change any character’s voice below.': 'Umlingiswa ngamunye uthola ilizwi elihlukileyo lesiphequluli nxa kulamazwi anele. Ungatshintsha ilizwi lomlingiswa ngezansi.',
      'Enter character name': 'Faka ibizo lomlingiswa', Add: 'Faka',
      'Upload a novel first to add and assign character voices.': 'Qala ngokufaka ibhuku ukuze ufake abalingiswa ubabele amazwi.',
      'No character names detected yet. Add a character above to assign a voice manually.': 'Akutholakalanga amabizo abalingiswa. Faka umlingiswa phezulu umabele ilizwi.',
      'Emotion mapping': 'Ukuhlonza imizwa', 'Detected expressions': 'Amazwi atshengisa imizwa',
      'Upload a novel to detect emotional phrasing.': 'Faka ibhuku ukuze kutholakale amazwi atshengisa imizwa.',
      'Character registry': 'Uluhlu lwabalingiswa', 'Characters in this book': 'Abalingiswa ababhukwini leli', 'dialogue lines': 'imigqa yengxoxo',
      'No characters detected yet.': 'Akutholakalanga abalingiswa.', 'Dialogue review': 'Ukuhlola ingxoxo',
      'Speaker assignments': 'Ukwabela abakhulumayo', Speaker: 'Okhulumayo', Unknown: 'Akwaziwa',
      'Upload a novel to detect dialogue and speakers.': 'Faka ibhuku ukuze kutholakale ingxoxo labakhulumayo.',
      Ready: 'Kulungile', Playing: 'Kuyafundwa', Paused: 'Kumiswe kancane', 'No book loaded': 'Akukho bhuku elifakiweyo',
      Play: 'Qalisa', Pause: 'Misa kancane', Resume: 'Qhubeka', Stop: 'Misa', Speed: 'Isivinini', More: 'Okunye', 'Close book': 'Vala ibhuku',
      'Remove bookmark': 'Susa uphawu', 'Bookmark segment': 'Faka uphawu esigabeni', 'Resume last': 'Qhubeka lapho ogcine khona',
      'Reset progress': 'Buyisela ekuqaleni', 'Export backup': 'Thumela ikhophi yokulondoloza', 'Import backup': 'Faka ikhophi yokulondoloza',
      'Reading view': 'Indlela yokubala', 'Your reading space': 'Indawo yakho yokubalela',
      'No novel loaded yet.': 'Akukafakwa bhuku.', 'Upload a supported book or text file to view and listen to it.': 'Faka ibhuku kumbe ifayela lombhalo elivunyelweyo ukuze ulibone ulalele.',
      'No bookmarks yet. Save a spot in the current segment.': 'Akula zimpawu okwamanje. Gcina indawo esigabeni osibalayo.',
      'Choose where to start': 'Khetha lapho oqala khona', 'Choose reading start segment': 'Khetha ingxenye yokuqala', 'Start here': 'Qalisa lapha',
      'words across': 'amagama ezigabeni', 'speech segments': 'izingxenye zokulalela', 'Ready to read': 'Kulungelwe ukubala',
      book: 'ibhuku', books: 'amabhuku', saved: 'kugciniwe', bookmark: 'uphawu', bookmarks: 'izimpawu',
      'Last position': 'Indawo yokucina', 'Full text': 'Umbhalo wonke', Segment: 'Ingxenye', of: 'ku', says: 'uthi',
      Narration: 'Ukulandisa', Neutral: 'Okuvamileyo', Angry: 'Ulaka', Soft: 'Phansi', Sad: 'Usizi', Excited: 'Injabulo', Nervous: 'Ukwesaba', Calm: 'Ukwehlisa umoya',
    },
  },
};

function translateUi(language, text) {
  return UI_LANGUAGES[language]?.translations[text] || text;
}

function getVoiceLanguageLabel(languageCode) {
  try {
    const languageName = new Intl.DisplayNames([languageCode], { type: 'language' }).of(languageCode);
    return languageName && languageName !== languageCode
      ? `${languageName} (${languageCode})`
      : languageCode;
  } catch {
    return languageCode;
  }
}

function splitTextIntoSegments(text) {
  if (!text || !text.trim()) {
    return [];
  }

  const normalized = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    return [];
  }

  const blocks = normalized
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments = [];
  let current = '';

  blocks.forEach((block) => {
    // Keep even a single oversized paragraph within the speech segment limit.
    if (block.length > SEGMENT_SIZE) {
      if (current) {
        segments.push(current.trim());
        current = '';
      }

      let remainder = block;
      while (remainder.length > SEGMENT_SIZE) {
        let splitAt = remainder.lastIndexOf(' ', SEGMENT_SIZE);
        if (splitAt < SEGMENT_SIZE * 0.6) splitAt = SEGMENT_SIZE;
        segments.push(remainder.slice(0, splitAt).trim());
        remainder = remainder.slice(splitAt).trim();
      }
      current = remainder;
      return;
    }

    const candidate = current ? `${current} ${block}` : block;

    if (candidate.length > SEGMENT_SIZE && current) {
      segments.push(current.trim());
      current = block;
      return;
    }

    current = candidate;
  });

  if (current.trim()) {
    segments.push(current.trim());
  }

  return segments;
}

function prepareSpeechText(text) {
  return text
    .replace(/[\/\\|]+/g, ' ')
    .replace(/[\p{S}\p{C}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSpeechUnits(text) {
  return text.split(/(?<=[.!?])\s+/).map((unit) => unit.trim()).filter(Boolean);
}

function isLikelyFemaleVoice(voice) {
  return /(female|samantha|victoria|karen|zira|aria|jenny|ava|susan|hazel|serena|moira|tessa|sara|eva|allison|siri.*female)/i.test(voice.name);
}

function getPreferredNarratorVoice(voices) {
  const englishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
  const candidates = englishVoices.length ? englishVoices : voices;
  const scoreVoice = (voice) => {
    let score = 0;
    if (isLikelyFemaleVoice(voice)) score += 4;
    if (/(natural|neural|online|enhanced|premium)/i.test(voice.name)) score += 5;
    if (voice.localService === false) score += 1;
    return score;
  };
  return [...candidates].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}

function buildCharacterRegistry(entries) {
  return entries.reduce((registry, entry) => {
    if (!entry.speaker || entry.speaker === 'Unknown') {
      return registry;
    }

    const lowerName = entry.speaker.trim();
    const current = registry[lowerName] || { name: lowerName, count: 0 };
    current.count += 1;
    registry[lowerName] = current;
    return registry;
  }, {});
}

function buildChapterList(segments) {
  if (!segments.length) {
    return [{ label: 'Full text', start: 0, end: 0 }];
  }

  const chapters = [];
  let currentStart = 0;
  let currentLabel = 'Full text';

  segments.forEach((segment, index) => {
    const trimmed = segment.trim();
    if (/^(chapter|part|scene)\s+\d+\b/i.test(trimmed) || /^(prologue|epilogue)\b/i.test(trimmed)) {
      if (chapters.length) {
        chapters[chapters.length - 1].end = index - 1;
      }

      currentLabel = trimmed.length > 44 ? `${trimmed.slice(0, 41)}...` : trimmed;
      currentStart = index;
      chapters.push({ label: currentLabel, start: currentStart, end: segments.length - 1 });
    }
  });

  if (!chapters.length) {
    chapters.push({ label: 'Full text', start: 0, end: segments.length - 1 });
  }

  chapters[chapters.length - 1].end = segments.length - 1;
  return chapters;
}

const EMOTION_MAP = [
  {
    label: 'Angry',
    patterns: [/shouted angrily/i, /angrily/i, /furiously/i, /with rage/i],
    rate: 1.1,
    pitch: 1.5,
    volume: 1.2,
  },
  {
    label: 'Soft',
    patterns: [/whispered softly/i, /softly/i, /quietly/i],
    rate: 0.8,
    pitch: 0.9,
    volume: 0.8,
  },
  {
    label: 'Sad',
    patterns: [/replied sadly/i, /sadly/i, /tearfully/i, /with sadness/i],
    rate: 0.85,
    pitch: 0.8,
    volume: 0.95,
  },
  {
    label: 'Excited',
    patterns: [/exclaimed excitedly/i, /excitedly/i, /eagerly/i, /joyfully/i],
    rate: 1.25,
    pitch: 1.35,
    volume: 1.1,
  },
  {
    label: 'Nervous',
    patterns: [/asked nervously/i, /nervously/i, /anxiously/i, /hesitantly/i],
    rate: 0.9,
    pitch: 1.2,
    volume: 0.9,
  },
  {
    label: 'Calm',
    patterns: [/said calmly/i, /calmly/i, /gently/i, /steadily/i],
    rate: 0.95,
    pitch: 1,
    volume: 0.9,
  },
];

function detectEmotion(segment) {
  const matchedEmotion = EMOTION_MAP.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(segment)),
  );

  return matchedEmotion || { label: 'Neutral', rate: 1, pitch: 1, volume: 1 };
}

function normalizeSpeakerName(name) {
  return (name || '').replace(/["\u201c\u201d\u2018\u2019]/g, '').trim();
}

function extractDialogueEntries(text) {
  const normalized = text.replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const entries = [];
  const seen = new Set();
  const verbs = '(?:said|asked|replied|shouted|whispered|exclaimed|muttered|yelled|answered|called|cried|declared|remarked|added|continued|began|screamed|murmured|hissed|sighed|warned|promised|insisted|threatened)';
  const name = "([\\p{Lu}][\\p{L}'-]*(?:\\s+[\\p{Lu}][\\p{L}'-]*)*)";
  const openingQuote = '["\\u201c\\u00ab\\u2018]';
  const closingQuote = '["\\u201d\\u00bb\\u2019]';
  const quoteBody = '([^"\\u201c\\u201d\\u00bb\\u2018\\u2019]+)';
  const beforeQuote = new RegExp(name + '\\s+' + verbs + '\\s*,?\\s*' + openingQuote + quoteBody + closingQuote, 'gu');
  const afterQuote = new RegExp(openingQuote + quoteBody + closingQuote + '\\s*,?\\s*' + verbs + '\\s+' + name + '(?=[,.!?;:]|\\s|$)', 'gu');
  const colonBeforeQuote = new RegExp(name + '\\s*:\\s*' + openingQuote + quoteBody + closingQuote, 'gu');
  const parentheticalAfterQuote = new RegExp(openingQuote + quoteBody + closingQuote + '\\s*\\(\\s*' + name + '\\s*\\)', 'gu');

  const addEntry = (quote, speaker = 'Unknown') => {
    const cleanedQuote = quote.replace(/\s+/g, ' ').trim();
    if (!cleanedQuote) return;
    const normalizedSpeaker = normalizeSpeakerName(speaker) || 'Unknown';
    const key = normalizedSpeaker + '|' + cleanedQuote;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ id: entries.length + '-' + cleanedQuote.slice(0, 24), text: cleanedQuote, speaker: normalizedSpeaker });
  };

  for (const match of normalized.matchAll(beforeQuote)) addEntry(match[2], match[1]);
  for (const match of normalized.matchAll(afterQuote)) addEntry(match[1], match[3]);
  for (const match of normalized.matchAll(colonBeforeQuote)) addEntry(match[2], match[1]);
  for (const match of normalized.matchAll(parentheticalAfterQuote)) addEntry(match[1], match[2]);
  for (const match of normalized.matchAll(/["\u201c\u00ab\u2018]([^"\u201c\u201d\u00bb\u2018\u2019]+)["\u201d\u00bb\u2019]/gu)) {
    const quote = match[1].replace(/\s+/g, ' ').trim();
    if (quote && !entries.some((entry) => entry.text === quote)) addEntry(quote);
  }

  return entries;
}

function App() {
  const [analyticsConsent, setAnalyticsConsent] = useState(() => {
    try {
      return window.localStorage.getItem('novelsync-analytics-consent');
    } catch {
      return null;
    }
  });
  const [uiLanguage, setUiLanguage] = useState(() => {
    const savedLanguage = window.localStorage.getItem('novelsync-ui-language');
    return UI_LANGUAGES[savedLanguage] ? savedLanguage : 'en';
  });
  const t = (label) => translateUi(uiLanguage, label);
  const [fileName, setFileName] = useState('');
  const [text, setText] = useState('');
  const [segments, setSegments] = useState([]);
  const [dialogueEntries, setDialogueEntries] = useState([]);
  const [characterRegistry, setCharacterRegistry] = useState({});
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [readSpeed, setReadSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState([]);
  const [narratorVoiceName, setNarratorVoiceName] = useState('');
  const [narratorVoiceExplicit, setNarratorVoiceExplicit] = useState(false);
  const [characterVoiceMap, setCharacterVoiceMap] = useState({});
  const [manualCharacterName, setManualCharacterName] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [resumeIndex, setResumeIndex] = useState(null);
  const [bookKey, setBookKey] = useState('');
  const [libraryBooks, setLibraryBooks] = useState([]);

  const speechSynthRef = useRef(null);
  const activeUtteranceRef = useRef(null);
  const narratorVoiceNameRef = useRef(narratorVoiceName);
  const controlMoreRef = useRef(null);
  const activeSegmentRef = useRef(null);
  const playbackRunRef = useRef(0);
  const savedSessionRef = useRef(null);
  const analyticsRef = useRef(null);
  const analyticsConsentRef = useRef(analyticsConsent);
  analyticsConsentRef.current = analyticsConsent;

  const trackUsage = (eventName, parameters = {}) => {
    analyticsRef.current?.logEvent(eventName, parameters);
  };

  const trackInterfaceTap = (event) => {
    const control = event.target.closest('button, a, summary, input, select, [role="button"]');
    if (!control || control.closest('.analytics-consent')) return;

    const featureArea = control.closest('.player-controls, .compact-speed') ? 'playback'
      : control.closest('.control-more') ? 'reader_tools'
        : control.closest('.upload-box') ? 'upload'
          : control.closest('.library-panel') ? 'library'
            : control.closest('.chapter-panel') ? 'chapter_navigation'
              : control.closest('#voice-assignment') ? 'voice_settings'
                : control.closest('#dialogue') ? 'dialogue_review'
                  : control.closest('.reader') ? 'reading_view'
                    : control.closest('.nav') ? 'navigation'
                      : null;

    if (featureArea) trackUsage('feature_interaction', { feature_area: featureArea });
  };

  const chooseAnalytics = (choice) => {
    try {
      window.localStorage.setItem('novelsync-analytics-consent', choice);
    } catch {
      // Keep the current choice in memory if browser storage is unavailable.
    }
    setAnalyticsConsent(choice);
  };

  const reopenAnalyticsSettings = () => {
    try {
      window.localStorage.removeItem('novelsync-analytics-consent');
    } catch {
      // The consent notice can still be reopened for this session.
    }
    setAnalyticsConsent(null);
  };

  useEffect(() => {
    if (analyticsConsent !== 'accepted') return undefined;

    let active = true;
    loadFirebaseAnalyticsModule()
      .then(({ initializeNovelSyncAnalytics }) => initializeNovelSyncAnalytics())
      .then((analytics) => {
        if (active) {
          analytics?.setCollectionEnabled(true);
          analyticsRef.current = analytics;
        } else if (analyticsConsentRef.current !== 'accepted') {
          analytics?.setCollectionEnabled(false);
        }
      })
      .catch((analyticsError) => {
        console.warn('NovelSync analytics could not start.', analyticsError);
      });

    return () => {
      active = false;
      analyticsRef.current?.setCollectionEnabled(false);
      analyticsRef.current = null;
    };
  }, [analyticsConsent]);

  useEffect(() => {
    window.localStorage.setItem('novelsync-ui-language', uiLanguage);
  }, [uiLanguage]);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      speechSynthRef.current = window.speechSynthesis;

      const syncVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);

        if (!narratorVoiceExplicit && availableVoices.length) {
          const preferredVoice = getPreferredNarratorVoice(availableVoices);
          if (preferredVoice) setNarratorVoiceName(preferredVoice.name);
        }
      };

      syncVoices();
      window.speechSynthesis.addEventListener('voiceschanged', syncVoices);

      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', syncVoices);
      };
    }

    return undefined;
  }, [narratorVoiceExplicit]);

  const segmentSummary = useMemo(() => {
    const totalWords = text.split(/\s+/).filter(Boolean).length;
    return totalWords
      ? `${totalWords} ${t('words across')} ${segments.length} ${t('speech segments')}`
      : t('Ready to read');
  }, [text, segments, uiLanguage]);

  const detectedCharacters = useMemo(
    () => Object.values(characterRegistry).sort((a, b) => b.count - a.count),
    [characterRegistry],
  );

  const availableVoices = useMemo(() => voices, [voices]);
  const narratorLanguageOptions = useMemo(
    () => [...new Set(availableVoices.map((voice) => voice.lang).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [availableVoices],
  );
  const narratorLanguage = availableVoices.find((voice) => voice.name === narratorVoiceName)?.lang
    || narratorLanguageOptions[0]
    || '';
  const narratorLanguageVoices = narratorLanguage
    ? availableVoices.filter((voice) => voice.lang === narratorLanguage)
    : availableVoices;
  const isBookmarked = bookmarks.some((bookmark) => bookmark.index === currentSegmentIndex);
  const currentChapter = chapters.find((chapter) => currentSegmentIndex >= chapter.start && currentSegmentIndex <= chapter.end) || chapters[0];

  useEffect(() => {
    narratorVoiceNameRef.current = narratorVoiceName;
  }, [narratorVoiceName]);

  useEffect(() => {
    if (isPlaying) {
      activeSegmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentSegmentIndex, isPlaying]);

  useEffect(() => {
    const closeMoreMenu = (event) => {
      const menu = controlMoreRef.current;
      if (!menu?.open) return;
      if (event.type === 'keydown' && event.key === 'Escape') {
        menu.open = false;
      } else if (event.type === 'pointerdown' && !menu.contains(event.target)) {
        menu.open = false;
      }
    };

    document.addEventListener('pointerdown', closeMoreMenu);
    document.addEventListener('keydown', closeMoreMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMoreMenu);
      document.removeEventListener('keydown', closeMoreMenu);
    };
  }, []);

  useEffect(() => {
    const savedState = window.localStorage.getItem('novelsync-reader-state');
    if (!savedState) {
      return;
    }

    try {
      const parsed = JSON.parse(savedState);
      savedSessionRef.current = parsed;
      if (parsed.readSpeed) setReadSpeed(parsed.readSpeed);
      if (parsed.narratorVoiceName && parsed.narratorVoiceExplicit) {
        setNarratorVoiceName(parsed.narratorVoiceName);
        setNarratorVoiceExplicit(true);
      }
      if (parsed.characterVoiceMap) setCharacterVoiceMap(parsed.characterVoiceMap);
      if (parsed.bookmarks) setBookmarks(parsed.bookmarks);
      if (typeof parsed.resumeIndex === 'number') setResumeIndex(parsed.resumeIndex);
    } catch (storageError) {
      console.error(storageError);
    }
  }, []);

  useEffect(() => {
    const payload = {
      readSpeed,
      narratorVoiceName,
      narratorVoiceExplicit,
      characterVoiceMap,
      bookmarks,
      resumeIndex,
      bookKey,
    };

    window.localStorage.setItem('novelsync-reader-state', JSON.stringify(payload));
  }, [readSpeed, narratorVoiceName, narratorVoiceExplicit, characterVoiceMap, bookmarks, resumeIndex, bookKey]);

  useEffect(() => {
    let active = true;
    const restoreLibrary = async () => {
      try {
        const storedBooks = await listStoredBooks();
        if (!active) return;
        setLibraryBooks(storedBooks);
        const savedKey = savedSessionRef.current?.bookKey;
        const lastBook = storedBooks.find((book) => book.key === savedKey);
        if (lastBook) {
          const storedText = await getStoredBookText(lastBook.key);
          if (active && storedText) await loadBookContent(lastBook.name, storedText, lastBook.key);
        }
      } catch (storageError) {
        if (active) setError(storageError.message || 'Could not open the on-device book library.');
      }
    };
    restoreLibrary();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!bookKey || !text) return;
    saveStoredProgress(bookKey, resumeIndex ?? currentSegmentIndex, bookmarks).catch((storageError) => {
      setError(storageError.message || 'Could not save this book’s reading progress.');
    });
  }, [bookKey, text, resumeIndex, currentSegmentIndex, bookmarks]);

  const stopPlayback = () => {
    playbackRunRef.current += 1;
    if (speechSynthRef.current) {
      speechSynthRef.current.cancel();
    }

    activeUtteranceRef.current = null;
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handleSpeakerCorrection = (entryId, nextSpeaker) => {
    setDialogueEntries((previous) =>
      previous.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              speaker: nextSpeaker,
            }
          : entry,
      ),
    );
  };

  const handleAddCharacter = (event) => {
    event.preventDefault();
    const name = manualCharacterName.trim();
    if (!name || !text) return;

    const existingName = detectedCharacters.find((character) => character.name.toLowerCase() === name.toLowerCase());
    if (existingName) {
      setManualCharacterName('');
      return;
    }

    setCharacterRegistry((previous) => ({
      ...previous,
      [name]: { name, count: 0 },
    }));
    setManualCharacterName('');
  };

  const getVoiceObjectByName = (voiceName) => {
    if (!voiceName) {
      return availableVoices[0] || null;
    }

    return availableVoices.find((voice) => voice.name === voiceName) || availableVoices[0] || null;
  };

  const applyAutomaticVoiceAssignment = (characters, force = false) => {
    if (!availableVoices.length) {
      return;
    }

    const narrator = getPreferredNarratorVoice(availableVoices);
    if (narrator && !narratorVoiceExplicit) {
      setNarratorVoiceName(narrator.name);
    }

    const englishVoices = availableVoices.filter((voice) => voice.lang?.toLowerCase().startsWith('en'));
    const orderedVoices = [...englishVoices, ...availableVoices.filter((voice) => !englishVoices.includes(voice))];
    const uniqueVoices = [...new Map(orderedVoices.map((voice) => [voice.name, voice])).values()];
    const narratorName = narratorVoiceName || getPreferredNarratorVoice(availableVoices)?.name;
    const characterVoices = uniqueVoices.filter((voice) => voice.name !== narratorName);
    const availableCharacterVoices = characterVoices.length ? characterVoices : uniqueVoices;

    const nextCharacterMap = force ? {} : { ...characterVoiceMap };
    const usedVoiceNames = new Set();
    characters.forEach((character, index) => {
      const savedVoiceName = force ? '' : nextCharacterMap[character.name];
      const savedVoiceIsAvailable = availableCharacterVoices.some((voice) => voice.name === savedVoiceName);
      const voice = savedVoiceIsAvailable && !usedVoiceNames.has(savedVoiceName)
        ? availableCharacterVoices.find((candidate) => candidate.name === savedVoiceName)
        : availableCharacterVoices.find((candidate) => !usedVoiceNames.has(candidate.name))
          || availableCharacterVoices[index % availableCharacterVoices.length]
          || availableVoices[0];
      if (voice) {
        nextCharacterMap[character.name] = voice.name;
        usedVoiceNames.add(voice.name);
      }
    });

    const hasChanges = characters.some((character) => nextCharacterMap[character.name] !== characterVoiceMap[character.name]);
    if (hasChanges || force) setCharacterVoiceMap(nextCharacterMap);
  };

  useEffect(() => {
    if (!availableVoices.length || !detectedCharacters.length) return;
    const narratorName = narratorVoiceName || getPreferredNarratorVoice(availableVoices)?.name;
    const characterVoiceCount = new Set(availableVoices.map((voice) => voice.name).filter((name) => name !== narratorName)).size;
    const assignedVoiceNames = detectedCharacters.map((character) => characterVoiceMap[character.name]).filter(Boolean);
    const hasDuplicateAssignments = assignedVoiceNames.length > new Set(assignedVoiceNames).size;
    const hasMissingAssignments = detectedCharacters.some((character) =>
      !characterVoiceMap[character.name] || !availableVoices.some((voice) => voice.name === characterVoiceMap[character.name]),
    );
    if (hasMissingAssignments || (characterVoiceCount > 1 && hasDuplicateAssignments)) {
      applyAutomaticVoiceAssignment(detectedCharacters);
    }
  }, [availableVoices, detectedCharacters, characterVoiceMap, narratorVoiceName]);

  const previewVoice = (voiceName, label = 'Voice') => {
    if (!('speechSynthesis' in window) || !voiceName) {
      setError('No browser voice is available for preview yet.');
      return;
    }

    const selectedVoice = getVoiceObjectByName(voiceName);
    if (!selectedVoice) {
      return;
    }

    const preview = new SpeechSynthesisUtterance(`This is a preview for ${label}.`);
    preview.voice = selectedVoice;
    preview.lang = selectedVoice.lang;
    preview.rate = 1;
    preview.pitch = 1;
    preview.volume = 1;

    playbackRunRef.current += 1;
    speechSynthRef.current.cancel();
    speechSynthRef.current.speak(preview);
  };

  const refreshLibrary = async () => {
    setLibraryBooks(await listStoredBooks());
  };

  const loadBookContent = async (name, bookText, key) => {
    const chunkedText = splitTextIntoSegments(bookText);
    if (!chunkedText.length) throw new Error('This book does not contain readable text.');

    const parsedEntries = extractDialogueEntries(bookText);
    const parsedCharacters = Object.values(buildCharacterRegistry(parsedEntries));
    const savedSession = savedSessionRef.current;
    const progress = await getStoredProgress(key);
    const isSameBook = savedSession?.bookKey === key;
    const requestedIndex = isSameBook && Number.isInteger(savedSession.resumeIndex)
      ? savedSession.resumeIndex
      : progress?.resumeIndex;
    const savedIndex = Number.isInteger(requestedIndex)
      ? Math.min(Math.max(requestedIndex, 0), chunkedText.length - 1)
      : null;
    const requestedBookmarks = isSameBook && Array.isArray(savedSession.bookmarks)
      ? savedSession.bookmarks
      : progress?.bookmarks;
    const savedBookmarks = Array.isArray(requestedBookmarks)
      ? requestedBookmarks.filter((bookmark) => Number.isInteger(bookmark.index) && bookmark.index >= 0 && bookmark.index < chunkedText.length)
      : [];

    stopPlayback();
    setBookKey(key);
    setFileName(name);
    setText(bookText);
    setSegments(chunkedText);
    setChapters(buildChapterList(chunkedText));
    setDialogueEntries(parsedEntries);
    setCharacterRegistry(buildCharacterRegistry(parsedEntries));
    setResumeIndex(savedIndex);
    setCurrentSegmentIndex(savedIndex ?? 0);
    setBookmarks(savedBookmarks);
    savedSessionRef.current = { ...savedSession, bookKey: key, resumeIndex: savedIndex, bookmarks: savedBookmarks };
    setError('');
    applyAutomaticVoiceAssignment(parsedCharacters);
  };

  const openLibraryBook = async (book) => {
    try {
      const storedText = await getStoredBookText(book.key);
      if (!storedText) throw new Error('The saved book text could not be found.');
      await loadBookContent(book.name, storedText, book.key);
      trackUsage('book_opened', { source: 'library' });
    } catch (storageError) {
      setError(storageError.message || 'Could not open this saved book.');
    }
  };

  const removeLibraryBook = async (book) => {
    if (!window.confirm(`Remove “${book.name}” and its saved progress from this device?`)) return;
    try {
      await removeStoredBook(book.key);
      await refreshLibrary();
      if (bookKey === book.key) {
        setBookKey('');
        setResumeIndex(null);
      }
    } catch (storageError) {
      setError(storageError.message || 'Could not remove this saved book.');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!SUPPORTED_BOOK_EXTENSIONS.includes(extension)) {
      setError('This file format is not supported. Choose a readable book or text format.');
      event.target.value = '';
      return;
    }

    try {
      const fileText = await extractNovelText(file);
      const nextBookKey = `${file.name}:${file.size}:${file.lastModified}`;
      await loadBookContent(file.name, fileText, nextBookKey);
      trackUsage('book_opened', { source: 'upload' });
      try {
        await saveStoredBook({ key: nextBookKey, name: file.name, updatedAt: Date.now() }, fileText);
        await refreshLibrary();
      } catch (storageError) {
        setError(`Book opened, but could not be saved on this device: ${storageError.message}`);
      }
    } catch (uploadError) {
      setError(uploadError.message || 'The file could not be read. Please try another file.');
      console.error(uploadError);
    } finally {
      event.target.value = '';
    }
  };

  const exportBackup = () => {
    if (!text) return;

    const backup = {
      format: 'novelsync-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      book: { fileName, text, bookKey },
      settings: { readSpeed, narratorVoiceName, narratorVoiceExplicit, characterVoiceMap },
      session: {
        resumeIndex: currentSegmentIndex,
        bookmarks,
        speakers: dialogueEntries.map(({ text: quote, speaker }) => ({ text: quote, speaker })),
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(fileName || 'novelsync-book').replace(/\.txt$/i, '')}-backup.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const backup = JSON.parse(await file.text());
      if (backup.format !== 'novelsync-backup' || backup.version !== 1 || typeof backup.book?.text !== 'string' || !backup.book.text.trim()) {
        throw new Error('This file is not a supported NovelSync backup.');
      }

      const importedText = backup.book.text;
      const importedSegments = splitTextIntoSegments(importedText);
      const parsedEntries = extractDialogueEntries(importedText);
      const speakerOverrides = new Map((Array.isArray(backup.session?.speakers) ? backup.session.speakers : [])
        .filter((entry) => typeof entry.text === 'string' && typeof entry.speaker === 'string')
        .map((entry) => [entry.text, entry.speaker]));
      const restoredEntries = parsedEntries.map((entry) => ({
        ...entry,
        speaker: speakerOverrides.get(entry.text) || entry.speaker,
      }));
      const nextBookKey = typeof backup.book.bookKey === 'string' && backup.book.bookKey
        ? backup.book.bookKey
        : `backup:${file.name}:${file.size}:${file.lastModified}`;
      const maxIndex = Math.max(0, importedSegments.length - 1);
      const savedIndex = Number.isInteger(backup.session?.resumeIndex)
        ? Math.min(Math.max(backup.session.resumeIndex, 0), maxIndex)
        : 0;
      const savedBookmarks = (Array.isArray(backup.session?.bookmarks) ? backup.session.bookmarks : [])
        .filter((bookmark) => Number.isInteger(bookmark.index) && bookmark.index >= 0 && bookmark.index < importedSegments.length)
        .map((bookmark) => ({
          index: bookmark.index,
          label: typeof bookmark.label === 'string' ? bookmark.label : `Segment ${bookmark.index + 1}`,
          preview: typeof bookmark.preview === 'string' ? bookmark.preview : '',
        }));
      const importedName = typeof backup.book.fileName === 'string' ? backup.book.fileName : file.name.replace(/\.json$/i, '.txt');

      stopPlayback();
      setFileName(importedName);
      setText(importedText);
      setSegments(importedSegments);
      setChapters(buildChapterList(importedSegments));
      setDialogueEntries(restoredEntries);
      setCharacterRegistry(buildCharacterRegistry(restoredEntries));
      setBookKey(nextBookKey);
      setCurrentSegmentIndex(savedIndex);
      setResumeIndex(savedIndex);
      setBookmarks(savedBookmarks);

      const settings = backup.settings || {};
      if (Number.isFinite(settings.readSpeed)) setReadSpeed(Math.min(1.8, Math.max(0.6, settings.readSpeed)));
      if (typeof settings.narratorVoiceName === 'string') setNarratorVoiceName(settings.narratorVoiceName);
      setNarratorVoiceExplicit(Boolean(settings.narratorVoiceExplicit));
      if (settings.characterVoiceMap && typeof settings.characterVoiceMap === 'object' && !Array.isArray(settings.characterVoiceMap)) {
        setCharacterVoiceMap(settings.characterVoiceMap);
      }
      savedSessionRef.current = {
        ...settings,
        bookKey: nextBookKey,
        resumeIndex: savedIndex,
        bookmarks: savedBookmarks,
      };
      await saveStoredBook({ key: nextBookKey, name: importedName, updatedAt: Date.now() }, importedText);
      await refreshLibrary();
      setError('');
    } catch (importError) {
      setError(importError.message || 'Could not import this backup file.');
    } finally {
      event.target.value = '';
    }
  };

  const playFromIndex = (startIndex = currentSegmentIndex) => {
    if (!('speechSynthesis' in window)) {
      setError('This browser does not support the Web Speech API.');
      return;
    }

    if (!segments.length) {
      setError('Upload a text file before starting playback.');
      return;
    }

    trackUsage('playback_started');
    const speech = window.speechSynthesis;
    const playbackRun = ++playbackRunRef.current;
    speech.cancel();

    if (segments.length && chapters.length === 0) {
      setChapters(buildChapterList(segments));
    }

    const speakNext = (index, unitIndex = 0) => {
      if (playbackRun !== playbackRunRef.current) return;
      if (index >= segments.length) {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSegmentIndex(segments.length - 1);
        return;
      }

      const speechUnits = splitSpeechUnits(segments[index]);
      if (unitIndex >= speechUnits.length) {
        speakNext(index + 1);
        return;
      }

      const speechUnit = speechUnits[unitIndex];
      const speechText = prepareSpeechText(speechUnit);
      if (!speechText) {
        speakNext(index, unitIndex + 1);
        return;
      }
      const emotion = getSegmentEmotion(speechUnit);
      const utterance = new SpeechSynthesisUtterance(speechText);
      const selectedVoice = getVoiceObjectByName(narratorVoiceNameRef.current);

      utterance.lang = selectedVoice?.lang || 'en-US';
      utterance.rate = readSpeed * emotion.rate;
      utterance.pitch = emotion.pitch;
      utterance.volume = emotion.volume;
      utterance.voice = selectedVoice || null;

      utterance.onstart = () => {
        if (playbackRun !== playbackRunRef.current) return;
        setCurrentSegmentIndex(index);
        setResumeIndex(index);
        setIsPlaying(true);
        setIsPaused(false);
      };

      utterance.onend = () => {
        if (playbackRun !== playbackRunRef.current) return;
        if (unitIndex < speechUnits.length - 1) {
          speakNext(index, unitIndex + 1);
          return;
        }
        if (index < segments.length - 1) {
          speakNext(index + 1);
          return;
        }

        setIsPlaying(false);
        setIsPaused(false);
        setCurrentSegmentIndex(segments.length - 1);
      };

      utterance.onerror = (event) => {
        if (playbackRun !== playbackRunRef.current) return;
        setError(`Playback error: ${event.error}. Try replaying or use a different browser voice.`);
        setIsPlaying(false);
        setIsPaused(false);
      };

      activeUtteranceRef.current = utterance;
      speech.speak(utterance);
    };

    setError('');
    speakNext(startIndex);
  };

  const changeNarratorVoice = (voiceName) => {
    narratorVoiceNameRef.current = voiceName;
    setNarratorVoiceName(voiceName);
    setNarratorVoiceExplicit(true);
  };

  const handlePlay = () => {
    if (!segments.length) {
      setError('Upload a text file before starting playback.');
      return;
    }

    playFromIndex();
  };

  const handlePause = () => {
    if (!speechSynthRef.current) {
      return;
    }

    speechSynthRef.current.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  const handleResume = () => {
    if (!speechSynthRef.current) {
      return;
    }

    speechSynthRef.current.resume();
    setIsPaused(false);
    setIsPlaying(true);
  };

  const handleStop = () => {
    stopPlayback();
  };

  const closeCurrentBook = () => {
    stopPlayback();
    setFileName('');
    setText('');
    setSegments([]);
    setDialogueEntries([]);
    setCharacterRegistry({});
    setCurrentSegmentIndex(0);
    setBookmarks([]);
    setChapters([]);
    setResumeIndex(null);
    setBookKey('');
    setError('');
    savedSessionRef.current = {
      ...savedSessionRef.current,
      bookKey: '',
      resumeIndex: null,
      bookmarks: [],
    };
  };

  const restoreSessionProgress = () => {
    if (resumeIndex === null || resumeIndex < 0 || !segments.length) {
      return;
    }

    setCurrentSegmentIndex(Math.min(resumeIndex, segments.length - 1));
    setError('');
  };

  const clearSessionProgress = () => {
    setResumeIndex(null);
    setCurrentSegmentIndex(0);
    setBookmarks([]);
    if (window.localStorage.getItem('novelsync-reader-state')) {
      window.localStorage.removeItem('novelsync-reader-state');
    }
  };

  const jumpToSegment = (index) => {
    if (!segments.length || index < 0 || index >= segments.length) {
      return;
    }

    setCurrentSegmentIndex(index);
    setResumeIndex(index);
    playbackRunRef.current += 1;
    if (speechSynthRef.current) {
      speechSynthRef.current.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
  };

  const toggleBookmark = () => {
    if (!segments.length) {
      return;
    }

    setBookmarks((previous) => {
      const exists = previous.some((bookmark) => bookmark.index === currentSegmentIndex);

      if (exists) {
        return previous.filter((bookmark) => bookmark.index !== currentSegmentIndex);
      }

      const preview = (segments[currentSegmentIndex] || '').replace(/\s+/g, ' ').trim();
      return [
        ...previous,
        {
          index: currentSegmentIndex,
          label: `Segment ${currentSegmentIndex + 1}`,
          preview: preview ? `${preview.slice(0, 58)}${preview.length > 58 ? '…' : ''}` : 'Current segment',
        },
      ];
    });
  };

  const handleSpeedChange = (event) => {
    const nextSpeed = Number(event.target.value);
    setReadSpeed(nextSpeed);

    if (speechSynthRef.current && isPlaying) {
      const speech = speechSynthRef.current;
      speech.cancel();
      playFromIndex(currentSegmentIndex);
    }
  };

  const getSegmentEmotion = (segment) => detectEmotion(segment);

  const getSegmentSpeaker = (segment) => {
    if (!dialogueEntries.length) {
      return 'Narration';
    }

    const directMatch = dialogueEntries
      .map((entry) => ({ entry, position: segment.indexOf(entry.text) }))
      .filter(({ position }) => position >= 0)
      .sort((first, second) => first.position - second.position)[0]?.entry;
    if (directMatch) return directMatch.speaker && directMatch.speaker !== 'Unknown' ? directMatch.speaker : 'Narration';

    const words = (value) => value.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
    const unitWords = new Set(words(segment).filter((word) => !['said', 'asked', 'replied', 'shouted', 'whispered', 'answered'].includes(word)));
    let bestMatch = null;
    let bestScore = 0;
    dialogueEntries.forEach((entry) => {
      const quoteWords = [...new Set(words(entry.text))];
      const overlap = quoteWords.filter((word) => unitWords.has(word)).length;
      const score = overlap / Math.max(1, Math.min(quoteWords.length, unitWords.size));
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    });

    return bestScore >= 0.5 && bestMatch.speaker !== 'Unknown' ? bestMatch.speaker : 'Narration';
  };

  return (
    <div className="app-shell" onClickCapture={trackInterfaceTap}>
      <header className="topbar">
        <div className="brand" aria-label="NovelSync brand section">
          <div className="brand-mark">N</div>
          <div>
            <h1>NovelSync</h1>
            <p>{t('Every Story Deserves a Voice.')}</p>
          </div>
        </div>

        <nav className="nav" aria-label={t('Main navigation')}>
          <a href="#reader">{t('Reader')}</a>
          <a href="#controls">{t('Controls')}</a>
          <a href="#dialogue">{t('Dialogue')}</a>
          <a href="#voice-assignment">{t('Voices')}</a>
          <label className="language-picker">
            <span>{t('Language')}</span>
            <select value={uiLanguage} onChange={(event) => setUiLanguage(event.target.value)} aria-label={t('Language')}>
              {Object.entries(UI_LANGUAGES).map(([code, language]) => (
                <option key={code} value={code}>{language.name}</option>
              ))}
            </select>
          </label>
        </nav>
      </header>

      <main className="page-layout">
        <section className="hero panel">
          <div className="hero-copy">
            <span className="eyebrow">{t('Phase Three')}</span>
            <h2>{t('Listen to your books with browser voices.')}</h2>
            <p>
              {t('Upload a readable book file. NovelSync saves it and your reading position in a private library on this device.')}
            </p>
          </div>

          <label className="upload-box" htmlFor="novel-upload">
            <input id="novel-upload" type="file" accept={SUPPORTED_BOOK_EXTENSIONS.join(',')} onChange={handleFileUpload} />
            <span className="upload-title">{t('Upload a book or text file')}</span>
            <span className="upload-helper">{t('Supported files: TXT, EPUB, PDF, DOCX, RTF, HTML, Markdown, FB2, ODT, and XML')}</span>
          </label>
        </section>

        <section id="controls" className="controls panel compact-controls">
              <div className="compact-status">
                <strong className="compact-status-text">{t(isPaused ? 'Paused' : isPlaying ? 'Playing' : 'Ready')}</strong>
                <span>{segments.length ? `${currentSegmentIndex + 1} / ${segments.length}` : t('No book loaded')}</span>
              </div>

              <div className="compact-transport player-controls">
                <button type="button" onClick={handlePlay} disabled={!segments.length}>{t('Play')}</button>
                <button type="button" onClick={handlePause} disabled={!segments.length || !isPlaying}>{t('Pause')}</button>
                <button type="button" onClick={handleResume} disabled={!segments.length || !isPaused}>{t('Resume')}</button>
                <button type="button" onClick={handleStop} className="secondary" disabled={!segments.length}>{t('Stop')}</button>
              </div>

              <label className="compact-speed" htmlFor="speed-control">
                <span>{t('Speed')}</span>
                <input id="speed-control" type="range" min="0.6" max="1.8" step="0.1" value={readSpeed} onChange={handleSpeedChange} />
                <strong>{readSpeed.toFixed(1)}x</strong>
              </label>

              <details className="control-more" ref={controlMoreRef}>
                <summary>{t('More')}</summary>
                <div className="control-more-menu">
                  <button type="button" onClick={toggleBookmark} disabled={!segments.length}>
                    {t(isBookmarked ? 'Remove bookmark' : 'Bookmark segment')}
                  </button>
                  <button type="button" onClick={restoreSessionProgress} disabled={!segments.length || resumeIndex === null || resumeIndex < 0}>{t('Resume last')}</button>
                  <button type="button" onClick={clearSessionProgress} disabled={!segments.length && !bookmarks.length && resumeIndex === null}>{t('Reset progress')}</button>
                  <button type="button" onClick={exportBackup} disabled={!text}>{t('Export backup')}</button>
                  <label className="file-import-button">
                    {t('Import backup')}
                    <input type="file" accept=".json,application/json" onChange={importBackup} />
                  </label>
                  <button type="button" onClick={reopenAnalyticsSettings}>{t('Privacy and analytics')}</button>
                  <span>{bookmarks.length} {t('saved')} {t(bookmarks.length === 1 ? 'bookmark' : 'bookmarks')}</span>
                  {resumeIndex !== null && <span>{t('Last position')}: {resumeIndex + 1}</span>}
                </div>
              </details>
        </section>

        <section id="reader" className="reader panel">
          <div className="reader-header">
            <div>
              <span className="eyebrow">{t('Reading view')}</span>
              <h3>{fileName || t('Your reading space')}</h3>
            </div>
            <div className="reader-header-actions">
              <span className="segment-summary">{segmentSummary}</span>
              <button type="button" className="close-book-button" onClick={closeCurrentBook} disabled={!text}>
                {t('Close book')}
              </button>
            </div>
          </div>

          {text && detectedCharacters.length > 0 && (
            <div className="reader-character-strip" aria-label={t('Characters in this book')}>
              <span className="reader-character-title">{t('Characters in this book')}</span>
              <div className="reader-character-list">
                {detectedCharacters.map((character) => (
                  <span className="reader-character-chip" key={character.name}>{character.name}</span>
                ))}
              </div>
            </div>
          )}

          {error ? <div className="alert">{error}</div> : null}

          {!text ? (
            <div className="empty-state">
              <p>{t('No novel loaded yet.')}</p>
              <span>{t('Upload a supported book or text file to view and listen to it.')}</span>
            </div>
          ) : (
            <>
              <div className="bookmark-strip" aria-label={t('Saved reading bookmarks')}>
                {bookmarks.length ? (
                  bookmarks.map((bookmark) => (
                    <button
                      key={`${bookmark.index}-${bookmark.label}`}
                      type="button"
                      className={bookmark.index === currentSegmentIndex ? 'bookmark-chip active' : 'bookmark-chip'}
                      onClick={() => jumpToSegment(bookmark.index)}
                    >
                      {bookmark.label}
                    </button>
                  ))
                ) : (
                  <div className="empty-small compact">{t('No bookmarks yet. Save a spot in the current segment.')}</div>
                )}
              </div>

              <div className="reading-start-control">
                <div className="reading-start-label">
                  <strong>{t('Choose where to start')}</strong>
                  <span>{currentChapter?.label || t('Full text')} · {t('Segment')} {currentSegmentIndex + 1} {t('of')} {segments.length}</span>
                </div>
                <input
                  aria-label={t('Choose reading start segment')}
                  type="range"
                  min="0"
                  max={Math.max(0, segments.length - 1)}
                  step="1"
                  value={currentSegmentIndex}
                  onChange={(event) => jumpToSegment(Number(event.target.value))}
                />
                <button type="button" onClick={() => playFromIndex(currentSegmentIndex)} disabled={!segments.length}>
                  {t('Start here')}
                </button>
              </div>

              <div className="book-content" aria-live="polite">
                {segments.map((segment, index) => {
                  const isDialogue = /["\u201c\u00ab\u2018][^"\u201c\u201d\u00bb\u2018\u2019]+["\u201d\u00bb\u2019]/u.test(segment);
                  const speaker = getSegmentSpeaker(segment);
                  const emotion = getSegmentEmotion(segment);
                  const segmentLabel = isDialogue ? (speaker === 'Narration' ? t('Dialogue') : `${speaker} ${t('says')}`) : t('Narration');

                  return (
                    <p
                      key={`${segment.slice(0, 12)}-${index}`}
                      ref={index === currentSegmentIndex ? activeSegmentRef : null}
                      className={index === currentSegmentIndex ? `segment active ${isDialogue ? 'dialogue' : 'narration'}` : `segment ${isDialogue ? 'dialogue' : 'narration'}`}
                      onClick={() => jumpToSegment(index)}
                      role="button"
                      aria-current={index === currentSegmentIndex ? 'location' : undefined}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          jumpToSegment(index);
                        }
                      }}
                    >
                      <span className="segment-label">{segmentLabel}</span>
                      <span className="emotion-badge">{t(emotion.label)}</span>
                      <span className="segment-copy">{segment}</span>
                    </p>
                  );
                })}
              </div>
            </>
          )}
        </section>





        <section className="library-panel panel" aria-labelledby="library-title">
          <div className="library-heading">
            <div>
              <span className="eyebrow">{t('On this device')}</span>
              <h3 id="library-title">{t('My Library')}</h3>
            </div>
              <span className="library-count">{libraryBooks.length} {t(libraryBooks.length === 1 ? 'book' : 'books')}</span>
          </div>
          {libraryBooks.length ? (
            <div className="library-list">
              {libraryBooks.map((book) => (
                <div className={book.key === bookKey ? 'library-item active' : 'library-item'} key={book.key}>
                  <div className="library-book-info">
                    <strong>{book.name}</strong>
                    <span>{book.key === bookKey ? t('Currently open') : `${t('Saved')} ${new Date(book.updatedAt).toLocaleDateString()}`}</span>
                  </div>
                  <div className="library-actions">
                    <button type="button" className="library-open" onClick={() => openLibraryBook(book)}>
                      {book.key === bookKey ? t('Open again') : t('Open')}
                    </button>
                    <button type="button" className="library-remove" onClick={() => removeLibraryBook(book)} aria-label={`${t('Remove')} ${book.name} ${t('from this device')}`}>
                      {t('Remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="library-empty">{t('Your uploaded books will appear here and stay on this device.')}</p>
          )}
        </section>

        <section className="panel chapter-panel">
          <div className="chapter-heading">
            <span className="eyebrow">{t('Reading flow')}</span>
            <h3>{t('Chapter navigation')}</h3>
          </div>

          {chapters.length ? (
            <div className="chapter-list" aria-label="Chapter index">
              {chapters.map((chapter, index) => (
                <button
                  key={`${chapter.label}-${index}`}
                  type="button"
                  className={currentChapter?.label === chapter.label ? 'chapter-pill active' : 'chapter-pill'}
                  onClick={() => jumpToSegment(chapter.start)}
                >
                  {chapter.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-small">{t('Upload a novel to build a chapter guide.')}</div>
          )}
        </section>

        <section id="voice-assignment" className="voice-panel panel">
          <div className="voice-header">
            <div>
            <span className="eyebrow">{t('Voice assignment')}</span>
            <h3>{t('Narrator voice')}</h3>
            </div>
          </div>
          <p className="voice-guidance">{t('One narrator voice reads the entire book.')}</p>

          <div className="voice-layout narrator-only-layout">
            <div className="voice-card">
              <label className="voice-language-field" htmlFor="narrator-language">
                <span className="voice-label">{t('Narrator language')}</span>
                <select
                  id="narrator-language"
                  value={narratorLanguage}
                  disabled={!narratorLanguageOptions.length}
                  onChange={(event) => {
                    const nextVoice = availableVoices.find((voice) => voice.lang === event.target.value);
                    if (nextVoice) {
                      changeNarratorVoice(nextVoice.name);
                    }
                  }}
                >
                  {narratorLanguageOptions.map((language) => (
                    <option key={language} value={language}>{getVoiceLanguageLabel(language)}</option>
                  ))}
                </select>
              </label>
              <div className="voice-row">
                <select value={narratorVoiceName || ''} onChange={(event) => {
                  changeNarratorVoice(event.target.value);
                }} aria-label={t('Narrator voice')}>
                  {availableVoices.length ? (
                    narratorLanguageVoices.map((voice) => (
                      <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                        {getVoiceOptionLabel(voice)}
                      </option>
                    ))
                  ) : (
                    <option value="">{t('No browser voices available')}</option>
                  )}
                </select>
                <button type="button" className="small-button" onClick={() => previewVoice(narratorVoiceName, 'Narrator')}>
                  {t('Preview')}
                </button>
              </div>
              <span className="add-character-hint">{t('Choose a language available in your browser. Available languages depend on the voices installed on this device.')}</span>
            </div>
          </div>
        </section>

        <section id="dialogue" className="insights-grid">
          <div className="panel insight-panel">
            <div className="reader-header compact">
              <div>
                <span className="eyebrow">{t('Emotion mapping')}</span>
                <h3>{t('Detected expressions')}</h3>
              </div>
            </div>

            {segments.length ? (
              <div className="emotion-list">
                {[...new Set(segments.map((segment) => getSegmentEmotion(segment).label))].map((emotion) => (
                  <span key={emotion} className="emotion-pill">
                    {t(emotion)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="empty-small">{t('Upload a novel to detect emotional phrasing.')}</div>
            )}
          </div>

          <div className="panel insight-panel">
            <div className="reader-header compact">
              <div>
                <span className="eyebrow">{t('Character registry')}</span>
                <h3>{t('Characters in this book')}</h3>
              </div>
            </div>

            {detectedCharacters.length ? (
              <ul className="registry-list">
                {detectedCharacters.map((character) => (
                  <li key={character.name}>
                    <span>{character.name}</span>
                    <strong>{character.count} {t('dialogue lines')}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-small">{t('No characters detected yet.')}</div>
            )}
          </div>

          <div className="panel insight-panel">
            <div className="reader-header compact">
              <div>
                <span className="eyebrow">{t('Dialogue review')}</span>
                <h3>{t('Speaker assignments')}</h3>
              </div>
            </div>

            {dialogueEntries.length ? (
              <div className="assignment-list">
                {dialogueEntries.map((entry) => (
                  <div key={entry.id} className="assignment-item">
                    <p>{entry.text}</p>
                    <label>
                      <span>{t('Speaker')}</span>
                      <select
                        value={entry.speaker || 'Unknown'}
                        onChange={(event) => handleSpeakerCorrection(entry.id, event.target.value)}
                      >
                        <option value="Unknown">{t('Unknown')}</option>
                        {detectedCharacters.map((character) => (
                          <option key={character.name} value={character.name}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-small">{t('Upload a novel to detect dialogue and speakers.')}</div>
            )}
          </div>
        </section>



        <section className="panel seo-panel" aria-labelledby="about-novelsync-title">
          <h2 id="about-novelsync-title">A free browser book reader with text-to-speech</h2>
          <p>
            NovelSync lets you read a novel on screen or listen with a voice available in your browser. Open a book file,
            choose a starting point, and continue at your own pace. There is no app to install.
          </p>
          <div className="seo-faq">
            <details>
              <summary>Which book formats can I read?</summary>
              <p>NovelSync supports TXT, EPUB, PDF, DOCX, RTF, HTML, Markdown, FB2, ODT, and XML files.</p>
            </details>
            <details>
              <summary>Can NovelSync read my book aloud?</summary>
              <p>Yes. It uses your browser’s text-to-speech voices. The available voices and languages depend on your device and browser.</p>
            </details>
            <details>
              <summary>Where are my books and reading progress saved?</summary>
              <p>Your library and reading progress are saved in browser storage on this device. They are not synced to an online account.</p>
            </details>
          </div>
        </section>
      </main>

      {analyticsConsent === null && (
        <aside className="analytics-consent" aria-label={t('Privacy and analytics')}>
          <div className="analytics-consent-copy">
            <strong>{t('Allow usage analytics?')}</strong>
            <p>{t('Google Analytics records visits and basic feature use after you allow it. NovelSync does not send book text, filenames, or reading position.')}</p>
          </div>
          <div className="analytics-consent-actions">
            <button type="button" className="secondary" onClick={() => chooseAnalytics('declined')}>{t('No thanks')}</button>
            <button type="button" onClick={() => chooseAnalytics('accepted')}>{t('Allow analytics')}</button>
          </div>
        </aside>
      )}
    </div>
  );
}

export default App;
