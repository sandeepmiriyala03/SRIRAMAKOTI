self.onmessage = async (e) => {
  const { DB_NAME, STORE_NAME, DB_VERSION, TOTAL_ENTRIES, BATCH_SIZE, customText = "JAI SRI RAM| జై శ్రీ రామ్  |जय श्री रामः" } = e.data;
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (evt) => {
        db = evt.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      req.onsuccess = (evt) => {
        db = evt.target.result;
        resolve();
      };

      req.onerror = (evt) => reject(evt.target.error);
    });
  }

  try {
    await openDB();

    for (let i = 0; i < TOTAL_ENTRIES; i += BATCH_SIZE) {
      const startTime = performance.now();

      await new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, 'readwrite');
        const store = txn.objectStore(STORE_NAME);

        for (let j = 0; j < BATCH_SIZE && i + j < TOTAL_ENTRIES; j++) {
          store.put({
            id: i + j + 1,
            text: customText,
          });
        }

        txn.oncomplete = () => {
          const endTime = performance.now();
          const batchDurationSecs = ((endTime - startTime) / 1000).toFixed(2);
          const insertedCount = Math.min(i + BATCH_SIZE, TOTAL_ENTRIES);

          self.postMessage({
            inserted: insertedCount,
            total: TOTAL_ENTRIES,
            batchDurationSecs,
          });
          resolve();
        };

        txn.onerror = (e) => {
          reject(e.target.error);
        };
      });
    }

    self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: error.message || error.toString() });
  }
};

self.onerror = (error) => {
  self.postMessage({ error: error.message || error.toString() });
};
