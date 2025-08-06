// ===== Constants =====
const DB_NAME = 'SriRamaKotiDB';
const STORE_NAME = 'sriRamaStore';
const DB_VERSION = 1;
const TOTAL_ENTRIES = 10000000; // 1 crore
const BATCH_SIZE = 100000;
const PAGE_SIZE = 5000;

// ===== State variables =====
let db;
let worker;
let currentPage = 0;
let totalPages = 0;
let isInserting = false;
let cancelRequested = false;
let batchInsertedCount = 0;
let insertionStartTime;

// ===== DOM Elements =====
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const deleteDbBtn = document.getElementById('deleteDbBtn');
const statusP = document.getElementById('status');
const totalTimeP = document.getElementById('totalTime');
const logDiv = document.getElementById('logDiv');
const container = document.getElementById('dataContainer');
const progressBar = document.getElementById('progressBar');
const firstPageBtn = document.getElementById('firstPageBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const lastPageBtn = document.getElementById('lastPageBtn');
const pageInfo = document.getElementById('pageInfo');
const goTopBtn = document.getElementById('goTopBtn');
const insertTextInput = document.getElementById('insertText');
const exportBtn = document.getElementById('exportBtn');

const menuAbout = document.getElementById('menuAbout');
const menuInsert = document.getElementById('menuInsert');
const menuTools = document.getElementById('menuTools');

const aboutPage = document.getElementById('aboutPage');
const insertPage = document.getElementById('insertPage');
const toolsPage = document.getElementById('toolsPage');

// ===== Utility Functions =====

// Open or create IndexedDB database and object store
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = e => {
      db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = e => {
      db = e.target.result;
      resolve();
    };
    request.onerror = e => reject(e.target.error);
  });
}

// Log messages with fade-in effect per entry
function log(text) {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.opacity = '0';
  logDiv.appendChild(div);
  requestAnimationFrame(() => {
    div.style.opacity = '1';
  });
  logDiv.scrollTop = logDiv.scrollHeight;
}

// Update status text with optional spinner
function updateStatus(text, showSpinner = false) {
  if (showSpinner) {
    statusP.innerHTML = `${text} <span class="ellipsis" aria-hidden="true"></span>`;
  } else {
    statusP.textContent = text;
  }
}

// Format numbers in Indian notation for thousands, lakhs, crores
function formatIndianNumber(num) {
  if (num < 100000) return num.toLocaleString();
  if (num < 10000000) return (num / 100000).toFixed(0) + ' Lakh';
  return (num / 10000000).toFixed(1) + ' Crore';
}

// Format duration in human-readable h/m/s
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hDisplay = hours > 0 ? hours + (hours === 1 ? ' hour ' : ' hours ') : '';
  const mDisplay = minutes > 0 ? minutes + (minutes === 1 ? ' minute ' : ' minutes ') : '';
  const sDisplay = seconds > 0 ? seconds + (seconds === 1 ? ' second' : ' seconds') : '';
  return (hDisplay + mDisplay + sDisplay).trim() || '0 seconds';
}

// Enable/disable pagination buttons and update page info text
function updatePaginationButtons() {
  firstPageBtn.disabled = currentPage === 0;
  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage >= totalPages - 1;
  lastPageBtn.disabled = currentPage >= totalPages - 1;
  pageInfo.textContent = totalPages > 0 ? `Page ${currentPage + 1} / ${totalPages}` : 'Page 0 / 0';
}

