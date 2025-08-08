// ===================================================================
// MAIN.JS - Sri Rama Koti PWA
// Author: Sandeep Mirala (refactored/fixed version)
// Repository: https://github.com/sandeepmirala/SRIRAMAKI
// ===================================================================

// Configuration
const DB_NAME = "SriRamaDB";
const STORE_NAME = "sriStore";
const DB_VERSION = 1;
const TOTAL_ENTRIES = 10_000_000; // 1 Crore
const BATCH_SIZE = 50_000;
const PAGE_SIZE = 5_000;

// Global state
let db = null;
let worker = null;
let batchInserted = 0;
let currentPage = 0;
let totalPages = 0;
let isInserting = false;
let cancelRequested = false;
let lastPhrase = "";
let milestoneShown = false;

let userStartTime = null;
let userEndTime = null;

// DOM cache helper
const elements = {};
const $ = (id) => document.getElementById(id);

// ===================== Utility Functions ===========================
function formatNumberIndian(num) {
  if (num < 100_000) return num.toLocaleString();
  if (num < 10_000_000) return (num / 100_000).toFixed(0) + " Lakh";
  return (num / 10_000_000).toFixed(1) + " Crore";
}

function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const rem = secs % 3600;
  const m = Math.floor(rem / 60);
  const s = rem % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
  if (s || parts.length === 0) parts.push(`${s} second${s > 1 ? "s" : ""}`);
  return parts.join(" ");
}

function formatDurationHHMMSS(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function log(text) {
  if (!elements.logDiv) return;
  const div = document.createElement("div");
  div.textContent = text;
  div.style.opacity = "0";
  elements.logDiv.appendChild(div);
  requestAnimationFrame(() => (div.style.opacity = "1"));
  elements.logDiv.scrollTop = elements.logDiv.scrollHeight;
}

function updateStatus(text, spinner = false) {
  if (!elements.status) return;
  elements.status.innerHTML = spinner
    ? `${text} <span class="ellipsis" aria-hidden="true"></span>`
    : text;
}

function showPaging(show) {
  if (elements.paginationBar) elements.paginationBar.style.display = show ? "" : "none";
}

function showData(show) {
  if (elements.dataContainer) {
    elements.dataContainer.style.display = show ? "" : "none";
    if (!show) elements.dataContainer.innerHTML = "";
  }
}

function enablePagination(enable) {
  ["first", "prev", "next", "last"].forEach((key) => {
    const btn = elements[`${key}PageBtn`];
    if (btn) btn.disabled = !enable;
  });
}

function updatePagination() {
  const { firstPageBtn, prevPageBtn, nextPageBtn, lastPageBtn, pageInfo } = elements;
  if (!(firstPageBtn && prevPageBtn && nextPageBtn && lastPageBtn && pageInfo)) return;

  const hasData = batchInserted > 0 && totalPages > 0;
  showPaging(hasData);
  showData(hasData);

  if (!hasData) {
    [firstPageBtn, prevPageBtn, nextPageBtn, lastPageBtn].forEach((btn) => (btn.disabled = true));
    pageInfo.textContent = "Page 0 / 0";
    enablePagination(false);
    return;
  }
  const canPaginate = batchInserted >= TOTAL_ENTRIES && totalPages > 0;

  firstPageBtn.disabled = !canPaginate || currentPage === 0;
  prevPageBtn.disabled = !canPaginate || currentPage === 0;
  nextPageBtn.disabled = !canPaginate || currentPage === totalPages - 1;
  lastPageBtn.disabled = !canPaginate || currentPage === totalPages - 1;

  pageInfo.textContent = `Page ${currentPage + 1} / ${totalPages}`;
  enablePagination(canPaginate);
}

// ===================== IndexedDB Operations ========================

async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let upgraded = false;

    req.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: "id" });
        upgraded = true;
      }
    };

    req.onsuccess = (event) => {
      db = event.target.result;
      db.onversionchange = () => {
        updateStatus("Database outdated, please reload.");
        db.close();
        db = null;
      };
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        reject(new Error("Object store missing"));
        return;
      }
      resolve(db);
    };

    req.onerror = (event) => reject(event.target.error);
    req.onblocked = () => updateStatus("Database open blocked, close other tabs.");
  });
}

