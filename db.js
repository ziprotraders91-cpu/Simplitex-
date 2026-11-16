// === SimpliTex Database Engine (IndexedDB + LocalStorage) ===
const DB_NAME = 'SimpliTexDB';
const DB_VERSION = 1;
let dbInstance = null;

// Browser se storage permanent rakhne ki request
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const stores = [
        { name: 'firms', keyPath: 'id', autoIncrement: true },
        { name: 'jobWorkTypes', keyPath: 'name' },
        { name: 'jobWorkers', keyPath: 'id', autoIncrement: true },
        { name: 'bunkarStock', keyPath: 'bunkarName' },
        { name: 'jobWorkPending', keyPath: 'id' },
        { name: 'jobWorkLedger', keyPath: 'id', autoIncrement: true },
        { name: 'designs', keyPath: 'designName' },
        { name: 'readyStock', keyPath: 'skuKey' },
        { name: 'barcodingLogs', keyPath: 'id', autoIncrement: true },
        { name: 'parties', keyPath: 'id', autoIncrement: true },
        { name: 'folders', keyPath: 'name' },
        { name: 'orders', keyPath: 'id', autoIncrement: true },
        { name: 'challans', keyPath: 'id', autoIncrement: true }
      ];

      stores.forEach((s) => {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, {
            keyPath: s.keyPath,
            autoIncrement: !!s.autoIncrement
          });
        }
      });

      // Default Job Work & Fold Options Seed
      const tx = e.target.transaction;
      const jwStore = tx.objectStore('jobWorkTypes');
      ['Embroidery', 'Calender', 'Jhalar', 'Swarovski'].forEach((n) => jwStore.put({ name: n }));

      const foldStore = tx.objectStore('folders');
      ['Mishri', 'Hanger', 'Book Fold'].forEach((n) => foldStore.put({ name: n }));
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// 1-Click Full Backup Export (JSON)
async function exportFullBackup() {
  const db = await openDB();
  const backup = { app: 'SimpliTex', date: new Date().toISOString(), stores: {} };
  for (const name of db.objectStoreNames) {
    backup.stores[name] = await dbGetAll(name);
  }
  return JSON.stringify(backup, null, 2);
}

// Restore Backup (JSON)
async function restoreFullBackup(jsonText) {
  const data = JSON.parse(jsonText);
  if (!data || data.app !== 'SimpliTex' || !data.stores) {
    throw new Error('Galat Backup File hai!');
  }
  const db = await openDB();
  for (const name of Object.keys(data.stores)) {
    if (!db.objectStoreNames.contains(name)) continue;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      const store = tx.objectStore(name);
      store.clear();
      data.stores[name].forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}