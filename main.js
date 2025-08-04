// PWA Install Prompt Handling
let deferredPrompt;
const installBanner = document.getElementById('installBanner');
const installBtn = document.getElementById('installBtn');
const dismissInstallBtn = document.getElementById('dismissInstallBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBanner.style.display = 'flex';
});

installBtn.onclick = async () => {
  installBanner.style.display = 'none';
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
};

dismissInstallBtn.onclick = () => {
  installBanner.style.display = 'none';
  deferredPrompt = null;
};

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => {
    console.log('Service Worker registered');
  }).catch(e => console.error('Service Worker registration failed:', e));
}

// Constants
const DB_NAME = 'SriRamaKotiDB';
const STORE_NAME = 'sriRamaStore';
const DB_VERSION = 1;
const TOTAL_ENTRIES = 10000000; // Change to 10000000 for 1 crore 
const BATCH_SIZE = 100000; // Adjust batch size for performance
const PAGE_SIZE = 5000;

let db;
let worker;
let currentPage = 0;
let totalPages = 0;

const startBtn = document.getElementById('startBtn');
const deleteDbBtn = document.getElementById('deleteDbBtn');
const statusP = document.getElementById('status');
const logDiv = document.getElementById('logDiv');
const container = document.getElementById('dataContainer');
const firstPageBtn = document.getElementById('firstPageBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const lastPageBtn = document.getElementById('lastPageBtn');
const pageInfo = document.getElementById('pageInfo');

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
      resolve(db);
    };
    request.onerror = e => reject(e.target.error);
  });
}

function log(text) {
  logDiv.textContent += text + '\n';
  logDiv.scrollTop = logDiv.scrollHeight;
}

function updateStatus(text) {
  statusP.textContent = text;
}

function formatIndianNumber(num) {
  if (num < 100000) return num.toLocaleString();
  if (num < 10000000) return (num / 100000).toFixed(0) + ' Lakh';
  return (num / 10000000).toFixed(1) + ' Crore';
}

