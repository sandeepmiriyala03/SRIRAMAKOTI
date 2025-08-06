// ===== Constants =====
const DB_NAME = 'SriRamaDB';
const STORE_NAME = 'sriStore';
const DB_VERSION = 1;
const TOTAL_ENTRIES = 10000000;
const BATCH_SIZE = 10000;
const PAGE_SIZE = 5000;

// ===== State =====
let db = null;
let worker = null;
let currentPage = 0;
let totalPages = 0;
let isInserting = false;
let cancelRequested = false;
let batchInserted = 0;
let lastInsertedPhrase = '';

// ===== Cached Elements =====
const elements = {};

// ===== Utility Functions =====
const $ = (id) => document.getElementById(id);

function formatNumberIndian(num) {
  if (num < 100000) return num.toLocaleString();
  if (num < 10000000) return (num / 100000).toFixed(0) + ' Lakh';
  return (num / 10000000).toFixed(1) + ' Crore';
}
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  if (s || parts.length === 0) parts.push(`${s} second${s > 1 ? 's' : ''}`);
  return parts.join(' ');
}
function log(text) {
  if (!elements.logDiv) return;
  const div = document.createElement('div');
  div.textContent = text;
  div.style.opacity = 0;
  elements.logDiv.appendChild(div);
  requestAnimationFrame(() => {
    div.style.opacity = 1;
  });
  elements.logDiv.scrollTop = elements.logDiv.scrollHeight;
}
function updateStatus(text, withSpinner = false) {
  if (!elements.status) return;
  elements.status.innerHTML = withSpinner
    ? `${text} <span class="ellipsis" aria-hidden="true"></span>`
    : text;
}

// ===== Show/hide pagination and data container
function showPaging(show) {
  if (elements.paginationBar) elements.paginationBar.style.display = show ? '' : 'none';
  if (elements.dataContainer) elements.dataContainer.style.display = show ? '' : 'none';
}

function enablePagination(enabled) {
  ['first', 'prev', 'next', 'last'].forEach((key) => {
    const btn = elements[key + 'PageBtn'];
    if (btn) btn.disabled = !enabled;
  });
}

function updatePagination() {
  const { firstPageBtn, prevPageBtn, nextPageBtn, lastPageBtn, pageInfo } = elements;
  if (!(firstPageBtn && prevPageBtn && nextPageBtn && lastPageBtn && pageInfo)) return;

  showPaging(batchInserted > 0);

  if (batchInserted === 0) {
    firstPageBtn.disabled = true;
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    lastPageBtn.disabled = true;
    pageInfo.textContent = 'Page 0 / 0';
  } else {
    const enabled = batchInserted >= BATCH_SIZE;
    firstPageBtn.disabled = !enabled || currentPage === 0;
    prevPageBtn.disabled = !enabled || currentPage === 0;
    nextPageBtn.disabled = !enabled || currentPage >= totalPages - 1;
    lastPageBtn.disabled = !enabled || currentPage >= totalPages - 1;
    pageInfo.textContent = `Page ${currentPage + 1} / ${totalPages}`;
  }
}

// ===== IndexedDB handling =====
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const dbase = e.target.result;
      if (!dbase.objectStoreNames.contains(STORE_NAME)) {
        dbase.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      db.onversionchange = () => {
        db.close();
        db = null;
        updateStatus("Database outdated, please reload.");
      };
      resolve(db);
    };
    req.onerror = (e) => reject(e.target.error);
    req.onblocked = () => updateStatus("Database open blocked, close other tabs");
  });
}

