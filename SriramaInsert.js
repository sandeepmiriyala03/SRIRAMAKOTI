// Web Worker: Efficient Batch Insert to IndexedDB for Sri Rama Koti
// Receives parameters from main thread and inserts TOTAL_ENTRIES in BATCH_SIZE chunks

/**
 * Open or create IndexedDB database and object store
 * @param {string} dbName
 * @param {number} dbVersion
 * @param {string} storeName
 * @returns {Promise<IDBDatabase>}
 */
function openDB(dbName, dbVersion, storeName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, dbVersion);

    req.onupgradeneeded = (evt) => {
      const db = evt.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "id" });
      }
    };

    req.onsuccess = (evt) => resolve(evt.target.result);
    req.onerror = (evt) => reject(evt.target.error);
  });
}

/**
 * Insert a batch of entries into IndexedDB
 * @param {IDBDatabase} db
 * @param {string} storeName
 * @param {number} startId
 * @param {number} endId
 * @param {string} text
 * @returns {Promise<{duration: number, inserted: number}>}
 */
function insertBatch(db, storeName, startId, endId, text) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);

    for (let id = startId; id <= endId; id++) {
      store.put({
        id,
        text,
      });
    }

    tx.oncomplete = () => {
      const duration = (performance.now() - startTime) / 1000;
      resolve({ duration, inserted: endId });
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

// Main worker message receiver: controls batch process
self.onmessage = async (e) => {
  const {
    DB_NAME,
    STORE_NAME,
    DB_VERSION,
    TOTAL_ENTRIES,
    BATCH_SIZE,
    phrase = "JAI SRI RAM| జై శ్రీ రామ్  |जय श्री रामः",
  } = e.data;

  try {
    const db = await openDB(DB_NAME, DB_VERSION, STORE_NAME);

    // Insert TOTAL_ENTRIES in BATCH_SIZE increments
    for (let i = 0; i < TOTAL_ENTRIES; i += BATCH_SIZE) {
      const startId = i + 1;
      const endId = Math.min(i + BATCH_SIZE, TOTAL_ENTRIES);

      const result = await insertBatch(db, STORE_NAME, startId, endId, phrase);

      // Notify main thread about this batch's progress
      self.postMessage({
        inserted: endId,
        total: TOTAL_ENTRIES,
        batchDurationSecs: result.duration.toFixed(2),
      });
    }

    // All entries inserted successfully!
    self.postMessage({ done: true });
  } catch (error) {
    // Report any setup/insert error to main thread
    self.postMessage({ error: error.message || error.toString() });
  }
};

// Catch-all for unexpected errors
self.onerror = (error) => {
  self.postMessage({ error: error.message || error.toString() });
};
