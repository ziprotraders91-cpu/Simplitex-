/**
 * SimpliTex - Saree Wholesale ERP
 * 100% Offline Multi-PC Local LAN Server (Zero External Dependencies)
 * Pure Node.js (http, fs, path, os)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'simplitex-data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const META_FILE = path.join(DATA_DIR, '_meta.json');

// Exact SimpliTexDB v3 Store Schema
const STORES = {
  firms: { keyPath: 'id', autoIncrement: true },
  jobWorkTypes: { keyPath: 'name', autoIncrement: false },
  jobWorkers: { keyPath: 'id', autoIncrement: true },
  designs: { keyPath: 'designName', autoIncrement: false },
  parties: { keyPath: 'id', autoIncrement: true },
  folders: { keyPath: 'name', autoIncrement: false },
  bunkarStock: { keyPath: 'bunkarName', autoIncrement: false },
  convertedStock: { keyPath: 'designName', autoIncrement: false },
  jobWorkPending: { keyPath: 'id', autoIncrement: false },
  readyStock: { keyPath: 'skuKey', autoIncrement: false },
  jobWorkLedger: { keyPath: 'id', autoIncrement: true },
  barcodingLogs: { keyPath: 'id', autoIncrement: true },
  orders: { keyPath: 'id', autoIncrement: true },
  challans: { keyPath: 'id', autoIncrement: true }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const dbCache = {};
let metaCache = {
  version: 1,
  nextIds: {},
  sharedStorage: {}
};
const sseClients = new Set();
let writeLockPromise = Promise.resolve();

function withWriteLock(fn) {
  const next = writeLockPromise.then(() => fn(), () => fn());
  writeLockPromise = next.catch(() => {});
  return next;
}

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function atomicWriteJson(filePath, data) {
  const tmpPath = filePath + '.tmp.' + process.pid + '.' + Date.now();
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error('[SimpliTex Server] JSON read error in', filePath, err.message);
    return fallback;
  }
}

function storeFilePath(storeName) {
  return path.join(DATA_DIR, storeName + '.json');
}

function normalizeKey(storeName, rawKey) {
  const cfg = STORES[storeName];
  if (!cfg) return rawKey;
  if (cfg.autoIncrement) {
    const n = Number(rawKey);
    return Number.isFinite(n) ? n : rawKey;
  }
  return String(rawKey);
}

function initDatabase() {
  ensureDirectories();

  const savedMeta = readJsonSafe(META_FILE, null);
  if (savedMeta && typeof savedMeta === 'object') {
    metaCache = {
      version: Number(savedMeta.version) || 1,
      nextIds: savedMeta.nextIds && typeof savedMeta.nextIds === 'object' ? savedMeta.nextIds : {},
      sharedStorage: savedMeta.sharedStorage && typeof savedMeta.sharedStorage === 'object' ? savedMeta.sharedStorage : {}
    };
  }

  for (const storeName of Object.keys(STORES)) {
    const cfg = STORES[storeName];
    const records = readJsonSafe(storeFilePath(storeName), []);
    dbCache[storeName] = Array.isArray(records) ? records : [];

    if (cfg.autoIncrement) {
      let maxId = Number(metaCache.nextIds[storeName]) || 1;
      for (const item of dbCache[storeName]) {
        const idVal = Number(item && item[cfg.keyPath]);
        if (Number.isFinite(idVal) && idVal >= maxId) {
          maxId = idVal + 1;
        }
      }
      metaCache.nextIds[storeName] = maxId;
    }
  }

  let seeded = false;
  if (dbCache.jobWorkTypes.length === 0) {
    dbCache.jobWorkTypes = [
      { name: 'Embroidery' },
      { name: 'Calender' },
      { name: 'Jhalar' },
      { name: 'Swarovski' }
    ];
    atomicWriteJson(storeFilePath('jobWorkTypes'), dbCache.jobWorkTypes);
    seeded = true;
  }
  if (dbCache.folders.length === 0) {
    dbCache.folders = [
      { name: 'Mishri' },
      { name: 'Hanger' },
      { name: 'Book Fold' }
    ];
    atomicWriteJson(storeFilePath('folders'), dbCache.folders);
    seeded = true;
  }

  if (!fs.existsSync(META_FILE) || seeded) {
    atomicWriteJson(META_FILE, metaCache);
  }
  for (const storeName of Object.keys(STORES)) {
    if (!fs.existsSync(storeFilePath(storeName))) {
      atomicWriteJson(storeFilePath(storeName), dbCache[storeName]);
    }
  }

  createDailyAutoBackup();
}

function createDailyAutoBackup() {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayFile = path.join(BACKUP_DIR, `auto-${y}-${m}-${d}.json`);

    if (!fs.existsSync(todayFile)) {
      const snapshot = buildFullSnapshot();
      atomicWriteJson(todayFile, snapshot);
      console.log(`[SimpliTex Server] Auto backup created: ${path.basename(todayFile)}`);
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('auto-') && f.endsWith('.json'))
      .sort();
    while (files.length > 15) {
      const oldest = files.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    }
  } catch (err) {
    console.error('[SimpliTex Server] Auto backup warning:', err.message);
  }
}

function buildFullSnapshot() {
  const storesOut = {};
  for (const storeName of Object.keys(STORES)) {
    storesOut[storeName] = dbCache[storeName];
  }
  return {
    app: 'SimpliTex-LAN',
    exportedAt: new Date().toISOString(),
    version: metaCache.version,
    sharedStorage: metaCache.sharedStorage,
    stores: storesOut
  };
}

function broadcastChange(changedStores, sourceClientId) {
  const payload = JSON.stringify({
    type: 'db_updated',
    version: metaCache.version,
    stores: Array.from(new Set(changedStores || [])),
    sourceClientId: sourceClientId || null,
    timestamp: Date.now()
  });
  for (const res of sseClients) {
    try {
      res.write(`event: update\ndata: ${payload}\n\n`);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

function cloneRecord(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function applySingleOp(storeName, action, payload) {
  const cfg = STORES[storeName];
  if (!cfg) throw new Error(`Unknown store: ${storeName}`);
  const list = dbCache[storeName];
  const kp = cfg.keyPath;

  if (action === 'clear') {
    dbCache[storeName] = [];
    return { ok: true };
  }

  if (action === 'delete') {
    const key = normalizeKey(storeName, payload.key);
    const idx = list.findIndex((r) => r && r[kp] === key);
    if (idx !== -1) list.splice(idx, 1);
    return { ok: true, key };
  }

  if (action === 'add' || action === 'put') {
    const item = cloneRecord(payload.value || {});
    if (cfg.autoIncrement) {
      let idVal = item[kp];
      if (idVal === undefined || idVal === null || idVal === '') {
        idVal = metaCache.nextIds[storeName] || 1;
        metaCache.nextIds[storeName] = idVal + 1;
        item[kp] = idVal;
      } else {
        idVal = Number(idVal);
        item[kp] = idVal;
        if (idVal >= (metaCache.nextIds[storeName] || 1)) {
          metaCache.nextIds[storeName] = idVal + 1;
        }
      }
    } else {
      if (item[kp] === undefined || item[kp] === null || item[kp] === '') {
        throw new Error(`Missing keyPath "${kp}" for store "${storeName}"`);
      }
      item[kp] = String(item[kp]);
    }

    const key = item[kp];
    const existingIdx = list.findIndex((r) => r && r[kp] === key);

    if (action === 'add' && existingIdx !== -1) {
      const err = new Error(`Key "${key}" already exists in "${storeName}"`);
      err.statusCode = 409;
      throw err;
    }

    if (existingIdx !== -1) {
      list[existingIdx] = item;
    } else {
      list.push(item);
    }
    return { ok: true, key, record: item };
  }

  throw new Error(`Unsupported action: ${action}`);
}

function persistDirtyStores(dirtySet, dirtyMeta) {
  for (const storeName of dirtySet) {
    atomicWriteJson(storeFilePath(storeName), dbCache[storeName]);
  }
  if (dirtyMeta) {
    atomicWriteJson(META_FILE, metaCache);
  }
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id'
  });
  res.end(body);
}

function readRequestBody(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getLanIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const isV4 = net.family === 'IPv4' || net.family === 4;
      if (isV4 && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

function serveStaticFile(reqPath, res) {
  let cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch (_) {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  const resolved = path.resolve(ROOT_DIR, '.' + cleanPath);
  if (!resolved.startsWith(ROOT_DIR + path.sep) && resolved !== path.join(ROOT_DIR, 'index.html')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (resolved.startsWith(DATA_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(resolved).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

async function handleApi(req, res, urlObj) {
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();
  const clientId = req.headers['x-client-id'] || null;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id'
    });
    return res.end();
  }

  if (method === 'GET' && pathname === '/api/ping') {
    return sendJson(res, 200, {
      ok: true,
      mode: 'LAN_SERVER',
      version: metaCache.version,
      serverTime: Date.now(),
      hostIps: getLanIPs(),
      port: PORT
    });
  }

  if (method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ version: metaCache.version })}\n\n`);
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/snapshot') {
    return sendJson(res, 200, buildFullSnapshot());
  }

  if (method === 'GET' && pathname === '/api/export-full') {
    const snap = buildFullSnapshot();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="simplitex-lan-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store'
    });
    return res.end(JSON.stringify(snap, null, 2));
  }

  if (method === 'POST' && pathname === '/api/import-full') {
    const body = await readRequestBody(req);
    const incomingStores = body.stores || body.data || body;
    if (!incomingStores || typeof incomingStores !== 'object') {
      return sendJson(res, 400, { ok: false, error: 'Invalid backup JSON format' });
    }

    const result = await withWriteLock(() => {
      const dirtyStores = [];
      for (const storeName of Object.keys(STORES)) {
        if (Array.isArray(incomingStores[storeName])) {
          dbCache[storeName] = cloneRecord(incomingStores[storeName]);
          const cfg = STORES[storeName];
          if (cfg.autoIncrement) {
            let maxId = 1;
            for (const row of dbCache[storeName]) {
              const idVal = Number(row && row[cfg.keyPath]);
              if (Number.isFinite(idVal) && idVal >= maxId) maxId = idVal + 1;
            }
            metaCache.nextIds[storeName] = maxId;
          }
          dirtyStores.push(storeName);
        }
      }

      if (body.sharedStorage && typeof body.sharedStorage === 'object') {
        Object.assign(metaCache.sharedStorage, body.sharedStorage);
      }

      metaCache.version += 1;
      persistDirtyStores(dirtyStores, true);
      broadcastChange(dirtyStores, clientId);
      return { ok: true, version: metaCache.version, importedStores: dirtyStores };
    });
    return sendJson(res, 200, result);
  }

  if (method === 'GET' && pathname === '/api/meta') {
    return sendJson(res, 200, {
      ok: true,
      version: metaCache.version,
      sharedStorage: metaCache.sharedStorage
    });
  }

  if (method === 'POST' && pathname === '/api/meta') {
    const body = await readRequestBody(req);
    const result = await withWriteLock(() => {
      if (body && typeof body.patch === 'object') {
        for (const [k, v] of Object.entries(body.patch)) {
          if (v === null || v === undefined) {
            delete metaCache.sharedStorage[k];
          } else {
            metaCache.sharedStorage[k] = v;
          }
        }
      } else if (body && body.key) {
        if (body.value === null || body.value === undefined) {
          delete metaCache.sharedStorage[body.key];
        } else {
          metaCache.sharedStorage[body.key] = body.value;
        }
      }
      metaCache.version += 1;
      atomicWriteJson(META_FILE, metaCache);
      broadcastChange(['_meta'], clientId);
      return { ok: true, version: metaCache.version, sharedStorage: metaCache.sharedStorage };
    });
    return sendJson(res, 200, result);
  }

  if (method === 'POST' && pathname === '/api/tx') {
    const body = await readRequestBody(req);
    const ops = Array.isArray(body.ops) ? body.ops : [];
    if (ops.length === 0) {
      return sendJson(res, 400, { ok: false, error: 'Empty transaction ops' });
    }

    const result = await withWriteLock(() => {
      const touchedStores = new Set();
      for (const op of ops) {
        if (!STORES[op.store]) throw new Error(`Unknown store: ${op.store}`);
        touchedStores.add(op.store);
      }
      const backupStores = {};
      for (const s of touchedStores) {
        backupStores[s] = cloneRecord(dbCache[s]);
      }
      const backupNextIds = cloneRecord(metaCache.nextIds);

      try {
        const results = [];
        for (const op of ops) {
          if (op.action === 'bulkPut' && Array.isArray(op.items)) {
            for (const item of op.items) {
              results.push(applySingleOp(op.store, 'put', { value: item }));
            }
          } else {
            results.push(applySingleOp(op.store, op.action, op));
          }
        }
        metaCache.version += 1;
        persistDirtyStores(touchedStores, true);
        broadcastChange(Array.from(touchedStores), clientId);
        return { ok: true, version: metaCache.version, results };
      } catch (err) {
        for (const s of touchedStores) {
          dbCache[s] = backupStores[s];
        }
        metaCache.nextIds = backupNextIds;
        throw err;
      }
    });
    return sendJson(res, 200, result);
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'api' && parts[1] === 'store' && parts[2]) {
    const storeName = decodeURIComponent(parts[2]);
    const cfg = STORES[storeName];
    if (!cfg) {
      return sendJson(res, 404, { ok: false, error: `Store "${storeName}" not found` });
    }

    if (method === 'GET' && parts.length === 3) {
      return sendJson(res, 200, {
        ok: true,
        version: metaCache.version,
        items: dbCache[storeName]
      });
    }

    if (method === 'GET' && parts.length === 4) {
      const key = normalizeKey(storeName, decodeURIComponent(parts[3]));
      const found = dbCache[storeName].find((r) => r && r[cfg.keyPath] === key) || null;
      return sendJson(res, 200, { ok: true, version: metaCache.version, item: found });
    }

    if (method === 'POST' && parts[3] === 'add') {
      const body = await readRequestBody(req);
      const val = body.value !== undefined ? body.value : body;
      const result = await withWriteLock(() => {
        const resOp = applySingleOp(storeName, 'add', { value: val });
        metaCache.version += 1;
        persistDirtyStores([storeName], cfg.autoIncrement);
        broadcastChange([storeName], clientId);
        return { ...resOp, version: metaCache.version };
      });
      return sendJson(res, 200, result);
    }

    if ((method === 'PUT' || method === 'POST') && parts[3] === 'put') {
      const body = await readRequestBody(req);
      const val = body.value !== undefined ? body.value : body;
      const result = await withWriteLock(() => {
        const resOp = applySingleOp(storeName, 'put', { value: val });
        metaCache.version += 1;
        persistDirtyStores([storeName], cfg.autoIncrement);
        broadcastChange([storeName], clientId);
        return { ...resOp, version: metaCache.version };
      });
      return sendJson(res, 200, result);
    }

    if (method === 'POST' && parts[3] === 'clear') {
      const result = await withWriteLock(() => {
        applySingleOp(storeName, 'clear', {});
        metaCache.version += 1;
        persistDirtyStores([storeName], true);
        broadcastChange([storeName], clientId);
        return { ok: true, version: metaCache.version };
      });
      return sendJson(res, 200, result);
    }

    if (method === 'DELETE' && parts.length === 4) {
      const rawKey = decodeURIComponent(parts[3]);
      const result = await withWriteLock(() => {
        const resOp = applySingleOp(storeName, 'delete', { key: rawKey });
        metaCache.version += 1;
        persistDirtyStores([storeName], true);
        broadcastChange([storeName], clientId);
        return { ...resOp, version: metaCache.version };
      });
      return sendJson(res, 200, result);
    }
  }

  return sendJson(res, 404, { ok: false, error: 'API route not found' });
}

initDatabase();

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (urlObj.pathname.startsWith('/api/')) {
      await handleApi(req, res, urlObj);
    } else {
      serveStaticFile(urlObj.pathname, res);
    }
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[SimpliTex Server] Error:', err.message);
    if (!res.headersSent) {
      sendJson(res, status, { ok: false, error: err.message || 'Server error' });
    }
  }
});

setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(': keepalive\n\n');
    } catch (_) {
      sseClients.delete(res);
    }
  }
}, 25000);

server.listen(PORT, HOST, () => {
  const ips = getLanIPs();
  console.log('\n====================================================');
  console.log('   SimpliTex ERP - Offline Multi-PC LAN Server');
  console.log('====================================================');
  console.log(`   Data Folder : ${DATA_DIR}`);
  console.log(`   This PC URL : http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach((ip) => {
      console.log(`   Other PCs   : http://${ip}:${PORT}`);
    });
  } else {
    console.log('   Other PCs   : Connect Wi-Fi/LAN & restart to see IP');
  }
  console.log('====================================================');
  console.log('   Keep this window OPEN while working on other PCs.');
  console.log('   Press Ctrl+C to stop server safely.\n');
});
// === END OF SERVER.JS ===
