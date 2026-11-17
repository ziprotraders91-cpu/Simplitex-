// === SimpliTex Database Engine v3 (IndexedDB + Indexes + Exact Auto Stock Engine) ===
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

async function dbCount(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

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

// === EXACT AUTO STOCK ENGINE: Ledger + Barcoding + Challans se 100% Sahi Stock Rebuild ===
async function stxRecalculateAllStock() {
  const db = await openDB();
  let opening = null;
  try {
    opening = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null');
  } catch (_) {}

  return new Promise((resolve, reject) => {
    const storeNames = ['bunkarStock', 'jobWorkPending', 'readyStock', 'jobWorkLedger', 'barcodingLogs', 'challans'];
    const tx = db.transaction(storeNames, 'readwrite');

    let jwLedger = null;
    let bcLogs = null;
    let challans = null;
    let doneCount = 0;

    function finishRebuild() {
      doneCount++;
      if (doneCount < 3) return;

      const bunkarMap = {};
      const pendingMap = {};
      const readyMap = {};

      // 1. Year Closing Opening Stock (agar kabhi Year Closing hua ho)
      if (opening) {
        (opening.bunkarStock || []).forEach((b) => {
          if (b && b.bunkarName) bunkarMap[b.bunkarName] = (bunkarMap[b.bunkarName] || 0) + (Number(b.qty) || 0);
        });
        (opening.jobWorkPending || []).forEach((p) => {
          if (p && p.id) pendingMap[p.id] = { id: p.id, workerName: p.workerName, jobWorkType: p.jobWorkType, qty: Number(p.qty) || 0 };
        });
        (opening.readyStock || []).forEach((r) => {
          if (r && r.skuKey) readyMap[r.skuKey] = { ...r, qty: Number(r.qty) || 0 };
        });
      }

      // 2. Replay Job Work & Direct Baithak Ledger
      jwLedger.forEach((l) => {
        const qty = Number(l.qty) || 0;
        if (l.direction === 'IN' && l.jobWorkType === 'DIRECT_BAITHAK') {
          if (l.bunkarName) bunkarMap[l.bunkarName] = (bunkarMap[l.bunkarName] || 0) + qty;
        } else if (l.direction === 'OUT') {
          (l.batchItems || []).forEach((row) => {
            if (row && row.bunkarName) {
              bunkarMap[row.bunkarName] = (bunkarMap[row.bunkarName] || 0) - (Number(row.qty) || 0);
            }
          });
          const pendId = `${l.workerName}__${l.jobWorkType}`;
          if (!pendingMap[pendId]) {
            pendingMap[pendId] = { id: pendId, workerName: l.workerName, jobWorkType: l.jobWorkType, qty: 0 };
          }
          pendingMap[pendId].qty += qty;
        } else if (l.direction === 'IN') {
          const pendId = `${l.workerName}__${l.jobWorkType}`;
          if (!pendingMap[pendId]) {
            pendingMap[pendId] = { id: pendId, workerName: l.workerName, jobWorkType: l.jobWorkType, qty: 0 };
          }
          pendingMap[pendId].qty -= qty;
          bunkarMap['__JW_POOL__'] = (bunkarMap['__JW_POOL__'] || 0) + qty;
        }
      });

      // 3. Replay Barcoding & Stock Convert Logs
      bcLogs.forEach((b) => {
        const qty = Number(b.qty) || 0;
        if (b.sourceName) {
          bunkarMap[b.sourceName] = (bunkarMap[b.sourceName] || 0) - qty;
        }
        const skuKey = `${b.designName}__${b.firmCode}`;
        if (!readyMap[skuKey]) {
          readyMap[skuKey] = {
            skuKey,
            designName: b.designName,
            firmCode: b.firmCode,
            specLine: b.specLine || '',
            barcodeVal: b.barcodeVal || `${b.designName} ${b.firmCode}`,
            qty: 0
          };
        } else if (b.specLine) {
          readyMap[skuKey].specLine = b.specLine;
        }
        readyMap[skuKey].qty += qty;
      });

      // 4. Replay Challans
      challans.forEach((c) => {
        (c.items || []).forEach((it) => {
          const skuKey = it.skuKey || `${it.designName}__${it.firmCode}`;
          if (!readyMap[skuKey]) {
            readyMap[skuKey] = {
              skuKey,
              designName: it.designName,
              firmCode: it.firmCode,
              specLine: '',
              barcodeVal: `${it.designName} ${it.firmCode}`,
              qty: 0
            };
          }
          readyMap[skuKey].qty -= (Number(it.qty) || 0);
        });
      });

      // 5. Save Clean Exact Stock
      const nowIso = new Date().toISOString();
      const bStore = tx.objectStore('bunkarStock');
      bStore.clear();
      Object.keys(bunkarMap).forEach((name) => {
        const q = bunkarMap[name];
        if (q > 0) bStore.put({ bunkarName: name, qty: q, updatedAt: nowIso });
      });

      const pStore = tx.objectStore('jobWorkPending');
      pStore.clear();
      Object.keys(pendingMap).forEach((id) => {
        const item = pendingMap[id];
        if (item.qty > 0) pStore.put({ ...item });
      });

      const rStore = tx.objectStore('readyStock');
      rStore.clear();
      Object.keys(readyMap).forEach((skuKey) => {
        const item = readyMap[skuKey];
        if (item.qty > 0) rStore.put({ ...item, updatedAt: nowIso });
      });
    }

    const r1 = tx.objectStore('jobWorkLedger').getAll();
    r1.onsuccess = () => { jwLedger = r1.result || []; finishRebuild(); };
    r1.onerror = () => reject(r1.error);

    const r2 = tx.objectStore('barcodingLogs').getAll();
    r2.onsuccess = () => { bcLogs = r2.result || []; finishRebuild(); };
    r2.onerror = () => reject(r2.error);

    const r3 = tx.objectStore('challans').getAll();
    r3.onsuccess = () => { challans = r3.result || []; finishRebuild(); };
    r3.onerror = () => reject(r3.error);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
window.stxRecalculateAllStock = stxRecalculateAllStock;

// 1-Click Full Backup Export (JSON)
async function exportFullBackup() {
  const db = await openDB();
  let openingStock = null;
  try { openingStock = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null'); } catch (_) {}
  const backup = { app: 'SimpliTex', date: new Date().toISOString(), openingStock, stores: {} };
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
  if (data.openingStock) {
    localStorage.setItem('simplitex_opening_stock', JSON.stringify(data.openingStock));
  } else {
    localStorage.removeItem('simplitex_opening_stock');
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