// ===== Load and render data for a page =====
function loadPage(page) {
  if (!db) {
    updateStatus("Database not initialized.");
    return;
  }
  if (!elements.dataContainer) return;
  elements.dataContainer.innerHTML = '';

  const startId = page * PAGE_SIZE + 1;
  const maxId = Math.min(batchInserted, TOTAL_ENTRIES);
  if (startId > maxId) {
    elements.dataContainer.innerHTML = '<p style="text-align:center;color:#666;">Page not available yet, please wait.</p>';
    updateStatus("Page data not available.");
    updatePagination();
    return;
  }

  const endId = Math.min(startId + PAGE_SIZE - 1, maxId);
  updateStatus(`Loading page ${page + 1} (IDs ${startId.toLocaleString()} - ${endId.toLocaleString()})`);

  const txn = db.transaction(STORE_NAME, "readonly");
  const store = txn.objectStore(STORE_NAME);
  const req = store.openCursor(IDBKeyRange.bound(startId, endId));
  const frag = document.createDocumentFragment();
  let count = 0;

  req.onerror = () => updateStatus("Failed to load data.");
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const div = document.createElement("div");
      div.className = "ramadiv";
      div.textContent = `${cursor.value.text} (ID: ${cursor.value.id.toLocaleString()})`;
      frag.appendChild(div);
      count++;
      cursor.continue();
    } else {
      elements.dataContainer.appendChild(frag);
      updateStatus(`Showing ${count} entries on page ${page + 1}`);
      updatePagination();
    }
  };
}

// ===== Pagination Controls =====
function goFirst() {
  if (currentPage === 0) return;
  currentPage = 0;
  loadPage(currentPage);
  updatePagination();
}
function goPrev() {
  if (currentPage === 0) return;
  currentPage--;
  loadPage(currentPage);
  updatePagination();
}
function goNext() {
  if (currentPage >= totalPages - 1) return;
  currentPage++;
  loadPage(currentPage);
  updatePagination();
}
function goLast() {
  if (currentPage >= totalPages - 1) return;
  currentPage = totalPages - 1;
  loadPage(currentPage);
  updatePagination();
}

// ===== Section Navigation =====
function showSection(section) {
  ['aboutPage', 'insertPage', 'toolsPage'].forEach(id => {
    if (elements[id]) elements[id].style.display = (id === section + 'Page') ? "block" : "none";
  });
  if (elements.menuAbout) elements.menuAbout.disabled = (section === 'about');
  if (elements.menuInsert) elements.menuInsert.disabled = (section === 'insert');
  if (elements.menuTools) elements.menuTools.disabled = (section === 'tools');
}

// ===== UI updates for insertion =====
function setInsertState(state) {
  if (!elements.startBtn || !elements.cancelBtn || !elements.progressBar) return;
  switch (state) {
    case 'ready':
      elements.startBtn.disabled = false;
      elements.startBtn.textContent = 'Start Insertion';
      elements.startBtn.classList.remove('working');
      elements.cancelBtn.style.display = 'none';
      elements.cancelBtn.disabled = false;
      elements.progressBar.style.display = 'none';
      if (elements.deleteBtn) elements.deleteBtn.disabled = true;
      if (elements.exportBtn) elements.exportBtn.disabled = true;
      break;
    case 'inserting':
      elements.startBtn.disabled = true;
      elements.startBtn.textContent = 'Inserting...';
      elements.startBtn.classList.add('working');
      elements.cancelBtn.style.display = 'inline-block';
      elements.cancelBtn.disabled = false;
      elements.progressBar.style.display = 'block';
      if (elements.deleteBtn) elements.deleteBtn.disabled = true;
      if (elements.exportBtn) elements.exportBtn.disabled = true;
      break;
    case 'done':
      elements.startBtn.disabled = true;
      elements.startBtn.textContent = 'Completed ✓';
      elements.startBtn.classList.remove('working');
      elements.cancelBtn.style.display = 'none';
      elements.cancelBtn.disabled = true;
      elements.progressBar.style.display = 'none';
      if (elements.deleteBtn) elements.deleteBtn.disabled = false;
      if (elements.exportBtn) elements.exportBtn.disabled = false;
      break;
  }
}

