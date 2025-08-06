// ===== Constants: All app-wide fixed values =====
const DB_NAME = 'SriRamaKotiDB';
const STORE_NAME = 'sriRamaStore';
const DB_VERSION = 1;
const TOTAL_ENTRIES = 10_000_000; // 1 crore entries
const BATCH_SIZE = 100_000;       // Number of entries inserted per batch
const PAGE_SIZE = 5_000;          // Entries shown per page

// ===== State variables: App's dynamic state =====
let db;                      // IndexedDB database instance
let worker;                  // Background Web Worker for insertion
let currentPage = 0;         // Current page in pagination
let totalPages = 0;          // Total number of pages
let isInserting = false;     // Flag indicating insert in progress
let cancelRequested = false; // Flag for user cancel request
let batchInsertedCount = 0;  // Total number of entries inserted
let insertionStartTime = 0;  // Timestamp when insertion started

// ===== DOM Elements (populated on window load) =====
let elements = {};

// ===== Utility Functions =====

/**
 * Utility to safely get element by ID
 * @param {string} id 
 * @returns {HTMLElement|null}
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * Format number to Indian system (Thousands, Lakh, Crore)
 * @param {number} num
 * @returns {string}
 */
function formatIndianNumber(num) {
  if (num < 100000) return num.toLocaleString();
  if (num < 10000000) return (num / 100000).toFixed(0) + ' Lakh';
  return (num / 10000000).toFixed(1) + ' Crore';
}

/**
 * Format milliseconds to string hh:mm:ss
 * @param {number} ms 
 * @returns {string}
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const hStr = h > 0 ? `${h} hour${h > 1 ? 's' : ''} ` : '';
  const mStr = m > 0 ? `${m} minute${m > 1 ? 's' : ''} ` : '';
  const sStr = s > 0 ? `${s} second${s > 1 ? 's' : ''}` : '';
  return (hStr + mStr + sStr).trim() || '0 seconds';
}

/**
 * Log text message to the log div with fade-in effect
 * @param {string} text 
 */
function log(text) {
  const logDiv = elements.logDiv;
  if (!logDiv) return;
  const div = document.createElement('div');
  div.textContent = text;
  div.style.opacity = '0';
  logDiv.appendChild(div);
  requestAnimationFrame(() => { div.style.opacity = '1'; });
  logDiv.scrollTop = logDiv.scrollHeight;
}

/**
 * Update status text
 * @param {string} text 
 * @param {boolean} [withSpinner=false]
 */
function updateStatus(text, withSpinner = false) {
  const statusP = elements.statusP;
  if (!statusP) return;
  if (withSpinner) {
    statusP.innerHTML = `${text} <span class="ellipsis" aria-hidden="true"></span>`;
  } else {
    statusP.textContent = text;
  }
}

/**
 * Enable or disable pagination buttons based on current state
 */
function updatePaginationButtons() {
  const { firstPageBtn, prevPageBtn, nextPageBtn, lastPageBtn, pageInfo } = elements;
  if (!firstPageBtn || !prevPageBtn || !nextPageBtn || !lastPageBtn || !pageInfo) return;

  // Enable buttons only after first batch is fully inserted
  const isEnabled = batchInsertedCount >= BATCH_SIZE;

  firstPageBtn.disabled = !isEnabled || currentPage === 0;
  prevPageBtn.disabled = !isEnabled || currentPage === 0;
  nextPageBtn.disabled = !isEnabled || currentPage >= totalPages - 1;
  lastPageBtn.disabled = !isEnabled || currentPage >= totalPages - 1;
  pageInfo.textContent = totalPages > 0 ? `Page ${currentPage + 1} / ${totalPages}` : 'Page 0 / 0';
}

/**
 * Load and display data entries for given page from IndexedDB
 * @param {number} page 
 */
function loadPage(page) {
  const { container } = elements;
  if (!container) return;

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

  request.onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      const div = document.createElement('div');
      div.className = 'ramadiv';
      div.textContent = `${cursor.value.text} (ID: ${cursor.value.id.toLocaleString()})`;
      fragment.appendChild(div);
      count++;
      cursor.continue();
    } else {
      container.appendChild(fragment);
      updateStatus(`Showing ${count} entries on page ${page + 1}.`);
      updatePaginationButtons();
    }
  };
}

/**
 * Show/hide app sections and update menu button states accordingly
 * @param {'about'|'insert'|'tools'} section 
 */
