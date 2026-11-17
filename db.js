// === SimpliTex Database Engine v6 (Dual Mode: IndexedDB + LAN + Karigar-Wise JW Wapsi & Progress Engine) ===
const DB_NAME = 'SimpliTexDB';
const DB_VERSION = 3;
let dbInstance = null;

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// === LAN MULTI-PC ENGINE STATE ===
const STX_SHARED_META_KEYS = [
  'simplitex_license',
  'simplitex_opening_stock',
  'simplitex_karigar_design_map',
  'simplitex_jw_work_details'
];
const STX_CLIENT_ID = 'stx_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();

let stxLanMode = false;
let stxLanInfo = null;
let stxLanInitPromise = null;
let stxEventSource = null;
let stxSuppressMetaHook = false;

// Wrap localStorage setItem/removeItem so shared keys auto-sync to LAN Server
(function installSharedLocalStorageHook() {
  try {
    const origSetItem = Storage.prototype.setItem;
    const origRemoveItem = Storage.prototype.removeItem;

    Storage.prototype.setItem = function (key, value) {
      origSetItem.call(this, key, value);
      if (this === window.localStorage && stxLanMode && !stxSuppressMetaHook && STX_SHARED_META_KEYS.includes(key)) {
        stxPushMetaPatch({ [key]: String(value) }).catch(() => {});
      }
    };

    Storage.prototype.removeItem = function (key) {
      origRemoveItem.call(this, key);
      if (this === window.localStorage && stxLanMode && !stxSuppressMetaHook && STX_SHARED_META_KEYS.includes(key)) {
        stxPushMetaPatch({ [key]: null }).catch(() => {});
      }
    };
  } catch (_) {}
})();

function stxApplySharedMeta(sharedStorage) {
  if (!sharedStorage || typeof sharedStorage !== 'object') return;
  stxSuppressMetaHook = true;
  try {
    STX_SHARED_META_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(sharedStorage, key)) {
        const val = sharedStorage[key];
        if (val === null || val === undefined) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
        }
      }
    });
  } finally {
    stxSuppressMetaHook = false;
  }
}

async function stxApiFetch(url, options = {}) {
  const headers = Object.assign(
    {
      'Content-Type': 'application/json',
      'X-Client-Id': STX_CLIENT_ID
    },
    options.headers || {}
  );
  const res = await fetch(url, Object.assign({}, options, { headers, cache: 'no-store' }));
  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    json = null;
  }
  if (!res.ok) {
    throw new Error((json && json.error) || `LAN API Error (${res.status})`);
  }
  return json;
}

async function stxPushMetaPatch(patch) {
  if (!stxLanMode) return;
  return stxApiFetch('/api/meta', {
    method: 'POST',
    body: JSON.stringify({ patch })
  });
}

async function stxSyncSharedMeta() {
  if (!stxLanMode) return;
  const res = await stxApiFetch('/api/meta');
  if (res && res.sharedStorage) {
    stxApplySharedMeta(res.sharedStorage);
  }
}
window.stxSyncSharedMeta = stxSyncSharedMeta;

function stxConnectLanEvents() {
  if (!stxLanMode || typeof EventSource === 'undefined') return;
  if (stxEventSource) {
    try { stxEventSource.close(); } catch (_) {}
  }

  stxEventSource = new EventSource('/api/events');
  stxEventSource.addEventListener('update', async (ev) => {
    try {
      const detail = JSON.parse(ev.data || '{}');
      if (detail.sourceClientId && detail.sourceClientId === STX_CLIENT_ID) {
        return; // Isi browser tab ne update bheja hai
      }
      if (Array.isArray(detail.stores) && detail.stores.includes('_meta')) {
        await stxSyncSharedMeta().catch(() => {});
      }
      window.dispatchEvent(new CustomEvent('stx-lan-sync', { detail }));
    } catch (_) {}
  });
}