// Load and display a page of records from IndexedDB based on currentPage
function loadPage(page) {
  container.innerHTML = '';
  const startId = page * PAGE_SIZE + 1;
  const maxId = Math.min(batchInsertedCount, TOTAL_ENTRIES);

  if (startId > maxId) {
    container.innerHTML = `<p style="text-align:center; color:#666;">More entries will appear later&hellip;</p>`;
    updateStatus(`Page ${page + 1} not yet available. Please wait for insertion.`);
    updatePaginationButtons();
    return;
  }

  const endId = Math.min(startId + PAGE_SIZE - 1, maxId);
  updateStatus(`Loading page ${page + 1} of ${totalPages} (IDs ${startId.toLocaleString()} - ${endId.toLocaleString()})...`);

  const txn = db.transaction(STORE_NAME, 'readonly');
  const store = txn.objectStore(STORE_NAME);
  const keyRange = IDBKeyRange.bound(startId, endId);
  const request = store.openCursor(keyRange);
  const fragment = document.createDocumentFragment();
  let count = 0;

  request.onerror = () => updateStatus('Error loading data.');

  request.onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      const div = document.createElement('div');
      div.className = 'ramadiv';
      div.textContent = `${cursor.value.text} (ID: ${cursor.value.id.toLocaleString()})`;
      fragment.appendChild(div);
      count++;
      cursor.continue();
    } else {
      container.appendChild(fragment);
      updateStatus(`Showing page ${page + 1} of ${totalPages}. Entries shown: ${count}.`);
      updatePaginationButtons();
    }
  };
}

// Pagination Button Handlers
firstPageBtn.onclick = () => {
  if (currentPage !== 0) {
    currentPage = 0;
    loadPage(currentPage);
    updatePaginationButtons();
  }
};
prevPageBtn.onclick = () => {
  if (currentPage > 0) {
    currentPage--;
    loadPage(currentPage);
    updatePaginationButtons();
  }
};
nextPageBtn.onclick = () => {
  if (currentPage < totalPages - 1) {
    currentPage++;
    loadPage(currentPage);
    updatePaginationButtons();
  }
};
lastPageBtn.onclick = () => {
  if (currentPage !== totalPages - 1) {
    currentPage = totalPages - 1;
    loadPage(currentPage);
    updatePaginationButtons();
  }
};

// Change Insert Button State based on insertion progress
function setInsertState(state) {
  if (state === 'ready') {
    startBtn.disabled = false;
    startBtn.textContent = 'Start Insert 1 Crore';
    startBtn.classList.remove('working');
    cancelBtn.style.display = 'none';
    cancelBtn.disabled = false;
    progressBar.style.display = 'none';
    totalTimeP.textContent = '';
  } else if (state === 'inserting') {
    startBtn.disabled = true;
    startBtn.textContent = 'Inserting…';
    startBtn.classList.add('working');
    cancelBtn.style.display = 'inline-block';
    cancelBtn.disabled = false;
    progressBar.style.display = 'block';
  } else if (state === 'done') {
    startBtn.disabled = true;
    startBtn.textContent = '✅ Insertion Complete';
    startBtn.classList.remove('working');
    cancelBtn.style.display = 'none';
    progressBar.style.display = 'none';
  }
}

// Start insertion process with Web Worker
startBtn.onclick = () => {
  if (!isInserting) startInsertion();
};

