// === SimpliTex Database Engine v2 (IndexedDB + Indexes for High Speed & Large Data) ===
const DB_NAME = 'SimpliTexDB';
const DB_VERSION = 2;
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
      const tx = e.target.transaction;

      const stores = [
        { name: 'firms', keyPath: 'id', autoIncrement: true },
        { name: 'jobWorkTypes', keyPath: 'name' },
        { name: 'jobWorkers', keyPath: 'id', autoIncrement: true },
        { name: 'bunkarStock', keyPath: 'bunkarName' },
        { name: 'jobWorkPending', keyPath: 'id' },
        {
          name: 'jobWorkLedger',
          keyPath: 'id',
          autoIncrement: true,
          indexes: [
            { name: 'date', keyPath: 'date' },
            { name: 'direction', keyPath: 'direction' },
            { name: 'workerName', keyPath: 'workerName' },
            { name: 'createdAt', keyPath: 'createdAt' }
          ]
        },
        { name: 'designs', keyPath: 'designName' },
        { name: 'readyStock', keyPath: 'skuKey' },
        {
          name: 'barcodingLogs',
          keyPath: 'id',
          autoIncrement: true,
          indexes: [
            { name: 'date', keyPath: 'date' },
            { name: 'sourceName', keyPath: 'sourceName' },
            { name: 'createdAt', keyPath: 'createdAt' }
          ]
        },
        { name: 'parties', keyPath: 'id', autoIncrement: true },
        { name: 'folders', keyPath: 'name' },
        {
          name: 'orders',
          keyPath: 'id',
          autoIncrement: true,
          indexes: [
            { name: 'date', keyPath: 'date' },
            { name: 'partyName', keyPath: 'partyName' },
            { name: 'orderNo', keyPath: 'orderNo' },
            { name: 'createdAt', keyPath: 'createdAt' }
          ]
        },
        {
          name: 'challans',
          keyPath: 'id',
          autoIncrement: true,
          indexes: [
            { name: 'date', keyPath: 'date' },
            { name: 'partyName', keyPath: 'partyName' },
            { name: 'orderNo', keyPath: 'orderNo' },
            { name: 'challanNo', keyPath: 'challanNo' },
            { name: 'createdAt', keyPath: 'createdAt' }
          ]
        }
      ];

      stores.forEach((s) => {
        let store;
        if (!db.objectStoreNames.contains(s.name)) {
          store = db.createObjectStore(s.name, {
            keyPath: s.keyPath,
            autoIncrement: !!s.autoIncrement
          });
        } else {
          store = tx.objectStore(s.name);
        }

        if (Array.isArray(s.indexes)) {
          s.indexes.forEach((idx) => {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath, { unique: false });
            }
          });
        }
      });

      // Default Job Work & Fold Options Seed (sirf pehli baar)
      if (e.oldVersion < 1) {
        const jwStore = tx.objectStore('jobWorkTypes');
        ['Embroidery', 'Calender', 'Jhalar', 'Swarovski'].forEach((n) => jwStore.put({ name: n }));

        const foldStore = tx.objectStore('folders');
        ['Mishri', 'Hanger', 'Book Fold'].forEach((n) => foldStore.put({ name: n }));
      }
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

// Fast Indexed Lookup (Poora DB load kiye bina sirf matching rows nikalta hai)
async function dbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    if (!store.indexNames.contains(indexName)) {
      const reqAll = store.getAll();
      reqAll.onsuccess = () => {
        const list = reqAll.result || [];
        resolve(list.filter((item) => item && item[indexName] === value));
      };
      reqAll.onerror = () => reject(reqAll.error);
      return;
    }
    const req = store.index(indexName).getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Fast Count (Bina data RAM me laaye total ginti)
async function dbCount(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

// Fast Max Number Finder (Next Order / Challan / JobWork No. ke liye)
async function dbGetMaxField(storeName, indexName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    if (store.indexNames.contains(indexName)) {
      const req = store.index(indexName).openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cur = e.target.result;
        resolve(cur ? (Number(cur.key) || 0) : 0);
      };
      req.onerror = () => reject(req.error);
      return;
    }
    const reqAll = store.getAll();
    reqAll.onsuccess = () => {
      const list = reqAll.result || [];
      resolve(list.reduce((m, x) => Math.max(m, Number(x[indexName]) || 0), 0));
    };
    reqAll.onerror = () => reject(reqAll.error);
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

// Tally-Style Year Closing: Purane Bills/Ledger saaf karein, Live Stock & Masters safe rahenge
async function clearTransactionStoresForNewYear() {
  const db = await openDB();
  const txStores = ['jobWorkLedger', 'barcodingLogs', 'orders', 'challans'];
  for (const name of txStores) {
    if (!db.objectStoreNames.contains(name)) continue;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