async function deleteDatabase(confirmDelete = true) {
  if (confirmDelete && !confirm("Delete all data? This is irreversible.")) return false;
  if (elements.deleteBtn) elements.deleteBtn.disabled = true;
  updateStatus("Deleting database...");
  log("Deletion started.");

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
    req.onerror = () => {
      updateStatus("Failed to delete database.");
      if (elements.deleteBtn) elements.deleteBtn.disabled = false;
    };
    req.onblocked = () => {
      updateStatus("Deletion blocked; close other tabs.");
      if (elements.deleteBtn) elements.deleteBtn.disabled = false;
    };
    req.onsuccess = () => {
      updateStatus("Database deleted.");
      log("Database deletion success.");
      clearUI();
      setTimeout(() => setInsertState("ready"), 100);
    };
    if ("caches" in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      log("Cache storage cleared.");
    }
    return true;
  } catch (err) {
    updateStatus(`Deletion error: ${err.message}`);
    if (elements.deleteBtn) elements.deleteBtn.disabled = false;
    return false;
  }
}

// ======================= Data Paging & UI ===========================

function loadPage(page) {
  if (!db || batchInserted < TOTAL_ENTRIES) {
    showPaging(false);
    showData(false);
    updateStatus("No data available.");
    return;
  }

  if (page < 0) page = 0;
  else if (page >= totalPages) page = totalPages - 1;

  currentPage = page;
  showPaging(true);
  showData(true);
  if (elements.dataContainer) elements.dataContainer.innerHTML = "<p>Loading...</p>";
  updateStatus(`Loading page ${page + 1}...`);

  try {
    const txn = db.transaction(STORE_NAME, "readonly");
    const store = txn.objectStore(STORE_NAME);
    const startKey = page * PAGE_SIZE + 1;
    const endKey = Math.min(batchInserted, (page + 1) * PAGE_SIZE);
    const range = IDBKeyRange.bound(startKey, endKey, false, false);
    const req = store.openCursor(range);
    let count = 0;
    const frag = document.createDocumentFragment();

    req.onerror = () => {
      updateStatus("Failed to load page data.");
      if (elements.dataContainer)
        elements.dataContainer.innerHTML = "<p style='color:red;'>Error loading data.</p>";
    };

    req.onsuccess = (evt) => {
      let cursor = evt.target.result;
      if (cursor) {
        const div = document.createElement("div");
        div.className = "ramadiv";
        div.textContent = `${cursor.value.text} (ID: ${cursor.value.id.toLocaleString()})`;
        frag.appendChild(div);
        count++;
        cursor.continue();
      } else {
        if (count === 0) {
          if (elements.dataContainer) elements.dataContainer.textContent = "No records on this page";
          updateStatus("No data found on page.");
        } else if (elements.dataContainer) {
          elements.dataContainer.innerHTML = "";
          elements.dataContainer.appendChild(frag);
          updateStatus(`Showing ${count} records on page ${page + 1}`);
        }
        updatePagination();
      }
    };
  } catch (err) {
    updateStatus(`Error loading page: ${err.message}`);
  }
}

function goFirst() {
  if (currentPage > 0) {
    loadPage(0);
    currentPage = 0;
    updatePagination();
  }
}

function goPrev() {
  if (currentPage > 0) {
    loadPage(currentPage - 1);
    currentPage--;
    updatePagination();
  }
}

function goNext() {
  if (currentPage < totalPages - 1) {
    loadPage(currentPage + 1);
    currentPage++;
    updatePagination();
  }
}

function goLast() {
  if (currentPage < totalPages - 1) {
    loadPage(totalPages - 1);
    currentPage = totalPages - 1;
    updatePagination();
  }
}

// ===================== Section & Navigation ========================

