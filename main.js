// ===================================================================
// MAIN.JS - Sri Rama Koti PWA
// Author: Sandeep Miriyala (vanisandeep@gmail.com)
// Repository: https://github.com/sandeepmiriyala03/SRIRAMAKOTI.git
// ===================================================================

// ===== CONFIGURATION CONSTANTS =====
const DB_NAME = 'SriRamaDB';
const STORE_NAME = 'sriStore';
const DB_VERSION = 1;
const TOTAL_ENTRIES = 10000000;
const BATCH_SIZE = 50000;
const PAGE_SIZE = 5000;

// ===== APPLICATION STATE =====
let db = null;
let worker = null;
let currentPage = 0;
let totalPages = 0;
let isInserting = false;
let cancelRequested = false;
let batchInserted = 0;
let lastInsertedPhrase = '';
let milestoneShown = false;

// ===== CACHED DOM ELEMENTS =====
const elements = {};

// ===== UTILITY FUNCTIONS =====
const $ = id => document.getElementById(id);

function formatNumberIndian(num) {
  if (num < 100000) return num.toLocaleString();
  if (num < 10000000) return (num / 100000).toFixed(0) + ' Lakh';
  return (num / 10000000).toFixed(1) + ' Crore';
}

function formatDuration(ms) {
  const secs = Math.floor(ms / 1000),
    h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60),
    s = secs % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
  if (s || !parts.length) parts.push(`${s} second${s > 1 ? 's' : ''}`);
  return parts.join(' ');
}

function log(text) {
  if (!elements.logDiv) return;
  const div = document.createElement('div');
  div.textContent = text;
  div.style.opacity = 0;
  elements.logDiv.appendChild(div);
  requestAnimationFrame(() => (div.style.opacity = 1));
  elements.logDiv.scrollTop = elements.logDiv.scrollHeight;
}

function updateStatus(text, withSpinner = false) {
  if (!elements.status) return;
  elements.status.innerHTML = withSpinner
    ? `${text} <span class="ellipsis" aria-hidden="true"></span>`
    : text;
}

// Show or hide pagination panel
function showPaging(show) {
  if (elements.paginationBar) elements.paginationBar.style.display = show ? '' : 'none';
}

// Show or hide data container, clear if hiding
function showDataContainer(show) {
  if (elements.dataContainer) {
    elements.dataContainer.style.display = show ? '' : 'none';
    if (!show) elements.dataContainer.innerHTML = '';
  }
}

// Enable or disable all pagination buttons
function enablePagination(enabled) {
  ['first', 'prev', 'next', 'last'].forEach(key => {
    const btn = elements[key + 'PageBtn'];
    if (btn) btn.disabled = !enabled;
  });
}

// Update pagination buttons and page info
function updatePagination() {
  const { firstPageBtn, prevPageBtn, nextPageBtn, lastPageBtn, pageInfo } = elements;
  if (!(firstPageBtn && prevPageBtn && nextPageBtn && lastPageBtn && pageInfo)) return;
  const show = batchInserted >= TOTAL_ENTRIES && batchInserted > 0;
  showPaging(show);
  showDataContainer(show);

  if (batchInserted === 0 || totalPages === 0) {
    [firstPageBtn, prevPageBtn, nextPageBtn, lastPageBtn].forEach(btn => (btn.disabled = true));
    pageInfo.textContent = 'Page 0 / 0';
  } else {
    const enabled = batchInserted >= TOTAL_ENTRIES && totalPages > 0;
    firstPageBtn.disabled = !enabled || currentPage === 0;
    prevPageBtn.disabled = !enabled || currentPage === 0;
    nextPageBtn.disabled = !enabled || currentPage >= totalPages - 1;
    lastPageBtn.disabled = !enabled || currentPage >= totalPages - 1;
    pageInfo.textContent = `Page ${currentPage + 1} / ${totalPages}`;
  }
}

// Open or create IndexedDB database with proper upgrade handling
async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const dbase = e.target.result;
      if (!dbase.objectStoreNames.contains(STORE_NAME)) {
        dbase.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => {
      db = e.target.result;
      db.onversionchange = () => {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.close();
          db = null;
          updateStatus('Database connection lost or outdated, please reload.');
        }
      };
      resolve(db);
    };
    req.onerror = e => reject(e.target.error);
    req.onblocked = () => updateStatus('Database open blocked, close other tabs');
  });
}