function showSection(section) {
  const { aboutPage, insertPage, toolsPage, menuAbout, menuInsert, menuTools } = elements;
  if (!aboutPage || !insertPage || !toolsPage || !menuAbout || !menuInsert || !menuTools) return;

  aboutPage.style.display = section === 'about' ? 'block' : 'none';
  insertPage.style.display = section === 'insert' ? 'block' : 'none';
  toolsPage.style.display = section === 'tools' ? 'block' : 'none';

  menuAbout.disabled = section === 'about';
  menuInsert.disabled = section === 'insert';
  menuTools.disabled = section === 'tools';
}

/**
 * Change insert process UI state
 * @param {'ready'|'inserting'|'done'} state 
 */
function setInsertState(state) {
  const { startBtn, cancelBtn, progressBar, totalTimeP } = elements;
  if (!startBtn || !cancelBtn || !progressBar || !totalTimeP) return;

  switch (state) {
    case 'ready':
      startBtn.disabled = false;
      startBtn.textContent = 'Start Insert 1 Crore';
      startBtn.classList.remove('working');
      cancelBtn.style.display = 'none';
      cancelBtn.disabled = false;
      progressBar.style.display = 'none';
      totalTimeP.textContent = '';
      break;

    case 'inserting':
      startBtn.disabled = true;
      startBtn.textContent = 'Inserting…';
      startBtn.classList.add('working');
      cancelBtn.style.display = 'inline-block';
      cancelBtn.disabled = false;
      progressBar.style.display = 'block';
      break;

    case 'done':
      startBtn.disabled = true;
      startBtn.textContent = '✅ Insertion Complete';
      startBtn.classList.remove('working');
      cancelBtn.style.display = 'none';
      progressBar.style.display = 'none';
      break;
  }
}

// ===== Event Handlers and Operational Functions =====

/**
 * Handler for starting insertion process
 */
function handleStartInsert() {
  if (isInserting) return;
  startInsertion();
}

/**
 * Perform the batch insertion in IndexedDB via Web Worker
 */
function startInsertion() {
  if (worker) worker.terminate();

  if(elements.logDiv) elements.logDiv.textContent = '';
  updateStatus('Starting insertion...', true);
  setInsertState('inserting');
  isInserting = true;
  cancelRequested = false;
  batchInsertedCount = 0;
  if(elements.progressBar) elements.progressBar.value = 0;
  insertionStartTime = performance.now();

  const phrase = elements.insertTextInput?.value?.trim() || 'JAI SRI RAM| జై శ్రీ రామ్  |जय श्री रामः';

  worker = new Worker('insertWorker.js');
  worker.postMessage({ DB_NAME, STORE_NAME, DB_VERSION, TOTAL_ENTRIES, BATCH_SIZE, phrase });

  worker.onmessage = (e) => {
    if (e.data.error) {
      log(`❌ Error: ${e.data.error}`);
      updateStatus('Insertion failed.', false);
      setInsertState('ready');
      isInserting = false;
      cancelRequested = false;
      return;
    }
    if (e.data.inserted) {
      batchInsertedCount = e.data.inserted;
      const elapsedSec = (performance.now() - insertionStartTime) / 1000;
      const speed = batchInsertedCount / elapsedSec;
      const remaining = TOTAL_ENTRIES - batchInsertedCount;
      const eta = remaining / speed;

      log(`📝 Inserted ${formatIndianNumber(batchInsertedCount)} records, batch took ${e.data.batchDurationSecs} sec.`);
      updateStatus(`Inserted ${formatIndianNumber(batchInsertedCount)} / ${formatIndianNumber(TOTAL_ENTRIES)} entries | Speed: ${speed.toFixed(2)}/sec | ETA: ${Math.ceil(eta / 60)} min`, true);

      if (elements.progressBar) elements.progressBar.value = Math.min(100, (batchInsertedCount / TOTAL_ENTRIES) * 100);

      if (batchInsertedCount >= BATCH_SIZE) enablePaginationButtons(true);

      if (batchInsertedCount % PAGE_SIZE === 0 || batchInsertedCount === TOTAL_ENTRIES) {
        totalPages = Math.ceil(Math.max(batchInsertedCount, TOTAL_ENTRIES) / PAGE_SIZE);
        currentPage = Math.min(Math.floor(batchInsertedCount / PAGE_SIZE), totalPages - 1);
        loadPage(currentPage);
        updatePaginationButtons();
      }
    }
    if (e.data.done) {
      const totalDuration = performance.now() - insertionStartTime;
      log('✅ Insertion complete!');
      updateStatus(`Insertion completed in ${formatDuration(totalDuration)}.`, false);
      if (elements.totalTimeP) elements.totalTimeP.textContent = `Total time: ${formatDuration(totalDuration)}`;
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
      if (elements.deleteDbBtn) elements.deleteDbBtn.disabled = false;
    }
  };

  worker.onerror = (e) => {
    log(`⚠️ Worker error: ${e.message}`);
    updateStatus('Insertion error.', false);
    setInsertState('ready');
    isInserting = false;
    cancelRequested = false;
  };
}