function toggleSection(section) {
  ["about", "insert", "tools"].forEach((key) => {
    if (elements[key + "Page"]) {
      elements[key + "Page"].style.display = key === section ? "block" : "none";
    }
  });
  ["About", "Insert", "Tools"].forEach((label) => {
    const btn = elements["menu" + label];
    if (btn) btn.disabled = label.toLowerCase() === section;
  });
}

// ====================== Input Validation ===========================

function validateInput() {
  if (!elements.insertText) return false;
  const val = elements.insertText.value.trim();
  if (val.length < 4) {
    updateStatus("Please enter at least 4 characters in phrase.");
    elements.insertText.focus();
    return false;
  }
  return true;
}

// ====================== Insert State UI ============================

function setInsertState(state) {
  const { startBtn, cancelBtn, progressBar, deleteBtn } = elements;
  if (!(startBtn && cancelBtn && progressBar)) return;
  switch (state) {
    case "ready":
      startBtn.disabled = false;
      startBtn.textContent = "Start";
      startBtn.classList.remove("working");
      cancelBtn.style.display = "none";
      cancelBtn.disabled = false;
      progressBar.style.display = "none";
      if (deleteBtn) deleteBtn.disabled = true;
      break;
    case "inserting":
      startBtn.disabled = true;
      startBtn.textContent = "Inserting...";
      startBtn.classList.add("working");
      cancelBtn.style.display = "";
      cancelBtn.disabled = false;
      progressBar.style.display = "";
      if (deleteBtn) deleteBtn.disabled = true;
      break;
    case "done":
      startBtn.disabled = true;
      startBtn.textContent = "Completed ✓";
      startBtn.classList.remove("working");
      cancelBtn.style.display = "none";
      cancelBtn.disabled = true;
      progressBar.style.display = "none";
      if (deleteBtn) deleteBtn.disabled = false;
      break;
  }
}

// ====================== Start Insertion =============================