// Load and render a given page of records
function loadPage(page) {
  if (!db) {
    updateStatus('Database not initialized.');
    return;
  }
  if (!elements.dataContainer) {
    console.warn('Data container element missing.');
    return;
  }
  if (batchInserted < TOTAL_ENTRIES) {
    showDataContainer(false);
    return;
  }
  if (!totalPages) totalPages = 0;
  if (totalPages === 0) {
    elements.dataContainer.innerHTML = '<p style="text-align:center;color:#666;">No data available.</p>';
    updateStatus('No data available to display.');
    updatePagination();
    return;
  }
  if (page < 0) page = 0;
  if (page >= totalPages) page = totalPages - 1;
  currentPage = page;

  elements.dataContainer.innerHTML = '<p style="text-align:center;color:#666;"><span class="ellipsis">Loading page data</span></p>';
  showDataContainer(true);

  const startId = page * PAGE_SIZE + 1;
  const maxId = Math.min(batchInserted, TOTAL_ENTRIES);
  if (startId > maxId) {
    elements.dataContainer.innerHTML = '<p style="text-align:center;color:#666;">Page data not available yet, please wait.</p>';
    updateStatus('Page data not available.');
    updatePagination();
    return;
  }

  const endId = Math.min(startId + PAGE_SIZE - 1, maxId);
  updateStatus(`Loading page ${page + 1} (IDs ${startId.toLocaleString()} - ${endId.toLocaleString()})`);

  try {
    const txn = db.transaction(STORE_NAME, 'readonly');
    const store = txn.objectStore(STORE_NAME);
    const req = store.openCursor(IDBKeyRange.bound(startId, endId));
    const frag = document.createDocumentFragment();
    let count = 0;

    req.onerror = () => {
      updateStatus('Failed to load data.');
      elements.dataContainer.innerHTML = '<p style="text-align:center;color:#d00;">Failed to load data.</p>';
    };
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const div = document.createElement('div');
        div.className = 'ramadiv';
        div.textContent = `${cursor.value.text} (ID: ${cursor.value.id.toLocaleString()})`;
        frag.appendChild(div);
        count++;
        cursor.continue();
      } else {
        if (count === 0) {
          elements.dataContainer.innerHTML = '<p style="text-align:center;color:#666;">No records on this page.</p>';
          updateStatus('No records found on this page.');
        } else {
          elements.dataContainer.innerHTML = '';
          elements.dataContainer.appendChild(frag);
          updateStatus(`Showing ${count} entries on page ${page + 1}`);
        }
        updatePagination();
      }
    };
  } catch (error) {
    updateStatus('Error loading page data.');
    console.error(error);
  }
}

// Pagination control functions
function goFirst() {
  if (totalPages && batchInserted >= TOTAL_ENTRIES && currentPage > 0) {
    currentPage = 0;
    loadPage(currentPage);
    updatePagination();
  }
}
function goPrev() {
  if (totalPages && batchInserted >= TOTAL_ENTRIES && currentPage > 0) {
    currentPage--;
    loadPage(currentPage);
    updatePagination();
  }
}
function goNext() {
  if (totalPages && batchInserted >= TOTAL_ENTRIES && currentPage < totalPages - 1) {
    currentPage++;
    loadPage(currentPage);
    updatePagination();
  }
}
function goLast() {
  if (totalPages && batchInserted >= TOTAL_ENTRIES && currentPage < totalPages - 1) {
    currentPage = totalPages - 1;
    loadPage(currentPage);
    updatePagination();
  }
}

// Navigation between sections
function showSection(section) {
  ['aboutPage', 'insertPage', 'toolsPage'].forEach(id => {
    if (elements[id]) elements[id].style.display = id === section + 'Page' ? 'block' : 'none';
  });
  if (elements.menuAbout) elements.menuAbout.disabled = section === 'about';
  if (elements.menuInsert) elements.menuInsert.disabled = section === 'insert';
  if (elements.menuTools) elements.menuTools.disabled = section === 'tools';
}

// Insertion UI states
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

// Input validation
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