/**
 * Handler for Cancel Insertion button
 */
function handleCancelInsert() {
  if (!isInserting) return;
  if(elements.cancelBtn) elements.cancelBtn.disabled = true;

  if (worker) {
    worker.terminate();
    worker = null;
  }
  cancelRequested = true;
  updateStatus('Cancelling… Please wait.', false);
  log('❌ User cancelled insertion.');

  try {
    if (db) db.close();
    const deleteReq = indexedDB.deleteDatabase(DB_NAME);
    deleteReq.onsuccess = () => {
      log('✅ DB deleted after cancellation.');
      updateStatus('Insertion cancelled; database cleared.', false);
      clearUIAfterCancel();
    };
    deleteReq.onerror = () => {
      log('❌ Failed to delete DB after cancellation.');
      updateStatus('Failed to delete DB after cancellation.', false);
      if(elements.cancelBtn) elements.cancelBtn.disabled = false;
    };
  } catch (e) {
    log(`❌ Exception during cancellation: ${e}`);
    updateStatus('Error during cancellation.', false);
    if(elements.cancelBtn) elements.cancelBtn.disabled = false;
  }

  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    log('🧹 Cache cleared.');
  }
}

/**
 * Reset UI after cancellation of insertion
 */
function clearUIAfterCancel() {
  if(elements.logDiv) elements.logDiv.textContent = '';
  if(elements.container) elements.container.innerHTML = '';
  currentPage = 0;
  totalPages = 0;
  updatePaginationButtons();
  if(elements.deleteDbBtn) elements.deleteDbBtn.disabled = true;
  setInsertState('ready');
  if(elements.cancelBtn) {
    elements.cancelBtn.style.display = 'none';
    elements.cancelBtn.disabled = false;
  }
  if(elements.progressBar) elements.progressBar.style.display = 'none';
  if(elements.totalTimeP) elements.totalTimeP.textContent = '';
  isInserting = false;
}

/**
 * Handler for Delete Database button
 */
function handleDeleteDb() {
  if(elements.deleteDbBtn) elements.deleteDbBtn.disabled = true;
  updateStatus('Deleting database... Please wait.', false);
  log('🗑️ Deleting database requested.');

  try {
    if (worker) {
      worker.terminate();
      worker = null;
      isInserting = false;
      cancelRequested = false;
    }
    if (db) db.close();

    const deleteReq = indexedDB.deleteDatabase(DB_NAME);
    deleteReq.onsuccess = () => {
      log('✅ Database deleted.');
      updateStatus('Database deleted.', false);
      if(elements.logDiv) elements.logDiv.textContent = '';
      if(elements.container) elements.container.innerHTML = '';
      currentPage = 0;
      totalPages = 0;
      updatePaginationButtons();
      setInsertState('ready');
      if(elements.deleteDbBtn) elements.deleteDbBtn.disabled = true;
      if(elements.startBtn) elements.startBtn.disabled = false;
      if(elements.cancelBtn) {
        elements.cancelBtn.style.display = 'none';
        elements.cancelBtn.disabled = false;
      }
      if(elements.progressBar) elements.progressBar.style.display = 'none';
      if(elements.totalTimeP) elements.totalTimeP.textContent = '';
    };
    deleteReq.onerror = () => {
      log('❌ Failed to delete database.');
      updateStatus('Failed to delete database.', false);
      if(elements.deleteDbBtn) elements.deleteDbBtn.disabled = false;
    };
    deleteReq.onblocked = () => {
      log('⚠️ Delete blocked. Close other tabs.');
      updateStatus('Delete operation blocked.', false);
      if(elements.deleteDbBtn) elements.deleteDbBtn.disabled = false;
    };

    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      log('🧹 Cache cleared.');
    }
  } catch (err) {
    log(`❌ Exception during deletion: ${err}`);
    updateStatus('Error deleting database.', false);
    if(elements.deleteDbBtn) elements.deleteDbBtn.disabled = false;
  }
}

/**
 * Handle Export Data button click: export all data as JSON file
 */
async function handleExport() {
  if (!db) {
    alert('Database not open.');
    return;
  }
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const items = [];
    await new Promise((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else resolve();
      };
      req.onerror = e => reject(e.target.error);
    });

    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rama_koti_backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    alert(`Exported ${items.length} entries successfully.`);
  } catch (err) {
    alert('Export failed: ' + err);
  }
}

/**
 * Enable or disable pagination buttons
 * @param {boolean} enable
 */
