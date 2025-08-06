// Web Worker code for inserting large number of entries into IndexedDB in batches

self.onmessage = async (e) => {
  // Destructure data from main thread message
  const {
    DB_NAME,
    STORE_NAME,
    DB_VERSION,
    TOTAL_ENTRIES,
    BATCH_SIZE,
    customText = "JAI SRI RAM| జై శ్రీ రామ్  |जय श्री रामः",
  } = e.data;

  let db;

  // Open (or create) the IndexedDB database and object store
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (evt) => {
        db = evt.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
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

    // Insert entries in batches to prevent blocking the thread
    for (let i = 0; i < TOTAL_ENTRIES; i += BATCH_SIZE) {
      const startTime = performance.now();

      await new Promise((resolve, reject) => {
        const txn = db.transaction(STORE_NAME, "readwrite");
        const store = txn.objectStore(STORE_NAME);

        // Insert records in the current batch
        for (
          let j = 0;
          j < BATCH_SIZE && i + j < TOTAL_ENTRIES;
          j++
        ) {
          store.put({
            id: i + j + 1, // Unique key starting from 1
            text: customText,
          });
        }

        // When transaction completes successfully, report progress
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

        // If transaction fails, reject the promise with the error
        txn.onerror = (e) => {
          reject(e.target.error);
        };
      });
    }

    // Signal to main thread that insertion is done
    self.postMessage({ done: true });
  } catch (error) {
    // On any error, send error message to main thread
    self.postMessage({ error: error.message || error.toString() });
  }
};

// Catch any uncaught errors in the worker and send to main thread
self.onerror = (error) => {
  self.postMessage({ error: error.message || error.toString() });
};