function stxInitLanMode() {
  if (stxLanInitPromise) return stxLanInitPromise;

  stxLanInitPromise = (async () => {
    const proto = window.location.protocol;
    const host = window.location.hostname || '';

    // GitHub Pages ya file:// par hamesha IndexedDB mode rakhein
    if (proto === 'file:' || host.endsWith('github.io')) {
      stxLanMode = false;
      return false;
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 1800) : null;

    try {
      const res = await fetch('/api/ping', {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) {
        stxLanMode = false;
        return false;
      }
      const data = await res.json();
      if (data && data.ok && data.mode === 'LAN_SERVER') {
        stxLanMode = true;
        stxLanInfo = data;
        window.STX_LAN_MODE = true;
        window.STX_LAN_INFO = data;

        await stxSyncSharedMeta().catch(() => {});

        const metaRes = await stxApiFetch('/api/meta').catch(() => null);
        const serverMeta = (metaRes && metaRes.sharedStorage) || {};
        const initialPatch = {};
        let hasPatch = false;
        STX_SHARED_META_KEYS.forEach((k) => {
          if (!Object.prototype.hasOwnProperty.call(serverMeta, k)) {
            const localVal = localStorage.getItem(k);
            if (localVal !== null) {
              initialPatch[k] = localVal;
              hasPatch = true;
            }
          }
        });
        if (hasPatch) {
          await stxPushMetaPatch(initialPatch).catch(() => {});
        }

        stxConnectLanEvents();
        return true;
      }
    } catch (_) {
      if (timer) clearTimeout(timer);
    }

    stxLanMode = false;
    window.STX_LAN_MODE = false;
    return false;
  })();

  return stxLanInitPromise;
}

window.stxLanReady = stxInitLanMode();
window.stxIsLanMode = () => stxLanMode;

// === INDEXEDDB ENGINE (Single-PC / GitHub Pages Mode) ===
function openDB() {
  return new Promise(async (resolve, reject) => {
    await stxInitLanMode();
    if (stxLanMode) {
      return resolve({ isLanProxy: true });
    }
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
        { name: 'convertedStock', keyPath: 'designName' },
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
  await stxInitLanMode();
  if (stxLanMode) {
    const res = await stxApiFetch(`/api/store/${encodeURIComponent(storeName)}/put`, {
      method: 'PUT',
      body: JSON.stringify({ value: data })
    });
    return res.key;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  await stxInitLanMode();
  if (stxLanMode) {
    const res = await stxApiFetch(`/api/store/${encodeURIComponent(storeName)}/${encodeURIComponent(String(key))}`);
    return res.item === null ? undefined : res.item;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  await stxInitLanMode();
  if (stxLanMode) {
    const res = await stxApiFetch(`/api/store/${encodeURIComponent(storeName)}`);
    return Array.isArray(res.items) ? res.items : [];
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetByIndex(storeName, indexName, value) {
  await stxInitLanMode();
  if (stxLanMode) {
    const list = await dbGetAll(storeName);
    return list.filter((item) => item && item[indexName] === value);
  }

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
  await stxInitLanMode();
  if (stxLanMode) {
    const list = await dbGetAll(storeName);
    return list.length;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetMaxField(storeName, indexName) {
  await stxInitLanMode();
  if (stxLanMode) {
    const list = await dbGetAll(storeName);
    return list.reduce((m, x) => Math.max(m, Number(x && x[indexName]) || 0), 0);
  }

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
  await stxInitLanMode();
  if (stxLanMode) {
    await stxApiFetch(`/api/store/${encodeURIComponent(storeName)}/${encodeURIComponent(String(key))}`, {
      method: 'DELETE'
    });
    return true;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// === KARIGAR-WISE FIFO JOB WORK ANALYTICS & WAPSI ALLOCATION ===
function stxComputeJWAnalytics(opening, jwLedger) {
  const bunkarDeltaMap = {};
  const pendingMap = {};
  const openingRemMap = {};
  const workerQueueMap = {};
  const outProgressMap = {};
  const inAllocMap = {};

  if (opening) {
    (opening.bunkarStock || []).forEach((b) => {
      if (b && b.bunkarName) {
        bunkarDeltaMap[b.bunkarName] = (bunkarDeltaMap[b.bunkarName] || 0) + (Number(b.qty) || 0);
      }
    });
    (opening.jobWorkPending || []).forEach((p) => {
      if (p && p.id) {
        const q = Number(p.qty) || 0;
        pendingMap[p.id] = { id: p.id, workerName: p.workerName, jobWorkType: p.jobWorkType, qty: q };
        openingRemMap[p.id] = (openingRemMap[p.id] || 0) + q;
      }
    });
  }

  const sorted = [...(jwLedger || [])].sort((a, b) => {
    const dA = String(a?.date || '');
    const dB = String(b?.date || '');
    if (dA !== dB) return dA.localeCompare(dB);
    const cA = Number(a?.createdAt) || 0;
    const cB = Number(b?.createdAt) || 0;
    if (cA !== cB) return cA - cB;
    if (a?.direction !== b?.direction) return a?.direction === 'OUT' ? -1 : 1;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });

  function addAlloc(allocList, bunkarName, qty) {
    if (!qty || qty <= 0) return;
    const existing = allocList.find((x) => x.bunkarName === bunkarName);
    if (existing) existing.qty += qty;
    else allocList.push({ bunkarName, qty });
  }

  sorted.forEach((l) => {
    if (!l) return;
    const qty = Math.max(0, Number(l.qty) || 0);

    if (l.direction === 'IN' && l.jobWorkType === 'DIRECT_BAITHAK') {
      if (l.bunkarName) {
        bunkarDeltaMap[l.bunkarName] = (bunkarDeltaMap[l.bunkarName] || 0) + qty;
      }
      return;
    }

    const wName = String(l.workerName || '').toUpperCase();
    const jwType = String(l.jobWorkType || '').toUpperCase();
    const pendId = `${wName}__${jwType}`;

    if (l.direction === 'OUT') {
      if (!pendingMap[pendId]) {
        pendingMap[pendId] = { id: pendId, workerName: wName, jobWorkType: jwType, qty: 0 };
      }
      pendingMap[pendId].qty += qty;

      if (!workerQueueMap[pendId]) workerQueueMap[pendId] = [];

      const progItems = [];
      let batchSum = 0;
      (l.batchItems || []).forEach((row) => {
        if (!row || !row.bunkarName) return;
        const rQty = Math.max(0, Number(row.qty) || 0);
        if (rQty <= 0) return;
        bunkarDeltaMap[row.bunkarName] = (bunkarDeltaMap[row.bunkarName] || 0) - rQty;
        batchSum += rQty;
        const itemRef = { bunkarName: row.bunkarName, sentQty: rQty, okQty: 0, damageQty: 0, pendingQty: rQty };
        progItems.push(itemRef);
        workerQueueMap[pendId].push({
          ledgerId: l.id,
          date: l.date,
          jobWorkNo: l.jobWorkNo,
          bunkarName: row.bunkarName,
          remQty: rQty,
          itemRef
        });
      });

      if (qty > batchSum) {
        const extra = qty - batchSum;
        const itemRef = { bunkarName: '__JW_POOL__', sentQty: extra, okQty: 0, damageQty: 0, pendingQty: extra };
        progItems.push(itemRef);
        workerQueueMap[pendId].push({
          ledgerId: l.id,
          date: l.date,
          jobWorkNo: l.jobWorkNo,
          bunkarName: '__JW_POOL__',
          remQty: extra,
          itemRef
        });
      }

      if (l.id !== undefined && l.id !== null) {
        outProgressMap[l.id] = {
          id: l.id,
          totalQty: qty,
          okQty: 0,
          damageQty: 0,
          pendingQty: qty,
          items: progItems
        };
      }
      return;
    }

    if (l.direction === 'IN') {
      const damageQty = Math.max(0, Number(l.damageQty) || 0);
      const totalCleared = qty + damageQty;

      if (!pendingMap[pendId]) {
        pendingMap[pendId] = { id: pendId, workerName: wName, jobWorkType: jwType, qty: 0 };
      }
      pendingMap[pendId].qty -= totalCleared;

      if (!workerQueueMap[pendId]) workerQueueMap[pendId] = [];
      const queue = workerQueueMap[pendId];
      const allocList = [];

      let okLeft = qty;
      let dmgLeft = damageQty;

      // 1. Pehle Year-Closing Opening Pending (agar hai) clear karein
      let openRem = openingRemMap[pendId] || 0;
      if (openRem > 0 && okLeft > 0) {
        const take = Math.min(openRem, okLeft);
        openRem -= take;
        okLeft -= take;
        bunkarDeltaMap['__JW_POOL__'] = (bunkarDeltaMap['__JW_POOL__'] || 0) + take;
        addAlloc(allocList, '__JW_POOL__', take);
      }
      if (openRem > 0 && dmgLeft > 0) {
        const takeDmg = Math.min(openRem, dmgLeft);
        openRem -= takeDmg;
        dmgLeft -= takeDmg;
      }
      openingRemMap[pendId] = openRem;

      // 2. OK Wapsi Pcs ko FIFO Karigar batches me wapas daalein
      for (let i = 0; i < queue.length && okLeft > 0; i++) {
        const qNode = queue[i];
        if (qNode.remQty <= 0) continue;
        const take = Math.min(qNode.remQty, okLeft);
        qNode.remQty -= take;
        okLeft -= take;

        // Karigar ke naam par hi stock wapas save hoga
        bunkarDeltaMap[qNode.bunkarName] = (bunkarDeltaMap[qNode.bunkarName] || 0) + take;
        addAlloc(allocList, qNode.bunkarName, take);

        qNode.itemRef.okQty += take;
        qNode.itemRef.pendingQty = Math.max(0, qNode.itemRef.pendingQty - take);
        if (outProgressMap[qNode.ledgerId]) {
          outProgressMap[qNode.ledgerId].okQty += take;
          outProgressMap[qNode.ledgerId].pendingQty = Math.max(0, outProgressMap[qNode.ledgerId].pendingQty - take);
        }
      }

      // 3. Damage / Shortage Pcs sirf pending kam karengi (stock me wapas nahi judengi)
      for (let i = 0; i < queue.length && dmgLeft > 0; i++) {
        const qNode = queue[i];
        if (qNode.remQty <= 0) continue;
        const takeDmg = Math.min(qNode.remQty, dmgLeft);
        qNode.remQty -= takeDmg;
        dmgLeft -= takeDmg;

        qNode.itemRef.damageQty += takeDmg;
        qNode.itemRef.pendingQty = Math.max(0, qNode.itemRef.pendingQty - takeDmg);
        if (outProgressMap[qNode.ledgerId]) {
          outProgressMap[qNode.ledgerId].damageQty += takeDmg;
          outProgressMap[qNode.ledgerId].pendingQty = Math.max(0, outProgressMap[qNode.ledgerId].pendingQty - takeDmg);
        }
      }

      // 4. Agar pending se zyada OK wapsi aayi ho toh fallback Pool me safe rakhein
      if (okLeft > 0) {
        bunkarDeltaMap['__JW_POOL__'] = (bunkarDeltaMap['__JW_POOL__'] || 0) + okLeft;
        addAlloc(allocList, '__JW_POOL__', okLeft);
      }

      if (l.id !== undefined && l.id !== null) {
        inAllocMap[l.id] = allocList;
      }
    }
  });

  return { bunkarDeltaMap, pendingMap, workerQueueMap, outProgressMap, inAllocMap };
}
window.stxComputeJWAnalytics = stxComputeJWAnalytics;

async function stxGetJWAnalytics() {
  let opening = null;
  try {
    opening = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null');
  } catch (_) {}
  const jwLedger = await dbGetAll('jobWorkLedger');
  return stxComputeJWAnalytics(opening, jwLedger);
}
window.stxGetJWAnalytics = stxGetJWAnalytics;

// === SHARED 4-STAGE STOCK COMPUTATION ===
function stxComputeStockMaps(opening, jwLedger, bcLogs, challans) {
  const { bunkarDeltaMap, pendingMap } = stxComputeJWAnalytics(opening, jwLedger);
  const bunkarMap = { ...bunkarDeltaMap };
  const convertedMap = {};
  const readyMap = {};

  // 1. Year Closing Opening Stock (Converted & Ready)
  if (opening) {
    (opening.convertedStock || []).forEach((c) => {
      if (c && c.designName) convertedMap[c.designName] = { designName: c.designName, specLine: c.specLine || '', qty: Number(c.qty) || 0 };
    });
    (opening.readyStock || []).forEach((r) => {
      if (r && r.skuKey) readyMap[r.skuKey] = { ...r, qty: Number(r.qty) || 0 };
    });
  }

  // 2. Replay Stock Convert & Manual Barcoding Logs
  (bcLogs || []).forEach((b) => {
    const qty = Number(b.qty) || 0;
    if (b.mode === 'STOCK_CONVERT') {
      if (b.sourceName) {
        bunkarMap[b.sourceName] = (bunkarMap[b.sourceName] || 0) - qty;
      }
      if (b.designName) {
        if (!convertedMap[b.designName]) {
          convertedMap[b.designName] = { designName: b.designName, specLine: b.specLine || '', qty: 0 };
        } else if (b.specLine) {
          convertedMap[b.designName].specLine = b.specLine;
        }
        convertedMap[b.designName].qty += qty;
      }
    } else {
      if (b.fromConverted) {
        if (b.sourceName) {
          if (!convertedMap[b.sourceName]) {
            convertedMap[b.sourceName] = { designName: b.sourceName, specLine: b.specLine || '', qty: 0 };
          }
          convertedMap[b.sourceName].qty -= qty;
        }
      } else if (b.sourceName) {
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
    }
  });

  // 3. Replay Challans
  (challans || []).forEach((c) => {
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

  const nowIso = new Date().toISOString();
  const bunkarList = Object.keys(bunkarMap)
    .filter((name) => bunkarMap[name] > 0)
    .map((name) => ({ bunkarName: name, qty: bunkarMap[name], updatedAt: nowIso }));

  const convertedList = Object.keys(convertedMap)
    .filter((dName) => convertedMap[dName].qty > 0)
    .map((dName) => ({ ...convertedMap[dName], updatedAt: nowIso }));

  const pendingList = Object.keys(pendingMap)
    .filter((id) => pendingMap[id].qty > 0)
    .map((id) => ({ ...pendingMap[id] }));

  const readyList = Object.keys(readyMap)
    .filter((skuKey) => readyMap[skuKey].qty > 0)
    .map((skuKey) => ({ ...readyMap[skuKey], updatedAt: nowIso }));

  return { bunkarList, convertedList, pendingList, readyList };
}

// === 4-STAGE EXACT AUTO STOCK ENGINE ===
async function stxRecalculateAllStock() {
  await stxInitLanMode();

  if (stxLanMode) {
    const snap = await stxApiFetch('/api/snapshot');
    if (snap && snap.sharedStorage) {
      stxApplySharedMeta(snap.sharedStorage);
    }
    let opening = null;
    try {
      opening = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null');
    } catch (_) {}

    const stores = (snap && snap.stores) || {};
    const { bunkarList, convertedList, pendingList, readyList } = stxComputeStockMaps(
      opening,
      stores.jobWorkLedger || [],
      stores.barcodingLogs || [],
      stores.challans || []
    );

    await stxApiFetch('/api/tx', {
      method: 'POST',
      body: JSON.stringify({
        ops: [
          { store: 'bunkarStock', action: 'clear' },
          { store: 'bunkarStock', action: 'bulkPut', items: bunkarList },
          { store: 'convertedStock', action: 'clear' },
          { store: 'convertedStock', action: 'bulkPut', items: convertedList },
          { store: 'jobWorkPending', action: 'clear' },
          { store: 'jobWorkPending', action: 'bulkPut', items: pendingList },
          { store: 'readyStock', action: 'clear' },
          { store: 'readyStock', action: 'bulkPut', items: readyList }
        ]
      })
    });
    return true;
  }

  const db = await openDB();
  let opening = null;
  try {
    opening = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null');
  } catch (_) {}

  return new Promise((resolve, reject) => {
    const storeNames = ['bunkarStock', 'convertedStock', 'jobWorkPending', 'readyStock', 'jobWorkLedger', 'barcodingLogs', 'challans'];
    const tx = db.transaction(storeNames, 'readwrite');

    let jwLedger = null;
    let bcLogs = null;
    let challans = null;
    let doneCount = 0;

    function finishRebuild() {
      doneCount++;
      if (doneCount < 3) return;

      const { bunkarList, convertedList, pendingList, readyList } = stxComputeStockMaps(
        opening,
        jwLedger,
        bcLogs,
        challans
      );

      const bStore = tx.objectStore('bunkarStock');
      bStore.clear();
      bunkarList.forEach((item) => bStore.put(item));

      const cStore = tx.objectStore('convertedStock');
      cStore.clear();
      convertedList.forEach((item) => cStore.put(item));

      const pStore = tx.objectStore('jobWorkPending');
      pStore.clear();
      pendingList.forEach((item) => pStore.put(item));

      const rStore = tx.objectStore('readyStock');
      rStore.clear();
      readyList.forEach((item) => rStore.put(item));
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
  await stxInitLanMode();

  if (stxLanMode) {
    const snap = await stxApiFetch('/api/snapshot');
    if (snap && snap.sharedStorage) stxApplySharedMeta(snap.sharedStorage);
    let openingStock = null;
    try { openingStock = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null'); } catch (_) {}
    const backup = {
      app: 'SimpliTex',
      date: new Date().toISOString(),
      openingStock,
      stores: snap.stores || {}
    };
    return JSON.stringify(backup, null, 2);
  }

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
  if (!data || (data.app !== 'SimpliTex' && data.app !== 'SimpliTex-LAN') || !data.stores) {
    throw new Error('Galat Backup File hai!');
  }

  await stxInitLanMode();

  if (data.openingStock) {
    localStorage.setItem('simplitex_opening_stock', JSON.stringify(data.openingStock));
  } else {
    localStorage.removeItem('simplitex_opening_stock');
  }

  if (stxLanMode) {
    await stxApiFetch('/api/import-full', {
      method: 'POST',
      body: JSON.stringify({
        stores: data.stores,
        sharedStorage: {
          simplitex_opening_stock: data.openingStock ? JSON.stringify(data.openingStock) : null
        }
      })
    });
    return;
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
  await stxInitLanMode();
  const txStores = ['jobWorkLedger', 'barcodingLogs', 'orders', 'challans'];

  if (stxLanMode) {
    await stxApiFetch('/api/tx', {
      method: 'POST',
      body: JSON.stringify({
        ops: txStores.map((store) => ({ store, action: 'clear' }))
      })
    });
    return;
  }

  const db = await openDB();
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