// Start insertion process
async function startInsertion() {
  if (isInserting) {
    updateStatus('Insertion already in progress.');
    return;
  }
  if (!validateInput()) return;

  const currPhrase = elements.insertText.value.trim() || 'JAI SRI RAM| జై శ్రీ రామ్|जय श्री राम';

  // If phrase changed, clear existing DB first
  if (lastInsertedPhrase && lastInsertedPhrase !== currPhrase) {
    await deleteDatabase(true);
  }
  lastInsertedPhrase = currPhrase;

  // Terminate existing worker aggressively before starting new
  if (worker) {
    worker.terminate();
    worker = null;
  }

  cancelRequested = false;
  clearUI();
  updateStatus('Starting insertion...', true);
  setInsertState('inserting');
  isInserting = true;
  batchInserted = 0;
  milestoneShown = false;
  const startTime = performance.now();

  if (elements.progressBar) elements.progressBar.value = 0;

  // Create new worker
  worker = new Worker('sriramainsert.js');
  worker.postMessage({ DB_NAME, STORE_NAME, DB_VERSION, TOTAL_ENTRIES, BATCH_SIZE, phrase: currPhrase });

  worker.onmessage = async (e) => {
    if (e.data.error) {
      log(`Error: ${e.data.error}`);

      // If error indicates DB closing, cancel insertion gracefully
      if (e.data.error.includes("transaction on 'IDBDatabase': The database connection is closing")) {
        updateStatus('Database connection is closing. Cancelling insertion...', false);
      } else {
        updateStatus('Insertion failed', false);
      }

      setInsertState('ready');
      isInserting = false;
      cancelRequested = false;
      worker.terminate();
      worker = null;
      return;
    }

    if (e.data.inserted) {
      batchInserted = e.data.inserted;

      if (batchInserted >= TOTAL_ENTRIES && !milestoneShown) {
        milestoneShown = true;
        if (elements.milestoneDiv) elements.milestoneDiv.style.display = 'block';
        updateStatus('🎉 1 Crore entries completed! Congratulations!', false);
      }

      const elapsed = (performance.now() - startTime) / 1000;
      const speed = batchInserted / elapsed;
      const eta = (TOTAL_ENTRIES - batchInserted) / speed;

      if (batchInserted % (BATCH_SIZE * 5) === 0 || batchInserted === TOTAL_ENTRIES) {
        log(`Inserted ${formatNumberIndian(batchInserted)} entries (batch took ${e.data.batchDurationSecs}s)`);
        updateStatus(`Inserted ${formatNumberIndian(batchInserted)} / ${formatNumberIndian(TOTAL_ENTRIES)} entries - Speed: ${speed.toFixed(2)} / sec - ETA: ${Math.ceil(eta / 60)} min`, true);
        if (elements.progressBar) elements.progressBar.value = Math.min(100, (batchInserted / TOTAL_ENTRIES) * 100);
      }

      if (batchInserted >= TOTAL_ENTRIES) {
        enablePagination(true);
        totalPages = Math.ceil(TOTAL_ENTRIES / PAGE_SIZE);
        currentPage = 0;
        await openDB();
        loadPage(currentPage);
        updatePagination();
      }
    }

    if (e.data.done) {
      const totalTime = performance.now() - startTime;
      log('Insertion complete!');
      updateStatus(`Insertion completed in ${formatDuration(totalTime)}`, false);
      if (elements.total) elements.total.textContent = `Total time: ${formatDuration(totalTime)}`;
      isInserting = false;
      cancelRequested = false;
      setInsertState('done');
      if (worker) {
        worker.terminate();
        worker = null;
      }

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
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };
}

// Cancel insertion process
async function cancelInsertion() {
  if (!isInserting) return;
  if (elements.cancelBtn) elements.cancelBtn.disabled = true;
  cancelRequested = true;

  if (worker) {
    worker.terminate();
    worker = null;
  }

  updateStatus('Cancelling insertion...', false);
  log('User cancelled insertion.');

  try {
    if (db && db.close) {
      db.close();
      db = null;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      log('Database deleted due to cancellation.');
      updateStatus('Cancelled. Database cleared.');
      clearUI();
      isInserting = false;
      cancelRequested = false;
      setInsertState('ready');
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
    console.error('Error during cancellation:', err);
    updateStatus(`Error during cancellation: ${err}`);
    if (elements.cancelBtn) elements.cancelBtn.disabled = false;
  }
}

// Delete database with user confirmation
async function deleteDatabase(autoConfirm = false) {
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
    if (db && db.close) {
      db.close();
      db = null;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      log('Database deleted.');
      updateStatus('Database deleted.');
      clearUI();
      setInsertState('ready');
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
    console.error('Error during deletion:', err);
    updateStatus('Error during deletion: ' + err);
    if (elements.deleteBtn) elements.deleteBtn.disabled = false;
  }
}

// Export all records to JSON
async function exportData() {
  if (!db) {
    alert('Database not open.');
    return;
  }
  if (batchInserted < TOTAL_ENTRIES) {
    alert('Please complete the full 1 crore insertion before exporting.');
    return;
  }
  if (elements.exportBtn) elements.exportBtn.disabled = true;
  updateStatus('Exporting data...', true);

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
    updateStatus('Export completed successfully.');
    alert(`Exported ${results.length} records successfully.`);
  } catch (e) {
    console.error('Export failed:', e);
    updateStatus('Export failed.');
    alert('Export failed: ' + e);
  }
  if (elements.exportBtn) elements.exportBtn.disabled = false;
}

// Clear UI to ready state
function clearUI() {
  if (elements.logDiv) elements.logDiv.innerHTML = '<div>Ready to start...</div>';
  if (elements.dataContainer) elements.dataContainer.innerHTML = '';
  showDataContainer(false);
  showPaging(false);

  batchInserted = 0;
  currentPage = 0;
  totalPages = 0;
  if (elements.pageInfo) elements.pageInfo.textContent = 'Page 0 / 0';
  updateStatus('Ready');
  enablePagination(false);
  milestoneShown = false;
  if (elements.milestoneDiv) elements.milestoneDiv.style.display = 'none';
  if (elements.progressBar) {
    elements.progressBar.value = 0;
    elements.progressBar.style.display = 'none';
  }
  if (elements.total) elements.total.textContent = '';
}

// Scroll helpers
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

// Initialization on page load
window.onload = async () => {
  try {
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
      milestoneDiv: $('milestoneDiv'),
    });

    // Setup navigation buttons
    if (elements.menuAbout) elements.menuAbout.onclick = () => showSection('about');
    if (elements.menuInsert) elements.menuInsert.onclick = () => showSection('insert');
    if (elements.menuTools) elements.menuTools.onclick = () => showSection('tools');

    // Setup pagination buttons
    if (elements.firstPageBtn) elements.firstPageBtn.onclick = goFirst;
    if (elements.prevPageBtn) elements.prevPageBtn.onclick = goPrev;
    if (elements.nextPageBtn) elements.nextPageBtn.onclick = goNext;
    if (elements.lastPageBtn) elements.lastPageBtn.onclick = goLast;

    // Setup scroll to top button
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

    // Open DB and check existing entries
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
        if (count >= TOTAL_ENTRIES) {
          if (elements.startBtn) elements.startBtn.disabled = true;
          if (elements.cancelBtn) elements.cancelBtn.style.display = 'none';
          if (elements.deleteBtn) elements.deleteBtn.disabled = false;
          if (elements.exportBtn) elements.exportBtn.disabled = false;
          loadPage(currentPage);
          updatePagination();
          enablePagination(true);
          setInsertState('done');
          updateStatus(`Loaded ${formatNumberIndian(count)} entries. 1 Crore completed!`);

          if (elements.milestoneDiv) {
            milestoneShown = true;
            elements.milestoneDiv.style.display = 'block';
          }
        } else if (count > 0) {
          updateStatus(`Found ${formatNumberIndian(count)} entries. Continue insertion to reach 1 crore.`);
          setInsertState('ready');
          enablePagination(false);
          showDataContainer(false);
          showPaging(false);
        } else {
          setInsertState('ready');
          enablePagination(false);
          updateStatus('Database empty. Please start insertion.');
          if (elements.cancelBtn) elements.cancelBtn.style.display = 'none';
          if (elements.deleteBtn) elements.deleteBtn.disabled = true;
          if (elements.exportBtn) elements.exportBtn.disabled = true;
          showDataContainer(false);
          showPaging(false);
        }
        if (elements.progressBar) elements.progressBar.style.display = 'none';
      };
      countReq.onerror = () => {
        console.error('Failed to read entries count');
        updateStatus('Failed to read entries.');
        enablePagination(false);
        setInsertState('ready');
        if (elements.progressBar) elements.progressBar.style.display = 'none';
        showDataContainer(false);
        showPaging(false);
      };
    } catch (error) {
      console.error('Database open error:', error);
      updateStatus(`Failed to open database: ${error}`);
      enablePagination(false);
      setInsertState('ready');
      if (elements.deleteBtn) elements.deleteBtn.disabled = true;
      if (elements.exportBtn) elements.exportBtn.disabled = true;
      if (elements.progressBar) elements.progressBar.style.display = 'none';
      showDataContainer(false);
      showPaging(false);
    }
  } catch (error) {
    console.error('Initialization error:', error);
    updateStatus('Application failed to initialize. Please refresh the page.');
  }
};

// Global error handlers
window.addEventListener('error', e => {
  console.error('Global error:', e.error);
  if (elements.status) updateStatus('An error occurred. Please refresh the page if problems persist.');
});
window.addEventListener('unhandledrejection', e => {
  console.error('Unhandled rejection:', e.reason);
  if (elements.status) updateStatus('An error occurred. Please refresh the page if problems persist.');
});

// Cleanup on Tab or Window Close: Delete IndexedDB, clear caches, localStorage, sessionStorage
window.addEventListener('beforeunload', () => {
  try {
    if (db && db.close) {
      db.close();
      db = null;
    }
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    deleteRequest.onsuccess = () => {
      console.log('IndexedDB deleted on tab close.');
    };
    deleteRequest.onerror = () => {
      console.warn('Failed to delete IndexedDB on tab close.');
    };
  } catch (err) {
    console.error('Error deleting IndexedDB on tab close:', err);
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
    console.log('localStorage and sessionStorage cleared on tab close.');
  } catch (err) {
    console.error('Error clearing storage on tab close:', err);
  }
  if ('caches' in window) {
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => {
        console.log('Cache storage cleared on tab close.');
      })
      .catch(e => {
        console.warn('Failed to clear Cache storage on tab close:', e);
      });
  }
});