// ===== Input Validation =====
function validateInput() {
  if (!elements.insertText) return false;
  const val = elements.insertText.value.trim();
  if (val.length < 4) {
    updateStatus('Please enter at least 4 characters in phrase.');
    elements.insertText.focus();
    return false;
  }
  return true;
}

// ===== Start Insertion =====
async function startInsertion() {
  if (isInserting) return;
  if (!validateInput()) return;

  const currPhrase = elements.insertText.value.trim() || 'JAI SRI RAM| జై శ్రీ రామ్|जय श्री राम';
  if (lastInsertedPhrase && lastInsertedPhrase !== currPhrase) {
    await deleteDatabase(true);
  }
  lastInsertedPhrase = currPhrase;

  if (worker) worker.terminate();
  if (elements.logDiv) elements.logDiv.textContent = '';
  updateStatus('Starting insertion...', true);
  setInsertState('inserting');

  isInserting = true;
  cancelRequested = false;
  batchInserted = 0;
  const startTime = performance.now();

  if (elements.progressBar) elements.progressBar.value = 0;

  worker = new Worker('sriramainsert.js');
  worker.postMessage({ DB_NAME, STORE_NAME, DB_VERSION, TOTAL_ENTRIES, BATCH_SIZE, phrase: currPhrase });

  worker.onmessage = async (e) => {
    if (e.data.error) {
      log(`Error: ${e.data.error}`);
      updateStatus('Insertion failed', false);
      setInsertState('ready');
      isInserting = false;
      cancelRequested = false;
      return;
    }
    if (e.data.inserted) {
      batchInserted = e.data.inserted;
      const elapsed = (performance.now() - startTime) / 1000;
      const speed = batchInserted / elapsed;
      const eta = (TOTAL_ENTRIES - batchInserted) / speed;

      log(`Inserted ${formatNumberIndian(batchInserted)} entries (batch took ${e.data.batchDurationSecs}s)`);
      updateStatus(`Inserted ${formatNumberIndian(batchInserted)} / ${formatNumberIndian(TOTAL_ENTRIES)} entries - Speed: ${speed.toFixed(2)} / sec - ETA: ${Math.ceil(eta / 60)} min`, true);

      if (elements.progressBar) elements.progressBar.value = Math.min(100, (batchInserted / TOTAL_ENTRIES) * 100);

      if (batchInserted >= BATCH_SIZE) enablePagination(true);

      if (batchInserted % PAGE_SIZE === 0 || batchInserted === TOTAL_ENTRIES) {
        totalPages = Math.ceil(batchInserted / PAGE_SIZE);
        currentPage = Math.min(Math.floor(batchInserted / PAGE_SIZE), totalPages - 1);
        await openDB(); // Reopen DB after delete & insert
        loadPage(currentPage);
        updatePagination();
      }
    }
    if (e.data.done) {
      const totalTime = performance.now() - startTime;
      log('Insertion complete!');
      updateStatus(`Insertion completed in ${formatDuration(totalTime)}`, false);
      if (elements.total) elements.total.textContent = `Total time: ${formatDuration(totalTime)}`;
      totalPages = Math.ceil(TOTAL_ENTRIES / PAGE_SIZE);
      currentPage = 0;
      await openDB(); // Reopen DB to reset for new data
      loadPage(currentPage);
      enablePagination(true);
      updatePagination();
      setInsertState('done');
      isInserting = false;
      cancelRequested = false;
      if (typeof window.confetti === 'function') window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      if (elements.deleteBtn) elements.deleteBtn.disabled = false;
    }
  };

  worker.onerror = (e) => {
    log(`Worker error: ${e.message}`);
    updateStatus('Insertion error', false);
    setInsertState('ready');
    isInserting = false;
    cancelRequested = false;
  };
}

