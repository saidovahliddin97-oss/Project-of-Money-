// Hands files dropped on the landing page to the converter page. Files are kept in
// this browser's IndexedDB for a moment and never leave the device.
const DB = 'll-handoff';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function stash(files) {
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put([...files], 'pending');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Returns the stashed files (or []) and deletes them. */
export async function take() {
  try {
    const db = await open();
    const files = await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const get = store.get('pending');
      get.onsuccess = () => store.delete('pending');
      tx.oncomplete = () => resolve(get.result || []);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return files;
  } catch {
    return [];
  }
}