function startInsertion() {
  if (worker) worker.terminate();

  logDiv.textContent = '';
  updateStatus('Starting insertion in background...', true);
  setInsertState('inserting');
  isInserting = true;
  cancelRequested = false;
  batchInsertedCount = 0;
  progressBar.value = 0;
  insertionStartTime = performance.now();

  const customText = insertTextInput?.value?.trim() || 'JAI SRI RAM| జై శ్రీ రామ్  |जय श्री रामः';

  worker = new Worker('insertWorker.js');
  worker.postMessage({ DB_NAME, STORE_NAME, DB_VERSION, TOTAL_ENTRIES, BATCH_SIZE, customText });

  worker.onmessage = e => {
    if (e.data.error) {
      log(`❌ Error: ${e.data.error}`);
      updateStatus('Error during insertion.', false);
      setInsertState('ready');
      isInserting = false;
      cancelRequested = false;
      return;
    }
    if (e.data.inserted) {
      batchInsertedCount = e.data.inserted;
      log(`📝 Inserted ${formatIndianNumber(batchInsertedCount)} entries, batch took ${e.data.batchDurationSecs} seconds.`);
      updateStatus(`Inserted ${formatIndianNumber(batchInsertedCount)} / ${formatIndianNumber(TOTAL_ENTRIES)} entries`, true);

      progressBar.value = Math.min(100, (batchInsertedCount / TOTAL_ENTRIES) * 100);

      if (batchInsertedCount % 100000 === 0 || batchInsertedCount === TOTAL_ENTRIES) {
        const pageToLoad = Math.floor((batchInsertedCount - 1) / PAGE_SIZE);
        totalPages = Math.ceil(Math.max(batchInsertedCount, TOTAL_ENTRIES) / PAGE_SIZE);
        currentPage = pageToLoad;
        loadPage(currentPage);
        updatePaginationButtons();
      }
    }
    if (e.data.done) {
      const totalDuration = performance.now() - insertionStartTime;
      log('✅ Insertion complete.');
      updateStatus(`Insertion complete! Total time: ${formatDuration(totalDuration)}`);
      totalTimeP.textContent = `Total time: ${formatDuration(totalDuration)}`;
      totalPages = Math.ceil(TOTAL_ENTRIES / PAGE_SIZE);
      currentPage = 0;
      loadPage(currentPage);
      updatePaginationButtons();
      setInsertState('done');
      isInserting = false;
      cancelRequested = false;

      if (typeof confetti === 'function') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      }

      deleteDbBtn.disabled = false;
    }
  };

  worker.onerror = e => {
    log(`⚠️ Worker error: ${e.message}`);
    updateStatus('Insertion error.');
    setInsertState('ready');
    isInserting = false;
    cancelRequested = false;
  };
}

// Cancel insertion handler
cancelBtn.onclick = () => {
  if (!isInserting) return;
  cancelBtn.disabled = true;

  if (worker) {
    worker.terminate();
    worker = null;
  }

  cancelRequested = true;
  updateStatus('Cancelling… Please wait.');
  log('❌ User cancelled insertion.');

  try {
    if (db) db.close();
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    deleteRequest.onsuccess = () => {
      log('✅ Database deleted after cancellation.');
      updateStatus('Insertion cancelled. Database cleared.');
      logDiv.textContent = '';
      container.innerHTML = '';
      currentPage = 0;
      totalPages = 0;
      updatePaginationButtons();
      deleteDbBtn.disabled = true;
      setInsertState('ready');
      cancelBtn.style.display = 'none';
      cancelBtn.disabled = false;
      progressBar.style.display = 'none';
      totalTimeP.textContent = '';
      isInserting = false;
    };
    deleteRequest.onerror = () => {
      log('❌ Database deletion failed after cancellation.');
      updateStatus('Database deletion failed after cancellation.');
      cancelBtn.disabled = false;
    };
  } catch (e) {
    log('❌ Exception during cancellation: ' + e);
    updateStatus('Error during cancellation.');
    cancelBtn.disabled = false;
  }

  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    log('🧹 Cache cleared after cancellation.');
  }
};

// Delete database button handler
deleteDbBtn.onclick = () => {
  deleteDbBtn.disabled = true;
  updateStatus('Deleting database... Please wait.');
  log('🗑️ Delete requested.');

  try {
    if (worker) {
      worker.terminate();
      worker = null;
      isInserting = false;
      cancelRequested = false;
    }

    if (db) db.close();

    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    deleteRequest.onsuccess = () => {
      log('✅ Database deleted.');
      updateStatus('Database deleted.');
      logDiv.textContent = '';
      container.innerHTML = '';
      currentPage = 0;
      totalPages = 0;
      updatePaginationButtons();
      setInsertState('ready');
      deleteDbBtn.disabled = true;
      startBtn.disabled = false;
      cancelBtn.style.display = 'none';
      cancelBtn.disabled = false;
      progressBar.style.display = 'none';
      totalTimeP.textContent = '';
    };
    deleteRequest.onerror = () => {
      log('❌ Database deletion failed.');
      updateStatus('Database deletion failed.');
      deleteDbBtn.disabled = false;
    };
    deleteRequest.onblocked = () => {
      log('⚠️ Deletion blocked. Close other tabs.');
      updateStatus('Deletion blocked. Close other tabs.');
      deleteDbBtn.disabled = false;
    };

    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      log('🧹 Cache cleared after deletion.');
    }
  } catch (err) {
    log(`❌ Exception during deletion: ${err}`);
    updateStatus('Error during deletion.');
    deleteDbBtn.disabled = false;
  }
};