// ===== Cancel insertion =====
async function cancelInsertion() {
  if (!isInserting) return;
  if (elements.cancelBtn) elements.cancelBtn.disabled = true;
  cancelRequested = true;
  if (worker) { worker.terminate(); worker = null; }
  updateStatus('Cancelling insertion...', false);
  log('User cancelled insertion.');

  try {
    if (db) { db.close(); db = null; }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      log('Database deleted due to cancellation.');
      updateStatus('Cancelled. Database cleared.');
      clearUI();
    };
    req.onerror = () => {
      updateStatus('Failed to clear database after cancellation.');
      if (elements.cancelBtn) elements.cancelBtn.disabled = false;
    };
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      log('Cache cleared.');
    }
  } catch (err) {
    updateStatus(`Error during cancellation: ${err}`);
    if (elements.cancelBtn) elements.cancelBtn.disabled = false;
  }
}

// ===== Delete database =====
async function deleteDatabase(autoConfirm = false) {
  if (!db) return;
  if (!autoConfirm) {
    if (!confirm('Are you sure you want to delete all data? This action cannot be undone.')) return;
  }
  if (elements.deleteBtn) elements.deleteBtn.disabled = true;
  updateStatus('Deleting database...', false);
  log('Delete requested.');

  try {
    if (worker) {
      worker.terminate();
      worker = null;
      isInserting = false;
      cancelRequested = false;
    }
    if (db) {
      db.close();
      db = null;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      log('Database deleted.');
      updateStatus('Database deleted.');
      clearUI();
    };
    req.onerror = () => {
      updateStatus('Failed to delete database.');
      if (elements.deleteBtn) elements.deleteBtn.disabled = false;
    };
    req.onblocked = () => {
      updateStatus('Delete operation blocked, close other tabs.');
      if (elements.deleteBtn) elements.deleteBtn.disabled = false;
    };
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
      log('Cache cleared.');
    }
  } catch (err) {
    updateStatus('Error during deletion: ' + err);
    if (elements.deleteBtn) elements.deleteBtn.disabled = false;
  }
}

// ===== Export data =====
async function exportData() {
  if (!db) {
    alert('Database not open.');
    return;
  }
  if (elements.exportBtn) elements.exportBtn.disabled = true;
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const results = [];
    await new Promise((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(new Error('Cursor iteration failed'));
    });
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rama_koti_backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    alert(`Exported ${results.length} records successfully.`);
  } catch (e) {
    alert('Export failed: ' + e);
  }
  if (elements.exportBtn) elements.exportBtn.disabled = false;
}

// ===== Clear UI =====
function clearUI() {
  if (elements.logDiv) elements.logDiv.textContent = '';
  if (elements.dataContainer) {
    elements.dataContainer.innerHTML = '';
    elements.dataContainer.style.display = 'none';
  }
  if (elements.paginationBar) elements.paginationBar.style.display = 'none';
  batchInserted = 0;
  currentPage = 0;
  totalPages = 0;
  if (elements.pageInfo) elements.pageInfo.textContent = 'Page 0 / 0';
  updateStatus('Ready');
  enablePagination(false);
  setInsertState('ready');
}

// ===== Scroll helpers =====
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const liveRegion = document.querySelector('[aria-live="polite"]');
  if (liveRegion) liveRegion.textContent = 'Scrolled to top';
}
function setupScrollListener() {
  if (!elements.go) return;
  elements.go.style.display = 'none';
  window.addEventListener('scroll', () => {
    elements.go.style.display = window.pageYOffset > 200 ? 'block' : 'none';
  });
  elements.go.onclick = scrollToTop;
}

