function showStudentToast(message, type) {
  studentToast.textContent = message;
  studentToast.className = "student-toast status-" + type;
  studentToast.style.opacity = "1";
  setTimeout(() => { studentToast.style.opacity = "0"; }, 2500);
}

function showStudentLoading(show) {
  studentLoading.classList.toggle("visible", show);
}
// ===== SAFE IndexedDB Cache (additive only) =====
const CACHE_DB_NAME = 'EkskulCache_v1';
const CACHE_STORE = 'kv';

async function safeCacheOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(CACHE_DB_NAME, 1);
    r.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains(CACHE_STORE)) {
        e.target.result.createObjectStore(CACHE_STORE);
      }
    };
    r.onsuccess = (e) => res(e.target.result);
    r.onerror = (e) => rej(e);
  });
}

async function safeCacheGet(key) {
  try {
    const db = await safeCacheOpen();
    return new Promise((res) => {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const getReq = store.get(key);
      getReq.onsuccess = (e) => res(e.target.result || null);
      getReq.onerror = () => res(null);
    });
  } catch (e) {
    return null;
  }
}

async function safeCacheSet(key, value) {
  try {
    const db = await safeCacheOpen();
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).put(value, key);
  } catch (e) {
    // silent fail
  }
}

function safeCacheKey(...parts) {
  return parts.join('_');
}