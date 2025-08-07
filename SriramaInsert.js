// ===================================================================
// sriramainsert.JS - Sri Rama Koti PWA
// Author: Sandeep Miriyala (vanisandeep@gmail.com)
// Repository: https://github.com/sandeepmiriyala03/SRIRAMAKOTI.git
// ===================================================================
let db = null;
let cancelRequested = false;

function openDB(dbName, dbVersion, storeName) {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = event => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = event => {
        const database = event.target.result;
        database.onversionchange = () => {
          database.close();
          self.postMessage({ error: 'Database outdated, please reload the app.' });
        };
        resolve(database);
      };
      request.onerror = event => reject(event.target.error);
      request.onblocked = () => reject(new Error('Database open blocked'));
    } catch (error) {
      reject(error);
    }
  });
}

async function insertBatch(database, storeName, startId, endId, text) {
  return new Promise((resolve, reject) => {
    try {
      const startTime = performance.now();
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      let aborted = false;

      transaction.oncomplete = () => {
        if (!aborted) {
          const duration = (performance.now() - startTime) / 1000;
          resolve({ duration, inserted: endId });
        }
        // else reject handled on abort
      };
      transaction.onerror = event => {
        reject(event.target.error);
      };
      transaction.onabort = event => {
        aborted = true;
        reject(new Error('Transaction aborted'));
      };

      // Insert in synchronous loop — no async awaits to keep transaction active
      for (let id = startId; id <= endId; id++) {
        if (cancelRequested) {
          transaction.abort();
          break; // stop inserting
        }
        store.put({ id, text });
      }
    } catch (error) {
      reject(error);
    }
  });
}

function cleanup() {
  if (db) {
    try {
      db.close();
    } catch (_) {}
    db = null;
  }
}

function handleCancellation() {
  cancelRequested = true;
}

self.onmessage = async event => {
  const { DB_NAME, DB_VERSION, STORE_NAME, TOTAL_ENTRIES, BATCH_SIZE, phrase = '' } = event.data;

  cancelRequested = false;

  if (!DB_NAME || !DB_VERSION || !STORE_NAME || !TOTAL_ENTRIES || !BATCH_SIZE) {
    self.postMessage({ error: 'Invalid parameters: Missing required configuration' });
    return;
  }

  try {
    db = await openDB(DB_NAME, DB_VERSION, STORE_NAME);
    let totalProcessed = 0;
    const startTime = performance.now();

    for (let i = 0; i < TOTAL_ENTRIES; i += BATCH_SIZE) {
      if (cancelRequested) {
        self.postMessage({ error: 'Insertion cancelled by user' });
        break;
      }

      const startId = i + 1;
      const endId = Math.min(i + BATCH_SIZE, TOTAL_ENTRIES);
      const batchSize = endId - startId + 1;

      try {
        await insertBatch(db, STORE_NAME, startId, endId, phrase);
        totalProcessed += batchSize;

        const elapsed = (performance.now() - startTime) / 1000;
        const speed = totalProcessed / elapsed;
        const eta = speed > 0 ? (TOTAL_ENTRIES - totalProcessed) / speed : 0;

        self.postMessage({
          inserted: totalProcessed,
          total: TOTAL_ENTRIES,
          batchDurationSecs: '', // optionally fill if you compute per batch duration elsewhere
          progress: ((totalProcessed / TOTAL_ENTRIES) * 100).toFixed(1),
          averageSpeed: speed.toFixed(0),
          estimatedTime: Math.ceil(eta),
          batchNumber: Math.ceil(totalProcessed / BATCH_SIZE),
          totalBatches: Math.ceil(TOTAL_ENTRIES / BATCH_SIZE)
        });
      } catch (batchError) {
        self.postMessage({
          error: `Batch insertion failed: ${batchError.message}`,
          failedAt: startId,
          totalProcessed
        });
        break;
      }
    }

    if (!cancelRequested && totalProcessed >= TOTAL_ENTRIES) {
      const totalDuration = (performance.now() - startTime) / 1000;
      self.postMessage({
        done: true,
        totalTime: totalDuration.toFixed(2),
        totalRecords: TOTAL_ENTRIES
      });
    }
  } catch (error) {
    self.postMessage({
      error: `Critical error: ${error.message || error.toString()}`,
      stack: error.stack
    });
  } finally {
    cleanup();
  }
};

self.onerror = event => {
  self.postMessage({ error: event.message });
  cleanup();
};

self.oncancel = () => {
  handleCancellation();
};

self.onunhandledrejection = event => {
  self.postMessage({ error: event.reason?.toString() || 'Unhandled rejection' });
  event.preventDefault();
};