function enablePaginationButtons(enable) {
  if (!elements.firstPageBtn || !elements.prevPageBtn || !elements.nextPageBtn || !elements.lastPageBtn) return;
  elements.firstPageBtn.disabled = !enable;
  elements.prevPageBtn.disabled = !enable;
  elements.nextPageBtn.disabled = !enable;
  elements.lastPageBtn.disabled = !enable;
}

/**
 * Scroll to top button visibility toggle
 */
function toggleGoTopButton() {
  if (!elements.goTopBtn) return;
  if (window.pageYOffset > 300) {
    elements.goTopBtn.classList.add('visible');
  } else {
    elements.goTopBtn.classList.remove('visible');
  }
}

/**
 * Scroll to top smoothly with live region update for screen readers
 */
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const liveRegion = document.querySelector('[aria-live="polite"]');
  if (liveRegion) liveRegion.textContent = 'Scrolled to top';
}

// ===== Initialization on window load =====

window.onload = async () => {
  // Cache DOM elements in 'elements' object
  elements = {
    startBtn: $('startBtn'),
    cancelBtn: $('cancelBtn'),
    deleteDbBtn: $('deleteDbBtn'),
    statusP: $('status'),
    totalTimeP: $('totalTime'),
    logDiv: $('logDiv'),
    container: $('dataContainer'),
    progressBar: $('progressBar'),
    firstPageBtn: $('firstPageBtn'),
    prevPageBtn: $('prevPageBtn'),
    nextPageBtn: $('nextPageBtn'),
    lastPageBtn: $('lastPageBtn'),
    pageInfo: $('pageInfo'),
    goTopBtn: $('goTopBtn'),
    insertTextInput: $('insertText'),
    exportBtn: $('exportBtn'),

    menuAbout: $('menuAbout'),
    menuInsert: $('menuInsert'),
    menuTools: $('menuTools'),

    aboutPage: $('aboutPage'),
    insertPage: $('insertPage'),
    toolsPage: $('toolsPage'),

    menuInstallBtn: $('menuInstallApp'),
    installPopup: $('installPopup'),
    installPopupBtn: $('installPopupBtn'),
    installPopupClose: $('closeInstallPopup'),
    installPopupText: $('installText')
  };

  // Navigation menu event listeners
  if (elements.menuAbout) elements.menuAbout.onclick = () => showSection('about');
  if (elements.menuInsert) elements.menuInsert.onclick = () => showSection('insert');
  if (elements.menuTools) elements.menuTools.onclick = () => showSection('tools');

  // Pagination buttons start disabled
  enablePaginationButtons(false);

  // Scroll to top button event setup
  if (elements.goTopBtn) {
    window.addEventListener('scroll', toggleGoTopButton);
    elements.goTopBtn.addEventListener('click', scrollToTop);
  }

  // Instantiate button event listeners (start, cancel, delete, export)
  if (elements.startBtn) elements.startBtn.onclick = handleStartInsert;
  if (elements.cancelBtn) elements.cancelBtn.onclick = handleCancelInsert;
  if (elements.deleteDbBtn) elements.deleteDbBtn.onclick = handleDeleteDb;
  if (elements.exportBtn) elements.exportBtn.onclick = handleExport;

  // Open the DB and load data
  try {
    await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      if (count > 0) {
        batchInsertedCount = count;
        elements.deleteDbBtn.disabled = false;
        totalPages = Math.ceil(count / PAGE_SIZE);
        currentPage = 0;
        loadPage(currentPage);
        enablePaginationButtons(true);
        setInsertState('done');
        updateStatus(`Loaded ${formatIndianNumber(count)} entries. Showing page 1.`);
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.progressBar) elements.progressBar.style.display = 'none';
      } else {
        enablePaginationButtons(false);
        if (elements.deleteDbBtn) elements.deleteDbBtn.disabled = true;
        setInsertState('ready');
        updateStatus('Database empty. Click "Start Insert 1 Crore" to begin.');
        if (elements.progressBar) elements.progressBar.style.display = 'none';
      }
    };
    countReq.onerror = () => {
      updateStatus('Unable to read database count.');
      setInsertState('ready');
      enablePaginationButtons(false);
      if (elements.progressBar) elements.progressBar.style.display = 'none';
    };
  } catch (e) {
    enablePaginationButtons(false);
    if (elements.deleteDbBtn) elements.deleteDbBtn.disabled = true;
    if (elements.startBtn) elements.startBtn.disabled = false;
    setInsertState('ready');
    updateStatus('Database not initialized. Click "Start Insert 1 Crore" to begin.');
    if (elements.progressBar) elements.progressBar.style.display = 'none';
  }
};