// Export button handler
exportBtn?.addEventListener('click', async () => {
  if (!db) {
    alert('Database not open.');
    return;
  }
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const items = [];

    await new Promise((resolve, reject) => {
      store.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      store.openCursor().onerror = e => reject(e.target.error);
    });

    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rama_koti_backup.json';
    a.click();
    URL.revokeObjectURL(url);
    alert(`Exported ${items.length} records successfully.`);
  } catch (err) {
    alert('Export failed: ' + err);
  }
});

// Navigation menu handlers
function showSection(section) {
  aboutPage.style.display = section === 'about' ? 'block' : 'none';
  insertPage.style.display = section === 'insert' ? 'block' : 'none';
  toolsPage.style.display = section === 'tools' ? 'block' : 'none';

  menuAbout.disabled = section === 'about';
  menuInsert.disabled = section === 'insert';
  menuTools.disabled = section === 'tools';
}

menuAbout.onclick = () => showSection('about');
menuInsert.onclick = () => showSection('insert');
menuTools.onclick = () => showSection('tools');

// Accessibility: live region for screen readers
const liveRegion = document.createElement('div');
liveRegion.setAttribute('aria-live', 'polite');
liveRegion.style.position = 'absolute';
liveRegion.style.left = '-9999px';
liveRegion.style.height = '1px';
liveRegion.style.width = '1px';
liveRegion.style.overflow = 'hidden';
document.body.appendChild(liveRegion);

// Scroll-to-top button visibility toggle
window.addEventListener('scroll', () => {
  if (window.pageYOffset > 300) {
    goTopBtn.classList.add('visible');
  } else {
    goTopBtn.classList.remove('visible');
  }
});

// Scroll-to-top button click smooth scroll
goTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  liveRegion.textContent = 'Scrolled to top';
});

// Initialize app on page load
window.onload = async () => {
  showSection('about');

  try {
    await openDB();

    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();

    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count > 0) {
        batchInsertedCount = count;
        deleteDbBtn.disabled = false;
        totalPages = Math.ceil(count / PAGE_SIZE);
        currentPage = 0;
        loadPage(currentPage);
        updatePaginationButtons();
        setInsertState('done');
        updateStatus(`Loaded existing ${formatIndianNumber(count)} entries. Showing page 1.`);
        startBtn.disabled = true;
        progressBar.style.display = 'none';
      } else {
        deleteDbBtn.disabled = true;
        firstPageBtn.disabled = true;
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        lastPageBtn.disabled = true;
        setInsertState('ready');
        updateStatus('Database empty. Click "Start Insert 1 Crore" to begin.');
        progressBar.style.display = 'none';
      }
    };

    countReq.onerror = () => {
      updateStatus('Unable to read database count.');
      setInsertState('ready');
      firstPageBtn.disabled = true;
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      lastPageBtn.disabled = true;
      progressBar.style.display = 'none';
    };
  } catch {
    deleteDbBtn.disabled = true;
    firstPageBtn.disabled = true;
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    lastPageBtn.disabled = true;
    setInsertState('ready');
    updateStatus('Database not initialized. Click "Start Insert 1 Crore" to begin.');
    progressBar.style.display = 'none';
  }
};