async function startInsertion() {
  if (isInserting) return;
  if (!validateInput()) return;

  if (!db) {
    try {
      await openDB();
    } catch (e) {
      updateStatus(`Failed to open DB: ${e.message}`);
      return;
    }
  }

  const phrase = elements.insertText.value.trim();

  if (phrase !== lastPhrase && lastPhrase !== "") {
    await deleteDatabase(true);
    try {
      await openDB();
    } catch (e) {
      updateStatus(`Failed to reopen DB: ${e.message}`);
      return;
    }
  }
  lastPhrase = phrase;

  if (worker) worker.terminate();

  cancelRequested = false;
  clearUI();
  updateStatus("Starting insertion...", true);
  setInsertState("inserting");
  isInserting = true;
  batchInserted = 0;
  milestoneShown = false;

  userStartTime = new Date();
  const startTime = performance.now();

  worker = new Worker("SriramaInsert.js", { type: "module" });
  worker.postMessage({ DB_NAME, STORE_NAME, DB_VERSION, TOTAL_ENTRIES, BATCH_SIZE, phrase });

  worker.onmessage = async (e) => {
    if (e.data.error) {
      log(`Worker error: ${e.data.error}`);
      updateStatus(`Worker error: ${e.data.error}`);
      setInsertState("ready");
      isInserting = false;
      if (worker) {
        worker.terminate();
        worker = null;
      }
      return;
    }
    if (typeof e.data.inserted === "number") {
      batchInserted = e.data.inserted;

      if (!milestoneShown && batchInserted >= TOTAL_ENTRIES) {
        milestoneShown = true;

        if (elements.milestoneDiv) {
          elements.milestoneDiv.style.display = "block";
          setTimeout(() => {
            elements.milestoneDiv.focus();
          }, 100);
        }

        updateStatus("🎉 1 Crore insertion complete!");
        log("🎉 MILESTONE: 1 Crore (10,000,000) entries inserted successfully!");
      }

      const elapsed = (performance.now() - startTime) / 1000;
      const speed = batchInserted / elapsed;
      const eta = speed ? (TOTAL_ENTRIES - batchInserted) / speed : 0;

      if (batchInserted % (BATCH_SIZE * 5) === 0 || batchInserted === TOTAL_ENTRIES) {
        log(
          `Inserted ${formatNumberIndian(batchInserted)} entries (batch ${e.data.batchNumber}/${e.data.totalBatches}) - ${e.data.batchDurationSecs}s`
        );
        updateStatus(
          `Inserted ${formatNumberIndian(batchInserted)} / ${formatNumberIndian(TOTAL_ENTRIES)} at ${speed.toFixed(
            2
          )} req/sec - ETA ${Math.ceil(eta)}s`,
          true
        );
        if (elements.progressBar)
          elements.progressBar.value = Math.min(100, (batchInserted / TOTAL_ENTRIES) * 100);
      }

      if (batchInserted >= TOTAL_ENTRIES) {
        totalPages = Math.ceil(TOTAL_ENTRIES / PAGE_SIZE);
        currentPage = 0;
        await openDB();
        loadPage(currentPage);
        updatePagination();
        enablePagination(true);
      }
    }
    if (e.data.done) {
      userEndTime = new Date();

      const totalDuration = performance.now() - startTime;
      log("Insertion complete");

      const humanReadableTime = formatDuration(totalDuration);
      const timeHHMMSS = formatDurationHHMMSS(totalDuration);

      const options = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true };
      const formattedStart = userStartTime.toLocaleTimeString(undefined, options);
      const formattedEnd = userEndTime.toLocaleTimeString(undefined, options);

      updateStatus(`Insertion finished in ${humanReadableTime}`, false);

      if (elements.totalTime) {
        elements.totalTime.textContent = `Start time: ${formattedStart} | End time: ${formattedEnd} | Duration: ${timeHHMMSS} (${humanReadableTime})`;
      }

      if (elements.timeStats) {
        elements.timeStats.style.display = "block";
      }

      log(`Total insertion time: ${timeHHMMSS} (${humanReadableTime})`);
      log(`Performance: ${(TOTAL_ENTRIES / (totalDuration / 1000)).toFixed(0)} entries/sec average`);

      setInsertState("done");
      isInserting = false;
      if (worker) {
        worker.terminate();
        worker = null;
      }

      if (typeof window.confetti === "function") {
        window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      }

      if (elements.deleteBtn) elements.deleteBtn.disabled = false;
    }
  };

  worker.onerror = (e) => {
    log(`Worker error: ${e.message}`);
    updateStatus("Worker encountered an error");
    setInsertState("ready");
    isInserting = false;
    if (worker) {
      worker.terminate();
      worker = null;
    }
  };
}

// ======================= Cancel Insertion ==========================

async function cancelInsertion() {
  if (!isInserting) return;
  if (elements.cancelBtn) elements.cancelBtn.disabled = true;

  cancelRequested = true;

  if (worker) {
    const oldWorker = worker;
    worker = null; // Nullify early to avoid race with onmessage
    oldWorker.terminate();
  }

  updateStatus("Cancelling...");
  log("User cancelled insertion.");

  try {
    if (db) {
      db.close();
      db = null;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      updateStatus("Cancelled and cleared database.");
      clearUI();
      setInsertState("ready");
      isInserting = false;
      cancelRequested = false;
    };
    req.onerror = () => {
      updateStatus("Failed deleting database after cancellation.");
      if (elements.cancelBtn) elements.cancelBtn.disabled = false;
    };
    if ("caches" in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      log("Caches cleared.");
    }
  } catch (e) {
    log(`Error during cancellation: ${e}`);
    updateStatus(`Error: ${e}`);
    if (elements.cancelBtn) elements.cancelBtn.disabled = false;
  }
}

// ======================= Scroll To Top Button =======================

const goTopBtn = document.getElementById("goTop");

function setupScrollToTopButton() {
  if (!goTopBtn) return;

  goTopBtn.style.display = "none";

  window.addEventListener("scroll", () => {
    goTopBtn.style.display = window.pageYOffset > 200 ? "block" : "none";
  });

  goTopBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });

    const liveRegion = document.querySelector('[aria-live="polite"]');
    if (liveRegion) {
      liveRegion.textContent = "Scrolled to top";
    }
  });

  goTopBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      goTopBtn.click();
    }
  });
}