function loadPage(page) {
  container.innerHTML = '';
  const startId = page * PAGE_SIZE + 1;
  const endId = Math.min(startId + PAGE_SIZE - 1, TOTAL_ENTRIES);

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

function updatePaginationButtons() {
  firstPageBtn.disabled = currentPage === 0;
  prevPageBtn.disabled = currentPage === 0;
  nextPageBtn.disabled = currentPage >= totalPages - 1;
  lastPageBtn.disabled = currentPage >= totalPages - 1;
  pageInfo.textContent = `Page ${currentPage + 1} / ${totalPages}`;
}

firstPageBtn.onclick = () => {
  if (currentPage !== 0) {
    currentPage = 0;
    loadPage(currentPage);
  }
};

prevPageBtn.onclick = () => {
  if (currentPage > 0) {
    currentPage--;
    loadPage(currentPage);
  }
};

nextPageBtn.onclick = () => {
  if (currentPage < totalPages - 1) {
    currentPage++;
    loadPage(currentPage);
  }
};

lastPageBtn.onclick = () => {
  if (currentPage !== totalPages - 1) {
    currentPage = totalPages - 1;
    loadPage(currentPage);
  }
};

function startInsertion() {
  if (worker) worker.terminate();
  logDiv.textContent = '';
  updateStatus('Starting insertion in background...');
  startBtn.disabled = true;

  worker = new Worker('insertWorker.js');
  worker.postMessage({ DB_NAME, STORE_NAME, DB_VERSION, TOTAL_ENTRIES, BATCH_SIZE });

  worker.onmessage = e => {
    if (e.data.inserted) {
      log(`📝 Inserted ${formatIndianNumber(e.data.inserted)} entries, batch took ${e.data.batchDurationSecs} seconds.`);
      updateStatus(`Inserted ${formatIndianNumber(e.data.inserted)} / ${formatIndianNumber(TOTAL_ENTRIES)} entries`);
    }
    if (e.data.done) {
      log('✅ Insertion complete.');
      updateStatus('Insertion complete. Loading first page...');
      totalPages = Math.ceil(TOTAL_ENTRIES / PAGE_SIZE);
      currentPage = 0;
      loadPage(currentPage);
      updatePaginationButtons();
      startBtn.disabled = false;
    }
  };

  worker.onerror = e => {
    log(`Worker error: ${e.message}`);
    updateStatus('Insertion error.');
    startBtn.disabled = false;
  };
}

// Improved delete database function with better confirmation
async function deleteDatabase() {
  // First confirmation
  const firstConfirm = confirm(`⚠️ WARNING: Delete Database?\n\nThis will permanently delete "${DB_NAME}" with all entries.\n\nAre you sure you want to continue?`);
  
  if (!firstConfirm) return;
  
  // Second confirmation with typing requirement
  const confirmText = prompt(`⚠️ FINAL CONFIRMATION\n\nTo confirm deletion, type: DELETE\n\n(This action cannot be undone)`);
  
  if (confirmText !== 'DELETE') {
    if (confirmText !== null) { // User didn't cancel
      alert('❌ Deletion cancelled - Text did not match "DELETE"');
    }
    return;
  }

  // Show progress
  updateStatus('Deleting database...');
  log('🗑️ Initiating database deletion...');

  if (db) {
    db.close();
    log('📡 Database connection closed');
  }

  const request = indexedDB.deleteDatabase(DB_NAME);

  request.onsuccess = () => {
    log('✅ Database deleted successfully');
    alert(`✅ Success!\n\nDatabase "${DB_NAME}" has been permanently deleted.`);
    
    // Reset UI
    logDiv.textContent = '';
    container.innerHTML = '';
    currentPage = 0;
    totalPages = 0;
    
    updateStatus('Database deleted. Ready for fresh start.');
    updatePaginationButtons();
    
    startBtn.disabled = false;
    deleteDbBtn.disabled = true;
  };

  request.onerror = (e) => {
    log('❌ Database deletion failed');
    alert(`❌ Error!\n\nFailed to delete database "${DB_NAME}".\n\nError: ${e.target.error}`);
    updateStatus('Database deletion failed.');
  };

  request.onblocked = () => {
    log('⚠️ Database deletion blocked - close other tabs');
    alert('⚠️ Deletion Blocked!\n\nPlease close all other tabs/windows using this application and try again.');
    updateStatus('Database deletion blocked. Close other tabs and retry.');
  };
}

startBtn.onclick = async () => {
  try {
    await openDB();
    deleteDbBtn.disabled = false;
    startInsertion();
  } catch (err) {
    updateStatus('Failed to open DB: ' + err);
  }
};

deleteDbBtn.onclick = deleteDatabase;

window.onload = async () => {
  try {
    await openDB();
    const countReq = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
    countReq.onsuccess = () => {
      if (countReq.result > 0) {
        deleteDbBtn.disabled = false;
        totalPages = Math.ceil(countReq.result / PAGE_SIZE);
        currentPage = 0;
        loadPage(currentPage);
        updatePaginationButtons();
        startBtn.disabled = true;
        updateStatus(`Loaded existing ${formatIndianNumber(countReq.result)} entries. Showing page 1.`);
      } else {
        deleteDbBtn.disabled = true;
        startBtn.disabled = false;
        updateStatus('Database empty. Click "Start Insert 1 Crore" to begin.');
      }
    };
    countReq.onerror = () => {
      updateStatus('Unable to read database count.');
    };
  } catch {
    deleteDbBtn.disabled = true;
    startBtn.disabled = false;
    updateStatus('Database not initialized. Click "Start Insert 1 Crore" to begin.');
  }
};

// Go to Top Button functionality
const goTopBtn = document.getElementById('goTopBtn');

// Show button only when scrolled down 300px or more
window.addEventListener('scroll', () => {
  if (window.pageYOffset > 300) {
    goTopBtn.style.display = 'block';
  } else {
    goTopBtn.style.display = 'none';
  }
});

// Smooth scroll back to top on click
goTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
// Accessibility improvements