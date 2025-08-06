// sriramainsert.js - Web Worker for batch inserting data into IndexedDB

let db = null;

/**
 * Open or create the IndexedDB database and object store
 * @param {string} dbName 
 * @param {number} dbVersion 
 * @param {string} storeName 
 * @returns {Promise<IDBDatabase>}
 */
function openDB(dbName, dbVersion, storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Insert a batch of entries into the object store
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
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    for (let id = startId; id <= endId; id++) {
      store.put({ id, text });
    }

    transaction.oncomplete = () => {
      const durationSec = (performance.now() - startTime) / 1000;
      // Return cumulative inserted count
      resolve({ duration: durationSec, inserted: endId });
    };

    transaction.onerror = (event) => reject(event.target.error);
    transaction.onabort = (event) => reject(event.target.error);
  });
}

// Handle messages from main thread
self.onmessage = async (e) => {
  const {
    DB_NAME,
    STORE_NAME,
    DB_VERSION,
    TOTAL_ENTRIES,
    BATCH_SIZE,
    phrase = '', // Default empty string if not provided
  } = e.data;

  try {
    db = await openDB(DB_NAME, DB_VERSION, STORE_NAME);

    for (let i = 0; i < TOTAL_ENTRIES; i += BATCH_SIZE) {
      const startId = i + 1;
      const endId = Math.min(i + BATCH_SIZE, TOTAL_ENTRIES);

      const { duration, inserted } = await insertBatch(db, STORE_NAME, startId, endId, phrase);

      self.postMessage({
        inserted,
        total: TOTAL_ENTRIES,
        batchDurationSecs: duration.toFixed(2),
      });
    }

    // Signal insertion complete
    self.postMessage({ done: true });

  } catch (error) {
    self.postMessage({ error: error.message || error.toString() });
  }
};

// Catch-all error handler in the worker
self.onerror = (error) => {
  self.postMessage({ error: error.message || error.toString() });
};

// Optional cleanup on worker termination (if supported)
self.onclose = () => {
  if (db) {
    db.close();
    db = null;
  }
};