// ===== Initialization =====
window.onload = async () => {
  Object.assign(elements, {
    startBtn: $('startBtn'),
    cancelBtn: $('cancelBtn'),
    deleteBtn: $('deleteBtn'),
    exportBtn: $('exportBtn'),
    status: $('status'),
    total: $('totalTime'),
    logDiv: $('logDiv'),
    dataContainer: $('dataContainer'),
    paginationBar: $('paginationBar'),
    progressBar: $('progressBar'),
    firstPageBtn: $('firstPageBtn'),
    prevPageBtn: $('prevPageBtn'),
    nextPageBtn: $('nextPageBtn'),
    lastPageBtn: $('lastPageBtn'),
    pageInfo: $('pageInfo'),
    go: $('goTop'),
    insertText: $('insertText'),
    menuAbout: $('menuAbout'),
    menuInsert: $('menuInsert'),
    menuTools: $('menuTools'),
    aboutPage: $('aboutPage'),
    insertPage: $('insertPage'),
    toolsPage: $('toolsPage'),
    menuInstall: $('menuInstall'),
    installPopup: $('installPopup'),
    installBtn: $('installBtn'),
    installClose: $('installClose'),
  });

  // Setup navigation
  if (elements.menuAbout) elements.menuAbout.onclick = () => showSection('about');
  if (elements.menuInsert) elements.menuInsert.onclick = () => showSection('insert');
  if (elements.menuTools) elements.menuTools.onclick = () => showSection('tools');

  // Setup pagination buttons
  if (elements.firstPageBtn) elements.firstPageBtn.onclick = goFirst;
  if (elements.prevPageBtn) elements.prevPageBtn.onclick = goPrev;
  if (elements.nextPageBtn) elements.nextPageBtn.onclick = goNext;
  if (elements.lastPageBtn) elements.lastPageBtn.onclick = goLast;

  // Setup scroll button
  setupScrollListener();

  // Setup main control buttons
  if (elements.startBtn) elements.startBtn.onclick = startInsertion;
  if (elements.cancelBtn) elements.cancelBtn.onclick = cancelInsertion;
  if (elements.deleteBtn) elements.deleteBtn.onclick = () => {
    if (!elements.deleteBtn.disabled) deleteDatabase(false);
  };
  if (elements.exportBtn) elements.exportBtn.onclick = () => {
    if (!elements.exportBtn.disabled) exportData();
  };

  // Open DB and load data if available
  try {
    await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const count = countReq.result;
      batchInserted = count;
      totalPages = Math.ceil(count / PAGE_SIZE);
      currentPage = 0;
      if (count > 0) {
        if (elements.startBtn) elements.startBtn.disabled = true;
        if (elements.cancelBtn) elements.cancelBtn.style.display = 'inline-block';
        if (elements.deleteBtn) elements.deleteBtn.disabled = false;
        if (elements.exportBtn) elements.exportBtn.disabled = false;
        loadPage(currentPage);
        updatePagination();
        enablePagination(true);
        setInsertState('done');
        updateStatus(`Loaded ${formatNumberIndian(count)} entries. Showing page 1.`);
      } else {
        setInsertState('ready');
        enablePagination(false);
        updateStatus('Database empty. Please start insertion.');
        if (elements.cancelBtn) elements.cancelBtn.style.display = 'none';
        if (elements.deleteBtn) elements.deleteBtn.disabled = true;
        if (elements.exportBtn) elements.exportBtn.disabled = true;
        if (elements.startBtn) elements.startBtn.disabled = false;
        showPaging(false);
      }
      if (elements.progressBar) elements.progressBar.style.display = 'none';
    };
    countReq.onerror = () => {
      updateStatus('Failed to read entries.');
      enablePagination(false);
      setInsertState('ready');
      if (elements.progressBar) elements.progressBar.style.display = 'none';
      showPaging(false);
    };
  } catch (error) {
    updateStatus(`Failed to open database: ${error}`);
    enablePagination(false);
    setInsertState('ready');
    if (elements.deleteBtn) elements.deleteBtn.disabled = true;
    if (elements.exportBtn) elements.exportBtn.disabled = true;
    if (elements.startBtn) elements.startBtn.disabled = false;
    if (elements.progressBar) elements.progressBar.style.display = 'none';
    showPaging(false);
  }
};