window.addEventListener("DOMContentLoaded", setupScrollToTopButton);

// ======================= UI Reset ==========================

function clearUI() {
  if (elements.logDiv) elements.logDiv.innerHTML = "<div>Ready to start...</div>";
  if (elements.dataContainer) elements.dataContainer.innerHTML = "";
  showPaging(false);
  showData(false);
  batchInserted = 0;
  currentPage = 0;
  totalPages = 0;
  milestoneShown = false;
  if (elements.pageInfo) elements.pageInfo.textContent = "Page 0 / 0";
  updateStatus("Ready");
  enablePagination(false);
  if (elements.milestoneDiv) elements.milestoneDiv.style.display = "none";
  if (elements.timeStats) elements.timeStats.style.display = "none";
  if (elements.progressBar) {
    elements.progressBar.value = 0;
    elements.progressBar.style.display = "none";
  }
  if (elements.totalTime) elements.totalTime.textContent = "";
}

// ================== Window Load and Initialization ===============

window.onload = () => {
  Object.assign(elements, {
    startBtn: $("startBtn"),
    cancelBtn: $("cancelBtn"),
    deleteBtn: $("deleteBtn"),
    status: $("status"),
    totalTime: $("totalTime"),
    timeStats: $("timeStats"),
    logDiv: $("logDiv"),
    dataContainer: $("dataContainer"),
    paginationBar: $("paginationBar"),
    progressBar: $("progressBar"),
    firstPageBtn: $("firstPageBtn"),
    prevPageBtn: $("prevPageBtn"),
    nextPageBtn: $("nextPageBtn"),
    lastPageBtn: $("lastPageBtn"),
    pageInfo: $("pageInfo"),
    goTop: $("goTop"),
    insertText: $("insertText"),
    menuAbout: $("menuAbout"),
    insertPage: $("insertPage"),
    aboutPage: $("aboutPage"),
    toolsPage: $("toolsPage"),
    menuInsert: $("menuInsert"),
    menuTools: $("menuTools"),
    menuInstall: $("menuInstall"),
    installPopup: $("installPopup"),
    installBtn: $("installBtn"),
    installClose: $("installClose"),
    milestoneDiv: $("milestoneDiv"),
  });

  // Navigation bindings
  if (elements.menuAbout) elements.menuAbout.onclick = () => toggleSection("about");
  if (elements.menuInsert) elements.menuInsert.onclick = () => toggleSection("insert");
  if (elements.menuTools) elements.menuTools.onclick = () => toggleSection("tools");

  // Pagination button handlers
  if (elements.firstPageBtn) elements.firstPageBtn.onclick = goFirst;
  if (elements.prevPageBtn) elements.prevPageBtn.onclick = goPrev;
  if (elements.nextPageBtn) elements.nextPageBtn.onclick = goNext;
  if (elements.lastPageBtn) elements.lastPageBtn.onclick = goLast;

  setupScrollToTopButton();

  // Control buttons
  if (elements.startBtn) elements.startBtn.onclick = startInsertion;
  if (elements.cancelBtn) elements.cancelBtn.onclick = cancelInsertion;
  if (elements.deleteBtn) elements.deleteBtn.onclick = () => {
    if (!elements.deleteBtn.disabled) deleteDatabase();
  };

  // Initial UI setup
  setInsertState("ready");
  enablePagination(false);
  showPaging(false);
  showData(false);
  updateStatus("Ready. Click 'Start' to begin.");

  // Service Worker registration
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) {
        console.log("Service worker is already registered:", registration);
      } else {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((registration) => {
            console.log("Service worker registration succeeded:", registration);
          })
          .catch((error) => {
            console.error("Service worker registration failed:", error);
          });
      }
    });
  } else {
    console.error("Service workers are not supported in this browser.");
  }
};

// =============== Global Error Handlers ===========================

