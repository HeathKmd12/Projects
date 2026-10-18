const DATABASE_NAME = 'novelsync-library';
const DATABASE_VERSION = 1;

let databasePromise;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local book storage.'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('books')) database.createObjectStore('books', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('content')) database.createObjectStore('content', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('progress')) database.createObjectStore('progress', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the local book library.'));
  });

  return databasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not access the local book library.'));
  });
}

export async function listStoredBooks() {
  const database = await openDatabase();
  const transaction = database.transaction('books', 'readonly');
  const books = await requestResult(transaction.objectStore('books').getAll());
  return books.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveStoredBook(book, text) {
  const database = await openDatabase();
  const transaction = database.transaction(['books', 'content'], 'readwrite');
  transaction.objectStore('books').put(book);
  transaction.objectStore('content').put({ key: book.key, text });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not save this book locally.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving this book was interrupted.'));
  });
}

export async function getStoredBookText(key) {
  const database = await openDatabase();
  const transaction = database.transaction('content', 'readonly');
  const record = await requestResult(transaction.objectStore('content').get(key));
  return record?.text || '';
}

export async function getStoredProgress(key) {
  const database = await openDatabase();
  const transaction = database.transaction('progress', 'readonly');
  return (await requestResult(transaction.objectStore('progress').get(key))) || null;
}

export async function saveStoredProgress(key, resumeIndex, bookmarks) {
  const database = await openDatabase();
  const transaction = database.transaction('progress', 'readwrite');
  transaction.objectStore('progress').put({ key, resumeIndex, bookmarks });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not save reading progress.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving reading progress was interrupted.'));
  });
}

export async function removeStoredBook(key) {
  const database = await openDatabase();
  const transaction = database.transaction(['books', 'content', 'progress'], 'readwrite');
  transaction.objectStore('books').delete(key);
  transaction.objectStore('content').delete(key);
  transaction.objectStore('progress').delete(key);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove this book.'));
    transaction.onabort = () => reject(transaction.error || new Error('Removing this book was interrupted.'));
  });
}
