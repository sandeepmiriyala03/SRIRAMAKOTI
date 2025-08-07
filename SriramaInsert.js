// sriramain.js - Sri Rama Koti Worker

let db = null;
let cancelRequested = false;

/**
 * Opens or creates the IndexedDB database and object store.
 * @param {string} dbName - Database name.
 * @param {number} dbVersion - Database version.
 * @param {string} storeName - Object store name.
 * @returns {Promise<IDBDatabase>}
 */
function openDB(dbName, dbVersion, storeName) {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(dbName, dbVersion);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      };

      request.onsuccess = (event) => {
        const database = event.target.result;

        database.onversionchange = () => {
          database.close();
          self.postMessage({ error: "Database outdated, please reload the app." });
        };

        resolve(database);
      };

      request.onerror = (event) => reject(event.target.error);

      request.onblocked = () => reject(new Error("Database open blocked by another connection"));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Inserts a batch of records in IndexedDB.
 * @param {IDBDatabase} database - Open IndexedDB database.
 * @param {string} storeName - Object store name.
 * @param {number} startId - Start record ID.
 * @param {number} endId - End record ID.
 * @param {string} text - Text to store.
 * @returns {Promise<{duration: number, inserted: number}>}
 */
function insertBatch(database, storeName, startId, endId, text) {
  return new Promise((resolve, reject) => {
    try {
      let aborted = false;
      const startTime = performance.now();

      const txn = database.transaction(storeName, "readwrite");
      const store = txn.objectStore(storeName);

      txn.oncomplete = () => {
        if (!aborted) {
          const duration = (performance.now() - startTime) / 1000;
          resolve({ duration, inserted: endId });
        }
      };

      txn.onerror = (event) => {
        if (!aborted) {
          reject(event.target.error);
        }
      };

      txn.onabort = () => {
        aborted = true;
        reject(new Error("Transaction aborted (possibly due to cancellation)"));
      };

      for (let id = startId; id <= endId; id++) {
        if (cancelRequested) {
          txn.abort();
          break;
        }
        store.put({ id, text });
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Cleans up the database connection.
 */
function cleanup() {
  try {
    if (db) {
      db.close();
    }
  } catch (e) {
    // Ignore errors during close
  }
  db = null;
}

// Listen for messages from the main thread
self.addEventListener("message", async (event) => {
  if (event.data && event.data.command === "cancel") {
    cancelRequested = true;
    return;
  }

  const { DB_NAME, DB_VERSION, STORE_NAME, TOTAL_ENTRIES, BATCH_SIZE, phrase = "" } = event.data;

  cancelRequested = false;

  if (!DB_NAME || !DB_VERSION || !STORE_NAME || !TOTAL_ENTRIES || !BATCH_SIZE) {
    self.postMessage({ error: "Missing required configuration parameters" });
    return;
  }

  try {
    db = await openDB(DB_NAME, DB_VERSION, STORE_NAME);

    let totalInserted = 0;
    const startTime = performance.now();

    for (let i = 0; i < TOTAL_ENTRIES; i += BATCH_SIZE) {
      if (cancelRequested) {
        self.postMessage({ error: "Insertion cancelled by user" });
        break;
      }

      const startId = i + 1;
      const endId = Math.min(i + BATCH_SIZE, TOTAL_ENTRIES);
      const currentBatchSize = endId - startId + 1;

      try {
        const batchResult = await insertBatch(db, STORE_NAME, startId, endId, phrase);
        totalInserted += currentBatchSize;

        const elapsed = (performance.now() - startTime) / 1000;
        const speed = elapsed ? totalInserted / elapsed : 0;
        const eta = speed ? (TOTAL_ENTRIES - totalInserted) / speed : 0;

        self.postMessage({
          inserted: totalInserted,
          total: TOTAL_ENTRIES,
          batchSize: currentBatchSize,
          batchNumber: Math.ceil(totalInserted / BATCH_SIZE),
          totalBatches: Math.ceil(TOTAL_ENTRIES / BATCH_SIZE),
          batchDurationSecs: batchResult.duration.toFixed(2),
          progress: ((totalInserted / TOTAL_ENTRIES) * 100).toFixed(1),
          averageSpeed: speed.toFixed(0),
          estimatedTime: Math.ceil(eta),
        });
      } catch (batchError) {
        self.postMessage({
          error: `Batch insertion failed at record ID ${startId}: ${batchError.message}`,
          failedAt: startId,
          totalInserted,
        });
        break;
      }
    }

    if (!cancelRequested && totalInserted >= TOTAL_ENTRIES) {
      const totalDuration = (performance.now() - startTime) / 1000;
      self.postMessage({
        done: true,
        totalTime: totalDuration.toFixed(2),
        totalRecords: TOTAL_ENTRIES,
      });
    }
  } catch (error) {
    self.postMessage({
      error: error.message || error.toString(),
      stack: error.stack,
    });
  } finally {
    cleanup();
  }
});

// Capture uncaught errors and communicate to main thread
self.onerror = (event) => {
  self.postMessage({ error: event.message || "Unknown error in worker" });
  cleanup();
};

// Handle unhandled promise rejections
self.onunhandledrejection = (event) => {
  self.postMessage({ error: (event.reason && event.reason.toString()) || "Unhandled rejection" });
  event.preventDefault();
};
