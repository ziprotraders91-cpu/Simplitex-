// === SimpliTex Core App v8 (Pro Dashboard + Accidental Delete Guard + 6-Field Party Master + Karigar Wapsi Breakdown) ===
const MASTER_SECRET = 'SIMPLITEX_MAU_2026_SECRET';
const JW_POOL_KEY = '__JW_POOL__';
let stockTabMode = 'BUNKAR'; // 'BUNKAR' | 'CONVERTED' | 'JW_WAPSI' | 'BARCODE'
let reportTabMode = 'ORDERS'; // 'ORDERS' | 'KARIGAR'

function stxEsc(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function stxTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// === GLOBAL AUTO ERROR HANDLER (Enterprise Crash Protection) ===
window._stxErrorLog = window._stxErrorLog || [];

function stxRecordError(errMsg, source) {
  const msg = String(errMsg || 'Unknown error');
  if (msg.includes('ResizeObserver loop')) return;
  window._stxErrorLog.unshift({ time: new Date().toLocaleTimeString(), source, msg });
  if (window._stxErrorLog.length > 25) window._stxErrorLog.pop();
  console.error(`[SimpliTex AutoGuard:${source}]`, msg);

  const loader = document.getElementById('stxTallyLoader');
  if (loader && !loader.classList.contains('hidden')) {
    hideTallyLoader(true);
  }
  stxToast('⚠️ Ek technical rukawat aayi par app safe hai: ' + msg.slice(0, 90), 'error', 4200);
}

window.addEventListener('error', (ev) => {
  if (ev && ev.message) stxRecordError(ev.message, 'runtime');
});

window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : 'Promise rejected';
  stxRecordError(reason, 'async');
});

// === IN-APP TOAST, MODAL & ACCIDENTAL DELETE GUARD ===
function stxToast(msg, type = 'info', durationMs = 2800) {
  if (!document.body) return;
  let wrap = document.getElementById('stxToastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'stxToastWrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = `stx-toast ${type}`;
  const span = document.createElement('span');
  span.textContent = msg;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:transparent; border:none; color:#cbd5e1; cursor:pointer; font-weight:800; font-size:13px; padding:0 2px;';
  closeBtn.onclick = () => t.remove();

  t.appendChild(span);
  t.appendChild(closeBtn);
  wrap.appendChild(t);

  setTimeout(() => {
    try { t.remove(); } catch (_) {}
  }, durationMs);
}
window.stxToast = stxToast;

function stxCloseModal() {
  const el = document.getElementById('stxModalBackdrop');
  if (el) el.remove();
}
window.stxCloseModal = stxCloseModal;

function stxOpenModal({ title = 'Info', bodyHtml = '', buttons = [] }) {
  stxCloseModal();
  const backdrop = document.createElement('div');
  backdrop.id = 'stxModalBackdrop';
  backdrop.onclick = (e) => {
    if (e.target === backdrop) stxCloseModal();
  };

  const modal = document.createElement('div');
  modal.className = 'stx-modal';
  modal.innerHTML = `<h3>${stxEsc(title)}</h3><div id="stxModalBody">${bodyHtml}</div><div class="stx-modal-actions" id="stxModalActions"></div>`;
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const actEl = document.getElementById('stxModalActions');
  (buttons || []).forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b.className || 'btn btn-light';
    btn.textContent = b.label || 'OK';
    btn.onclick = () => {
      if (typeof b.onClick === 'function') b.onClick(modal);
      else stxCloseModal();
    };
    actEl.appendChild(btn);
  });

  setTimeout(() => {
    const firstInput = modal.querySelector('input, select, button');
    if (firstInput) firstInput.focus();
  }, 30);
  return modal;
}
window.stxOpenModal = stxOpenModal;

// Accidental Delete Guard: Cancel button hamesha default focused rehta hai
function stxConfirmDelete({ title = '⚠️ Delete Confirm Karein?', detailsHtml = '', confirmLabel = '🗑️ Haan, Delete Karein', onConfirm }) {
  stxOpenModal({
    title,
    bodyHtml: `
      <p style="margin-bottom:8px; color:#475569; font-weight:600;">
        Kya aap sach mein ye record delete karna chahte hain? Galti se delete na ho isliye neeche details check karein:
      </p>
      <div class="stx-del-box">${detailsHtml || 'Selected record permanently hat jayega.'}</div>
    `,
    buttons: [
      { label: 'Cancel (Safe)', className: 'btn btn-light', onClick: () => stxCloseModal() },
      {
        label: confirmLabel,
        className: 'btn btn-danger',
        onClick: async () => {
          stxCloseModal();
          if (typeof onConfirm === 'function') await onConfirm();
        }
      }
    ]
  });
}
window.stxConfirmDelete = stxConfirmDelete;

// === 0. TALLY-STYLE COMPANY LOADING SCREEN ===
function ensureTallyLoader() {
  let el = document.getElementById('stxTallyLoader');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'stxTallyLoader';
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:#0b1120', 'color:#f8fafc',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:20px', 'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
    'transition:opacity 0.25s ease'
  ].join(';');

  el.innerHTML = `
    <div style="width:100%; max-width:400px; background:#1e293b; border:1px solid #334155; border-radius:16px; padding:26px 22px; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.6);">
      <img src="./icon-192.png" alt="SimpliTex" style="width:64px; height:64px; border-radius:14px; margin-bottom:10px; border:1px solid #475569;" />
      <div style="font-size:22px; font-weight:800; letter-spacing:0.5px;">SimpliTex ERP</div>
      <div id="stxLoadCompany" style="font-size:13px; color:#fbbf24; font-weight:700; margin-top:4px; min-height:18px;">
        Loading Company...
      </div>

      <div style="background:#0f172a; border-radius:999px; height:10px; overflow:hidden; margin:18px 0 8px; border:1px solid #334155;">
        <div id="stxLoadBar" style="width:10%; height:100%; background:linear-gradient(90deg,#22c55e,#4ade80); transition:width 0.25s ease;"></div>
      </div>

      <div style="display:flex; justify-content:space-between; font-size:12px; color:#94a3b8;">
        <span id="stxLoadMsg">Starting SimpliTex...</span>
        <b id="stxLoadPct" style="color:#f8fafc;">10%</b>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function showTallyLoader(companyText, msg, pct) {
  const el = ensureTallyLoader();
  el.classList.remove('hidden');
  el.style.display = 'flex';
  el.style.opacity = '1';
  setTallyLoader(companyText, msg, pct);
}

function setTallyLoader(companyText, msg, pct) {
  const cEl = document.getElementById('stxLoadCompany');
  const mEl = document.getElementById('stxLoadMsg');
  const bEl = document.getElementById('stxLoadBar');
  const pEl = document.getElementById('stxLoadPct');
  if (companyText && cEl) cEl.textContent = companyText;
  if (msg && mEl) mEl.textContent = msg;
  if (typeof pct === 'number') {
    if (bEl) bEl.style.width = pct + '%';
    if (pEl) pEl.textContent = pct + '%';
  }
}

function hideTallyLoader(immediate) {
  const el = document.getElementById('stxTallyLoader');
  if (!el) return;
  if (immediate) {
    el.style.display = 'none';
    el.classList.add('hidden');
    return;
  }
  el.style.opacity = '0';
  setTimeout(() => {
    el.style.display = 'none';
    el.classList.add('hidden');
  }, 260);
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (document.body) {
  showTallyLoader('Initializing Company...', 'Starting SimpliTex...', 10);
}

// === 1. PURE JS SIGNATURE (100% OFFLINE) ===
function makeSignature(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const full = text + '|' + MASTER_SECRET;
  for (let i = 0; i < full.length; i++) {
    const ch = full.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)).toUpperCase().slice(0, 6);
}

function getTodayYMD(refMs) {
  const d = refMs ? new Date(refMs) : new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function addDaysYMD(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// === 2. LICENSE & ANTI-DATE-CHEAT (Multi-PC Clock Safe) ===
function getOrCreateLicense() {
  let lic = null;
  try { lic = JSON.parse(localStorage.getItem('simplitex_license') || 'null'); } catch (_) {}
  if (!lic) {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    lic = { deviceId: 'STX-' + rand, expiryYMD: addDaysYMD(15), lastSeenMs: Date.now() };
    localStorage.setItem('simplitex_license', JSON.stringify(lic));
  }
  return lic;
}

function checkLicense() {
  const lic = getOrCreateLicense();
  const isLan = typeof window.stxIsLanMode === 'function' && window.stxIsLanMode();
  const srvTime = (isLan && window.STX_LAN_INFO && window.STX_LAN_INFO.serverTime) ? Number(window.STX_LAN_INFO.serverTime) : null;
  const now = srvTime || Date.now();
  const today = getTodayYMD(now);

  if (now < (lic.lastSeenMs || 0) - 3600000) {
    showLockScreen(lic.deviceId, 'Device ki Date/Time galat hai! Sahi karein ya Unlock Code daalein.');
    return false;
  }

  if (!isLan || srvTime) {
    lic.lastSeenMs = now;
    localStorage.setItem('simplitex_license', JSON.stringify(lic));
  }

  if (today > lic.expiryYMD) {
    showLockScreen(lic.deviceId, 'Monthly Plan khatam ho gaya hai. Admin se Unlock Code lein.');
    return false;
  }

  const expEl = document.getElementById('expiryPill');
  const devEl = document.getElementById('settingsDeviceId');
  const setExpEl = document.getElementById('settingsExpiry');
  if (expEl) expEl.textContent = 'Valid: ' + lic.expiryYMD;
  if (devEl) devEl.textContent = lic.deviceId;
  if (setExpEl) setExpEl.textContent = lic.expiryYMD;
  return true;
}

function showLockScreen(deviceId, msg) {
  document.getElementById('showDeviceId').textContent = deviceId;
  document.getElementById('lockMsg').textContent = msg;
  document.getElementById('lockScreen').classList.remove('hidden');
}

function applyUnlockCode() {
  const lic = getOrCreateLicense();
  const raw = document.getElementById('unlockCodeInput').value.trim().toUpperCase();
  const parts = raw.split('-');
  if (parts.length !== 2 || parts[0].length !== 8) return stxToast('Format: YYYYMMDD-XXXXXX', 'warn');
  const [ymdStr, sig] = parts;
  const expected = makeSignature(lic.deviceId + '|' + ymdStr);
  const ymdNum = parseInt(ymdStr, 10);

  if (sig !== expected || isNaN(ymdNum) || ymdNum < getTodayYMD()) {
    return stxToast('Invalid ya Expired Code!', 'error');
  }
  lic.expiryYMD = ymdNum;
  lic.lastSeenMs = Date.now();
  localStorage.setItem('simplitex_license', JSON.stringify(lic));
  document.getElementById('lockScreen').classList.add('hidden');
  stxToast('✅ App Unlocked! Valid till: ' + ymdNum, 'success');
  initApp();
}

// === 3. UNIVERSAL SEARCH & 15-ROW PAGINATION ENGINE ===
window._stxPagerState = window._stxPagerState || {};
window._stxPagerConfigs = window._stxPagerConfigs || {};

function mountPagedList(opts) {
  const host = document.getElementById(opts.id);
  if (!host) return;
  if (!window._stxPagerState[opts.id]) {
    window._stxPagerState[opts.id] = { q: '', page: 1 };
  }
  window._stxPagerConfigs[opts.id] = opts;
  const state = window._stxPagerState[opts.id];

  host.innerHTML = `
    <div class="search-bar-wrap">
      <input id="${opts.id}_search" placeholder="${opts.placeholder || '🔍 Universal Search...'}"
             value="${String(state.q).replace(/"/g, '&quot;')}" data-custom-enter="1" data-no-back="1"
             oninput="updatePagedQuery('${opts.id}', this.value)" />
      <button type="button" class="btn btn-light btn-sm" onclick="clearPagedQuery('${opts.id}')">Clear</button>
    </div>
    <div id="${opts.id}_body"></div>
    <div id="${opts.id}_pager" class="pager-bar"></div>
  `;
  drawPagedBody(opts.id);
}

function updatePagedQuery(id, val) {
  if (!window._stxPagerState[id]) window._stxPagerState[id] = { q: '', page: 1 };
  window._stxPagerState[id].q = val;
  window._stxPagerState[id].page = 1;
  drawPagedBody(id);
}

function clearPagedQuery(id) {
  const inp = document.getElementById(id + '_search');
  if (inp) { inp.value = ''; inp.focus(); }
  updatePagedQuery(id, '');
}

function goPagedPage(id, delta) {
  const st = window._stxPagerState[id];
  if (!st) return;
  st.page = Math.max(1, st.page + delta);
  drawPagedBody(id);
}

function drawPagedBody(id) {
  const opts = window._stxPagerConfigs[id];
  const state = window._stxPagerState[id];
  const bodyEl = document.getElementById(id + '_body');
  const pagerEl = document.getElementById(id + '_pager');
  if (!opts || !bodyEl || !pagerEl) return;

  const perPage = opts.perPage || 15;
  const q = (state.q || '').trim().toUpperCase();
  const filtered = q
    ? opts.items.filter((item) => {
        const hay = opts.getSearchText ? opts.getSearchText(item) : JSON.stringify(item);
        return String(hay || '').toUpperCase().includes(q);
      })
    : opts.items;

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * perPage;
  const slice = filtered.slice(start, start + perPage);

  if (opts.mode === 'list') {
    bodyEl.innerHTML = `<div class="list-menu kbd-list">${
      slice.length ? slice.map((item, idx) => opts.renderRow(item, start + idx, idx)).join('') : (opts.emptyHtml || '<p style="color:#64748b; font-size:13px;">Koi record nahi mila</p>')
    }</div>`;
  } else {
    bodyEl.innerHTML = `
      <div style="overflow-x:auto;">
        <table>
          <thead>${opts.headHtml || ''}</thead>
          <tbody ${opts.tbodyId ? `id="${opts.tbodyId}"` : ''}>
            ${slice.length ? slice.map((item, idx) => opts.renderRow(item, start + idx, idx)).join('') : (opts.emptyHtml || '<tr><td colspan="10">Koi record nahi mila</td></tr>')}
          </tbody>
        </table>
      </div>
    `;
  }

  pagerEl.innerHTML = `
    <div>Total: <b>${filtered.length}</b> | Page <b>${state.page}</b> / <b>${totalPages}</b></div>
    <div class="pager-btns">
      <button type="button" class="btn btn-light btn-sm" ${state.page <= 1 ? 'disabled' : ''} onclick="goPagedPage('${id}', -1)">◀️ Prev</button>
      <button type="button" class="btn btn-light btn-sm" ${state.page >= totalPages ? 'disabled' : ''} onclick="goPagedPage('${id}', 1)">Next ▶️</button>
    </div>
  `;
}

// === 4. NAVIGATION & 4-STAGE STOCK DRILLDOWN ===
function getActiveSection() {
  return document.querySelector('.tab-sec:not(.hidden)');
}

function openTab(tabId, btn) {
  document.querySelectorAll('.tab-sec').forEach((s) => s.classList.add('hidden'));
  const sec = document.getElementById(tabId);
  if (sec) sec.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  hideLanSyncToast();
  if (tabId === 'tab-dash') refreshDashboard();
  if (tabId === 'tab-settings') renderSettingsBackupExtras();
  if (typeof window.onTabChanged === 'function') window.onTabChanged(tabId);
}

function openTabByName(tabId) {
  const order = ['tab-dash', 'tab-jobwork', 'tab-inward', 'tab-order', 'tab-barcode', 'tab-challan', 'tab-settings'];
  const idx = order.indexOf(tabId);
  const btns = document.querySelectorAll('.nav-btn');
  openTab(tabId, idx >= 0 ? btns[idx] : null);
}

async function openStockDrilldown(mode) {
  if (mode) stockTabMode = mode;
  openTab('tab-stock-detail', null);
  await openDB();

  const allBunkar = await dbGetAll('bunkarStock');
  const bunkarOnly = allBunkar.filter((b) => b.bunkarName !== JW_POOL_KEY && b.qty > 0);
  const bunkarTotal = bunkarOnly.reduce((s, x) => s + (x.qty || 0), 0);

  const convertedList = (await dbGetAll('convertedStock')).filter((c) => c.qty > 0);
  const convertedTotal = convertedList.reduce((s, x) => s + (x.qty || 0), 0);

  const jwPool = allBunkar.find((b) => b.bunkarName === JW_POOL_KEY);
  const jwPoolQty = jwPool ? jwPool.qty : 0;

  const ready = (await dbGetAll('readyStock')).filter((r) => r.qty > 0);
  const readyTotal = ready.reduce((s, x) => s + (x.qty || 0), 0);

  const rawIn = (typeof dbGetByIndex === 'function')
    ? await dbGetByIndex('jobWorkLedger', 'direction', 'IN')
    : (await dbGetAll('jobWorkLedger')).filter((l) => l.direction === 'IN');
  const jwReturns = rawIn
    .filter((l) => l.jobWorkType !== 'DIRECT_BAITHAK')
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const totalJWWapsiEver = jwReturns.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const btnStyle = (m) => stockTabMode === m
    ? 'background:#0f172a; color:#fff; border:1px solid #0f172a;'
    : 'background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1;';

  const sec = document.getElementById('tab-stock-detail');
  sec.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>Dukan Live Stock Detail</h2>
        <button class="btn btn-light btn-sm" onclick="openTabByName('tab-dash')">← Back (Esc)</button>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <button type="button" class="btn btn-sm" style="${btnStyle('BUNKAR')}" onclick="openStockDrilldown('BUNKAR')">
          🧵 Karigar / Bunkar Stock (${bunkarTotal} Pcs)
        </button>
        <button type="button" class="btn btn-sm" style="${btnStyle('CONVERTED')}" onclick="openStockDrilldown('CONVERTED')">
          🔄 Converted Stock (${convertedTotal} Pcs)
        </button>
        <button type="button" class="btn btn-sm" style="${btnStyle('JW_WAPSI')}" onclick="openStockDrilldown('JW_WAPSI')">
          ↩️ Job Work se Wapsi (${jwReturns.length} | ${totalJWWapsiEver} Pcs)
        </button>
        <button type="button" class="btn btn-sm" style="${btnStyle('BARCODE')}" onclick="openStockDrilldown('BARCODE')">
          🏷️ Ready Barcode (${readyTotal} Pcs)
        </button>
      </div>

      <div id="stockTabContent"></div>
    </div>
  `;

  const content = document.getElementById('stockTabContent');

  if (stockTabMode === 'BUNKAR') {
    content.innerHTML = `<div id="stockBunkarPager"></div>`;
    mountPagedList({
      id: 'stockBunkarPager',
      items: bunkarOnly,
      perPage: 15,
      placeholder: '🔍 Karigar / Bunkar search karein...',
      headHtml: '<tr><th>Karigar / Bunkar Naam (Click for Passbook)</th><th>Available Pcs</th></tr>',
      getSearchText: (b) => b.bunkarName,
      renderRow: (b) => `
        <tr class="stx-row-click" onclick="if(typeof openBunkarPassbook==='function') openBunkarPassbook('${stxEsc(b.bunkarName)}')">
          <td><b style="color:#1d4ed8; text-decoration:underline;">${stxEsc(b.bunkarName)}</b> <small>(Passbook)</small></td>
          <td><b>${b.qty} Pcs</b></td>
        </tr>
      `,
      emptyHtml: '<tr><td colspan="2">Koi Karigar / Bunkar stock nahi hai</td></tr>'
    });
  } else if (stockTabMode === 'CONVERTED') {
    content.innerHTML = `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:700; color:#15803d; margin-bottom:12px;">
        Dukan par Design Name me convert hua stock: <b>${convertedTotal} Pcs</b>
      </div>
      <div id="stockConvertedPager"></div>
    `;
    mountPagedList({
      id: 'stockConvertedPager',
      items: convertedList,
      perPage: 15,
      placeholder: '🔍 Design Name ya Quality search karein...',
      headHtml: '<tr><th>Design / Bikri Name</th><th>Quality / Line</th><th>Available Pcs</th></tr>',
      getSearchText: (c) => `${c.designName} ${c.specLine || ''}`,
      renderRow: (c) => `
        <tr>
          <td><b>${stxEsc(c.designName)}</b></td>
          <td><small>${stxEsc(c.specLine || '-')}</small></td>
          <td><b style="color:#1d4ed8;">${c.qty} Pcs</b></td>
        </tr>
      `,
      emptyHtml: '<tr><td colspan="3">Abhi koi Converted Design stock nahi hai</td></tr>'
    });
  } else if (stockTabMode === 'JW_WAPSI') {
    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { inAllocMap: {} };
    const inAllocMap = analytics.inAllocMap || {};

    content.innerHTML = `
      <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:12px 14px; border-radius:10px; font-weight:700; color:#1e3a8a; margin-bottom:12px; font-size:12.5px;">
        ✅ Job Work se wapas aayi sarees ab <b>Karigar ke naam</b> par hi save hoti hain (jaise KARAN - 10 pcs, ROHAN - 10 pcs).
        ${jwPoolQty > 0 ? `<span style="margin-left:8px; color:#b45309;">| Legacy Pool: ${jwPoolQty} Pcs</span>` : ''}
      </div>
      <div id="stockJWWapsiPager"></div>
    `;
    mountPagedList({
      id: 'stockJWWapsiPager',
      items: jwReturns,
      perPage: 15,
      placeholder: '🔍 Date, Job Work, Worker ya Karigar search karein...',
      headHtml: '<tr><th>Date</th><th>Job Work & Worker</th><th>Karigar Breakdown</th><th>Wapas OK / Dmg</th><th>Note</th></tr>',
      getSearchText: (l) => {
        const allocs = (inAllocMap[l.id] || []).map((a) => `${a.bunkarName} ${a.qty}`).join(' ');
        return `${l.date} ${l.jobWorkType} ${l.workerName} ${allocs} ${l.note || ''}`;
      },
      renderRow: (l) => {
        const allocs = inAllocMap[l.id] || [];
        const allocTxt = allocs.length
          ? allocs.map((a) => `<b>${stxEsc(a.bunkarName === JW_POOL_KEY ? 'POOL' : a.bunkarName)}</b> - ${a.qty} pcs`).join(', ')
          : '-';
        const dmg = Number(l.damageQty) || 0;
        return `
          <tr>
            <td style="white-space:nowrap;">${stxEsc(l.date)}</td>
            <td><b>${stxEsc(l.jobWorkType)}</b><br/><small style="color:#64748b;">${stxEsc(l.workerName)}</small></td>
            <td><small>${allocTxt}</small></td>
            <td><b style="color:#15803d;">+${l.qty} Pcs</b>${dmg > 0 ? `<br/><small style="color:#dc2626; font-weight:700;">Dmg: ${dmg}</small>` : ''}</td>
            <td><small>${stxEsc(l.note || '-')}</small></td>
          </tr>
        `;
      },
      emptyHtml: '<tr><td colspan="5">Abhi Job Work se koi wapsi entry nahi hui</td></tr>'
    });
  } else if (stockTabMode === 'BARCODE') {
    content.innerHTML = `<div id="stockReadyPager"></div>`;
    mountPagedList({
      id: 'stockReadyPager',
      items: ready,
      perPage: 15,
      placeholder: '🔍 Design Name, Firm Code ya Quality search karein...',
      headHtml: '<tr><th>Design & Firm</th><th>Quality / Line</th><th>Available Pcs</th></tr>',
      getSearchText: (r) => `${r.designName} ${r.firmCode} ${r.specLine || ''}`,
      renderRow: (r) => `
        <tr>
          <td><b>${stxEsc(r.designName)} (${stxEsc(r.firmCode)})</b></td>
          <td><small>${stxEsc(r.specLine || '-')}</small></td>
          <td><b style="color:#15803d;">${r.qty} Pcs</b></td>
        </tr>
      `,
      emptyHtml: '<tr><td colspan="3">Abhi koi Ready Barcoded stock nahi hai</td></tr>'
    });
  }
}

// === 4B. PENDING REPORTS (ORDERS + KARIGAR) & 6-FIELD PARTY MASTER ===
function computeOrderStatusFallback(order, allChallans) {
  if (typeof window.stxComputeOrderStatus === 'function') {
    return window.stxComputeOrderStatus(order, allChallans);
  }
  const ordNo = String(order.orderNo);
  const ordParty = String(order.partyName || '').trim().toUpperCase();
  const linked = (allChallans || []).filter(
    (c) => String(c.orderNo || '') === ordNo && (!c.partyName || String(c.partyName).trim().toUpperCase() === ordParty)
  );
  const sentMap = {};
  linked.forEach((c) => (c.items || []).forEach((it) => {
    const k = String(it.designName || '').trim().toUpperCase();
    sentMap[k] = (sentMap[k] || 0) + (Number(it.qty) || 0);
  }));
  let totalOrdered = 0, totalPending = 0;
  const items = (order.items || []).map((it) => {
    const k = String(it.name || '').trim().toUpperCase();
    const oq = Number(it.qty) || 0;
    const used = Math.min(oq, sentMap[k] || 0);
    sentMap[k] = Math.max(0, (sentMap[k] || 0) - used);
    const pq = Math.max(0, oq - used);
    totalOrdered += oq;
    totalPending += pq;
    return { name: it.name, orderedQty: oq, sentQty: used, pendingQty: pq };
  });
  const isComplete = !!order.forceClosed || ((order.items || []).length > 0 && totalPending === 0);
  return { totalOrdered, totalSent: totalOrdered - totalPending, totalPending, isComplete, items };
}

function ensureDynamicSection(id) {
  let sec = document.getElementById(id);
  if (!sec) {
    const main = document.querySelector('main.container');
    if (!main) return null;
    sec = document.createElement('section');
    sec.id = id;
    sec.className = 'tab-sec hidden';
    main.appendChild(sec);
  }
  return sec;
}

async function openPendingReports(mode) {
  if (mode) reportTabMode = mode;
  const sec = ensureDynamicSection('tab-reports');
  if (!sec) return;
  openTab('tab-reports', null);
  await openDB();

  const orders = (await dbGetAll('orders')).sort((a, b) => b.id - a.id);
  const challans = await dbGetAll('challans');
  const challansByOrd = {};
  challans.forEach((c) => {
    if (!c.orderNo) return;
    const k = String(c.orderNo);
    if (!challansByOrd[k]) challansByOrd[k] = [];
    challansByOrd[k].push(c);
  });

  const pendingOrders = [];
  let totalPendingOrdPcs = 0;
  orders.forEach((o) => {
    const st = computeOrderStatusFallback(o, challansByOrd[String(o.orderNo)] || []);
    if (!st.isComplete) {
      pendingOrders.push({ order: o, status: st });
      totalPendingOrdPcs += st.totalPending;
    }
  });

  const pendingJW = (await dbGetAll('jobWorkPending')).filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty);
  const totalPendingJWPcs = pendingJW.reduce((s, x) => s + (x.qty || 0), 0);

  const btnStyle = (m) => reportTabMode === m
    ? 'background:#0f172a; color:#fff; border:1px solid #0f172a;'
    : 'background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1;';

  sec.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>📊 Pending Summary Reports</h2>
        <div>
          <button class="btn btn-dark btn-sm" onclick="window.print()">🖨️ Print List</button>
          <button class="btn btn-light btn-sm" onclick="openTabByName('tab-dash')">← Back (Esc)</button>
        </div>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <button type="button" class="btn btn-sm" style="${btnStyle('ORDERS')}" onclick="openPendingReports('ORDERS')">
          ⏳ Pending Orders (${pendingOrders.length} | ${totalPendingOrdPcs} Pcs)
        </button>
        <button type="button" class="btn btn-sm" style="${btnStyle('KARIGAR')}" onclick="openPendingReports('KARIGAR')">
          🧵 Karigar Pending (${pendingJW.length} | ${totalPendingJWPcs} Pcs)
        </button>
      </div>

      <div id="pendingReportPager"></div>
    </div>
  `;

  if (reportTabMode === 'ORDERS') {
    mountPagedList({
      id: 'pendingReportPager',
      items: pendingOrders,
      perPage: 15,
      placeholder: '🔍 Party, City, Agent, Order No. ya Design search karein...',
      headHtml: '<tr><th>Order #</th><th>Date</th><th>Party & City</th><th>Agent</th><th>Baki Saree Detail</th><th>Total Baki</th></tr>',
      getSearchText: (r) => `${r.order.orderNo} ${r.order.date} ${r.order.partyName} ${r.order.partyCity || ''} ${r.order.agent || ''} ${(r.status.items || []).map((i) => i.name).join(' ')}`,
      renderRow: (r) => {
        const o = r.order;
        const bakiList = r.status.items.filter((i) => i.pendingQty > 0).map((i) => `${stxEsc(i.name)}: <b>${i.pendingQty}</b>/${i.orderedQty}`).join(', ');
        return `
          <tr>
            <td><b>#${stxEsc(o.orderNo)}</b></td>
            <td style="white-space:nowrap;">${stxEsc(o.date)}</td>
            <td><b>${stxEsc(o.partyName)}</b><br/><small>${stxEsc(o.partyCity || '')}</small></td>
            <td><small>${stxEsc(o.agent || '-')}</small></td>
            <td><small>${bakiList}</small></td>
            <td><b style="color:#b45309;">${r.status.totalPending} Pcs</b></td>
          </tr>
        `;
      },
      emptyHtml: '<tr><td colspan="6">🎉 Sabhi Orders complete ho chuke hain!</td></tr>'
    });
  } else {
    const workers = await dbGetAll('jobWorkers');
    mountPagedList({
      id: 'pendingReportPager',
      items: pendingJW,
      perPage: 15,
      placeholder: '🔍 Karigar naam ya Job Work type search karein...',
      headHtml: '<tr><th>Karigar / Worker</th><th>Kaam (Job Work)</th><th>Mobile / City</th><th>Pending Pcs</th></tr>',
      getSearchText: (p) => `${p.workerName} ${p.jobWorkType}`,
      renderRow: (p) => {
        const w = workers.find((x) => x.name.toUpperCase() === String(p.workerName || '').toUpperCase());
        return `
          <tr>
            <td><b>${stxEsc(p.workerName)}</b></td>
            <td>${stxEsc(p.jobWorkType)}</td>
            <td><small>${stxEsc(w?.phone || '-')} ${stxEsc(w?.city || '')}</small></td>
            <td><b style="color:#dc2626;">${p.qty} Pcs</b></td>
          </tr>
        `;
      },
      emptyHtml: '<tr><td colspan="4">🎉 Kisi bhi karigar par koi maal pending nahi hai!</td></tr>'
    });
  }
}

// === PARTY MASTER (Exact 6 Fields: Name, Mob, GSTIN, Address, City, Agent) ===
async function openPartyMaster() {
  const sec = ensureDynamicSection('tab-parties');
  if (!sec) return;
  openTab('tab-parties', null);
  await openDB();

  const parties = (await dbGetAll('parties')).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  sec.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>👥 Party Master (${parties.length} Parties)</h2>
        <div>
          <button class="btn btn-dark btn-sm" onclick="openPartyModal()">+ Nayi Party</button>
          <button class="btn btn-light btn-sm" onclick="openTabByName('tab-dash')">← Back (Esc)</button>
        </div>
      </div>
      <div id="partyMasterPager"></div>
    </div>
  `;

  mountPagedList({
    id: 'partyMasterPager',
    items: parties,
    perPage: 15,
    placeholder: '🔍 Party naam, Mob, GSTIN, Address, City ya Agent search karein...',
    headHtml: '<tr><th>Name & Mob</th><th>GSTIN</th><th>Address & City</th><th>Agent</th><th>Action</th></tr>',
    getSearchText: (p) => `${p.name} ${p.phone || ''} ${p.gstin || ''} ${p.address || ''} ${p.city || ''} ${p.agent || ''}`,
    renderRow: (p) => `
      <tr class="stx-row-click" onclick="openPartyModal(${p.id})">
        <td><b>${stxEsc(p.name)}</b>${p.phone ? `<br/><small>📞 ${stxEsc(p.phone)}</small>` : ''}</td>
        <td><small>${stxEsc(p.gstin || '-')}</small></td>
        <td><small>${stxEsc(p.address || '-')}${p.city ? `<br/><b>${stxEsc(p.city)}</b>` : ''}</small></td>
        <td><small><b>${stxEsc(p.agent || '-')}</b></small></td>
        <td style="white-space:nowrap;" onclick="event.stopPropagation()">
          <button class="btn btn-light btn-sm" onclick="openPartyModal(${p.id})">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deletePartyById(${p.id})">🗑️</button>
        </td>
      </tr>
    `,
    emptyHtml: '<tr><td colspan="5">Abhi koi Party add nahi hai</td></tr>'
  });
}

async function openPartyModal(id) {
  const p = id ? await dbGet('parties', id) : null;
  stxOpenModal({
    title: p ? '✏️ Party Edit Karein' : '+ Nayi Party Add Karein',
    bodyHtml: `
      <div class="grid-2" style="align-items:start;">
        <div><label>1. Name *</label><input id="pmName" value="${stxEsc(p?.name || '')}" placeholder="e.g. SHREE SHARDA SAREE" /></div>
        <div><label>2. Mob. No.</label><input id="pmPhone" type="tel" value="${stxEsc(p?.phone || '')}" placeholder="98xxxxxxxx" /></div>
        <div><label>3. GSTIN</label><input id="pmGstin" value="${stxEsc(p?.gstin || '')}" placeholder="e.g. 27AA..." /></div>
        <div><label>4. Address</label><input id="pmAddr" value="${stxEsc(p?.address || '')}" placeholder="Shop / Market address..." /></div>
        <div><label>5. City *</label><input id="pmCity" value="${stxEsc(p?.city || '')}" placeholder="e.g. CHIPLOON" /></div>
        <div><label>6. Agent</label><input id="pmAgent" value="${stxEsc(p?.agent || '')}" placeholder="e.g. RAJESH JI" /></div>
      </div>
    `,
    buttons: [
      { label: 'Cancel', className: 'btn btn-light', onClick: () => stxCloseModal() },
      {
        label: p ? '✅ Update Party' : '✅ Save Party',
        className: 'btn btn-success',
        onClick: async () => {
          const name = document.getElementById('pmName').value.trim().toUpperCase();
          const phone = document.getElementById('pmPhone').value.trim();
          const gstin = document.getElementById('pmGstin').value.trim().toUpperCase();
          const address = document.getElementById('pmAddr').value.trim().toUpperCase();
          const city = document.getElementById('pmCity').value.trim().toUpperCase();
          const agent = document.getElementById('pmAgent').value.trim().toUpperCase();

          if (!name) return stxToast('Party Name zaroori hai!', 'warn');
          const payload = {
            name,
            phone,
            gstin,
            address: address || city,
            city,
            agent,
            marka: p?.marka || '',
            transport: p?.transport || ''
          };
          if (p && p.id) payload.id = p.id;
          await dbPut('parties', payload);
          stxCloseModal();
          stxToast('✅ Party save ho gayi!', 'success');
          openPartyMaster();
        }
      }
    ]
  });
}

async function deletePartyById(id) {
  const p = await dbGet('parties', id);
  if (!p) return;
  stxConfirmDelete({
    title: '⚠️ Party Delete Karein?',
    detailsHtml: `<b>Party:</b> ${stxEsc(p.name)}<br/><b>City:</b> ${stxEsc(p.city || '-')} &nbsp;|&nbsp; <b>Mob:</b> ${stxEsc(p.phone || '-')}`,
    onConfirm: async () => {
      await dbDelete('parties', id);
      stxToast('Party delete ho gayi', 'info');
      openPartyMaster();
    }
  });
}

// === 5. TALLY KEYBOARD ENGINE ===
function moveListSelection(listEl, dir) {
  const rows = Array.from(listEl.querySelectorAll('.list-row'));
  if (!rows.length) return;
  let idx = rows.findIndex((r) => r.classList.contains('kbd-active'));
  if (idx < 0) idx = 0;
  else {
    rows[idx].classList.remove('kbd-active');
    idx = (idx + dir + rows.length) % rows.length;
  }
  rows[idx].classList.add('kbd-active');
  rows[idx].scrollIntoView({ block: 'nearest' });
}

function getFormFieldsInSection(sec) {
  return Array.from(sec.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), button.primary-save-btn:not([disabled])'))
    .filter((el) => el.offsetParent !== null);
}

function focusNextField(currentEl) {
  const sec = getActiveSection();
  if (!sec) return;
  const fields = getFormFieldsInSection(sec);
  const idx = fields.indexOf(currentEl);
  if (idx >= 0 && idx + 1 < fields.length) {
    fields[idx + 1].focus();
    try { if (fields[idx + 1].select) fields[idx + 1].select(); } catch (_) {}
  }
}

function focusPrevField(currentEl) {
  const sec = getActiveSection();
  if (!sec) return;
  const fields = getFormFieldsInSection(sec);
  const idx = fields.indexOf(currentEl);
  if (idx > 0) {
    fields[idx - 1].focus();
    try { if (fields[idx - 1].select) fields[idx - 1].select(); } catch (_) {}
  }
}

document.addEventListener('keydown', (e) => {
  const loader = document.getElementById('stxTallyLoader');
  if (loader && !loader.classList.contains('hidden')) return;
  if (!document.getElementById('lockScreen').classList.contains('hidden')) return;

  if (e.key === 'Escape' && document.getElementById('stxModalBackdrop')) {
    e.preventDefault();
    stxCloseModal();
    return;
  }

  if (e.altKey) {
    const map = { '0':'tab-dash', '1':'tab-jobwork', '2':'tab-inward', '3':'tab-order', '4':'tab-barcode', '5':'tab-challan', '7':'tab-settings' };
    if (e.key === '6') { e.preventDefault(); openStockDrilldown('BUNKAR'); return; }
    if (e.key === '8' && document.getElementById('tab-daybook')) { e.preventDefault(); openTab('tab-daybook', document.getElementById('navBtnDaybook')); return; }
    if (e.key === '9') { e.preventDefault(); openPendingReports('ORDERS'); return; }
    if (map[e.key]) { e.preventDefault(); openTabByName(map[e.key]); return; }
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const sec = getActiveSection();
    const saveBtn = sec ? sec.querySelector('.primary-save-btn') : null;
    if (saveBtn) saveBtn.click();
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    if (typeof window.handleModuleEscape === 'function' && window.handleModuleEscape()) return;
    openTabByName('tab-dash');
    return;
  }

  const el = document.activeElement;
  const tag = el ? el.tagName : '';
  const isTyping = (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA');
  const sec = getActiveSection();
  if (!sec) return;

  if (e.key === 'Enter' && e.shiftKey && (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON')) {
    e.preventDefault();
    focusPrevField(el);
    return;
  }

  if (e.key === 'Backspace') {
    if (tag === 'SELECT' || tag === 'BUTTON') {
      e.preventDefault();
      focusPrevField(el);
      return;
    }
    if (tag === 'INPUT' && el.dataset.noBack !== '1') {
      const isEmpty = (el.value === '');
      let atStart = false;
      try { atStart = (el.selectionStart === 0 && el.selectionEnd === 0); } catch (_) {}
      if (isEmpty || atStart) {
        e.preventDefault();
        focusPrevField(el);
        return;
      }
    }
  }

  if (e.key === 'Enter' && (tag === 'INPUT' || tag === 'SELECT')) {
    if (el.dataset.customEnter === '1') return;
    e.preventDefault();
    focusNextField(el);
    return;
  }

  const visibleList = Array.from(sec.querySelectorAll('.kbd-list')).find((l) => l.offsetParent !== null);
  if (visibleList && !isTyping) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveListSelection(visibleList, 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveListSelection(visibleList, -1); return; }
    if (e.key === 'Enter') {
      const active = visibleList.querySelector('.list-row.kbd-active');
      if (active) { e.preventDefault(); active.click(); return; }
    }
    if (/^[0-9]$/.test(e.key)) {
      const target = visibleList.querySelector(`.list-row[data-key="${e.key}"]`);
      if (target) { e.preventDefault(); target.click(); return; }
    }
  }
});

// === 6. MULTI-FIRM SETTINGS ===
async function saveFirm() {
  try {
    const name = document.getElementById('firmName').value.trim();
    const shortCode = document.getElementById('firmCode').value.trim().toUpperCase();
    const phone = document.getElementById('firmPhone').value.trim();
    const gstin = document.getElementById('firmGst').value.trim().toUpperCase();
    const address = document.getElementById('firmAddress').value.trim();
    if (!name || !shortCode) return stxToast('Firm Name aur Short Code zaroori hai!', 'warn');
    await dbPut('firms', { name, shortCode, phone, gstin, address });
    ['firmName','firmCode','firmPhone','firmGst','firmAddress'].forEach((id) => document.getElementById(id).value = '');
    await loadFirms();
    stxToast('✅ Firm save ho gayi!', 'success');
  } catch (err) { stxRecordError(err.message, 'saveFirm'); }
}

async function deleteFirm(id) {
  const f = await dbGet('firms', id);
  if (!f) return;
  stxConfirmDelete({
    title: '⚠️ Firm Delete Karein?',
    detailsHtml: `<b>Firm:</b> ${stxEsc(f.name)} (${stxEsc(f.shortCode)})`,
    onConfirm: async () => {
      await dbDelete('firms', id);
      await loadFirms();
      stxToast('Firm delete ho gayi', 'info');
    }
  });
}

async function loadFirms() {
  const firms = await dbGetAll('firms');
  const tbody = document.getElementById('firmTableBody');
  if (tbody) {
    tbody.innerHTML = firms.map((f) => `
      <tr>
        <td><b>${stxEsc(f.name)}</b><br/><small>${stxEsc(f.address || '')}</small></td>
        <td><b>${stxEsc(f.shortCode)}</b></td>
        <td>${stxEsc(f.phone || '-')}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteFirm(${f.id})">🗑️ Delete</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4">Abhi koi firm add nahi hai</td></tr>';
  }

  const lbl = document.getElementById('activeFirmLabel');
  if (lbl) {
    lbl.textContent = firms.length ? firms.map((f) => f.shortCode).join(' / ') + ' — Saree ERP' : 'Settings me Firm add karein';
  }
  return firms;
}

// === 7. BACKUP, STOCK AUDIT SYNC, YEAR CLOSING & 4-CARD PRO DASHBOARD ===
async function downloadBackup() {
  const json = await exportFullBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SimpliTex-Backup-${getTodayYMD()}.json`;
  a.click();
  localStorage.setItem('simplitex_last_backup_ms', String(Date.now()));
  renderSettingsBackupExtras();
  stxToast('⬇️ Backup download ho gaya!', 'success');
}

async function handleRestore(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    await restoreFullBackup(await file.text());
    stxToast('✅ Backup Restore ho gaya!', 'success');
    initApp();
  } catch (err) { stxRecordError(err.message, 'restore'); }
}

async function runManualStockSync() {
  try {
    if (typeof window.stxRecalculateAllStock === 'function') {
      await window.stxRecalculateAllStock();
    }
    await refreshDashboard();
    stxToast('✅ Stock Audit & Sync Complete!', 'success');
  } catch (err) {
    stxRecordError(err.message, 'stockSync');
  }
}

function renderSettingsBackupExtras() {
  const sec = document.getElementById('tab-settings');
  if (!sec) return;
  let host = document.getElementById('stxBackupExtras');
  if (!host) {
    const cards = sec.querySelectorAll('.card');
    const backupCard = cards[1] || cards[0];
    if (!backupCard) return;
    host = document.createElement('div');
    host.id = 'stxBackupExtras';
    host.style.marginTop = '12px';
    backupCard.appendChild(host);
  }

  const lastMs = Number(localStorage.getItem('simplitex_last_backup_ms') || 0);
  let statusHtml = '';
  if (!lastMs) {
    statusHtml = '<span style="color:#dc2626; font-weight:700;">⚠️ Abhi tak ek baar bhi Backup nahi liya gaya hai!</span>';
  } else {
    const daysAgo = Math.floor((Date.now() - lastMs) / 86400000);
    const dStr = new Date(lastMs).toLocaleDateString('en-IN');
    statusHtml = daysAgo > 7
      ? `<span style="color:#d97706; font-weight:700;">⚠️ Last Backup: ${dStr} (${daysAgo} din pehle) — Naya Backup le lein!</span>`
      : `<span style="color:#16a34a; font-weight:700;">✅ Last Backup: ${dStr} (${daysAgo === 0 ? 'Aaj' : daysAgo + ' din pehle'})</span>`;
  }

  let lanBoxHtml = '';
  if (typeof window.stxIsLanMode === 'function' && window.stxIsLanMode()) {
    const info = window.STX_LAN_INFO || {};
    const ips = Array.isArray(info.hostIps) && info.hostIps.length ? info.hostIps : [];
    const port = info.port || 3000;
    const linksText = ips.length
      ? ips.map((ip) => `<b>http://${ip}:${port}</b>`).join(' ya ')
      : `<b>${window.location.origin}</b>`;
    lanBoxHtml = `
      <div style="background:#eff6ff; border:1px solid #93c5fd; padding:10px 12px; border-radius:8px; margin-bottom:10px; font-size:12.5px; color:#1e3a8a;">
        <b>🖥️ Multi-PC LAN Sharing ON hai!</b><br/>
        Dukan ke baaki computers par Chrome kholkar ye link daalein: ${linksText}
      </div>
    `;
  }

  host.innerHTML = `
    ${lanBoxHtml}
    <div style="font-size:12.5px; margin-bottom:10px;">${statusHtml}</div>
    <div style="border-top:1px dashed #cbd5e1; padding-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="btn btn-dark btn-sm" onclick="runManualStockSync()">
        🔄 Stock Audit & Sync
      </button>
      <button type="button" class="btn btn-light btn-sm" onclick="startYearClosing()">
        🗓️ Year Closing (Backup + New Year)
      </button>
    </div>
  `;
}

async function startYearClosing() {
  if (!confirm('🗓️ Kya aap Naya Saal (Year Closing) shuru karna chahte hain?\nPehle aapka poora Backup (.json) download hoga, phir Live Stock Opening Balance ban kar save rahega aur purane Bills/Ledger saaf honge.')) return;
  const check = prompt('Confirm karne ke liye "CLOSE" likhein:');
  if (!check || check.trim().toUpperCase() !== 'CLOSE') return stxToast('Year Closing cancel kar diya gaya', 'info');

  try {
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    await downloadBackup();

    const openingSnapshot = {
      bunkarStock: (await dbGetAll('bunkarStock')).filter((b) => b.qty > 0),
      convertedStock: (await dbGetAll('convertedStock')).filter((c) => c.qty > 0),
      jobWorkPending: (await dbGetAll('jobWorkPending')).filter((p) => p.qty > 0),
      readyStock: (await dbGetAll('readyStock')).filter((r) => r.qty > 0)
    };
    localStorage.setItem('simplitex_opening_stock', JSON.stringify(openingSnapshot));

    if (typeof clearTransactionStoresForNewYear === 'function') await clearTransactionStoresForNewYear();
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    await refreshDashboard();
    stxToast('✅ Naya Saal Ready hai! Opening Stock safe hai.', 'success', 4000);
  } catch (err) {
    stxRecordError(err.message, 'yearClosing');
  }
}

function ensureDashboardProWidgets() {
  const dash = document.getElementById('tab-dash');
  if (!dash) return;

  if (!document.getElementById('stxDashKpis')) {
    const kpi = document.createElement('div');
    kpi.id = 'stxDashKpis';
    kpi.className = 'stx-kpi-grid';
    kpi.innerHTML = `
      <div class="stx-kpi-card" onclick="openStockDrilldown('BUNKAR')">
        <div class="stx-kpi-label">📦 Total Stock</div>
        <div class="stx-kpi-val" id="kpiStockTotal">0 Pcs</div>
        <div class="stx-kpi-sub" id="kpiStockSub">Karigar: 0 | Conv: 0 | Ready: 0</div>
      </div>
      <div class="stx-kpi-card" onclick="openPendingReports('KARIGAR')">
        <div class="stx-kpi-label">🧵 Karigar Pending</div>
        <div class="stx-kpi-val" id="kpiJWTotal" style="color:#dc2626;">0 Pcs</div>
        <div class="stx-kpi-sub" id="kpiJWSub">0 Karigar par baki</div>
      </div>
      <div class="stx-kpi-card" onclick="openPendingReports('ORDERS')">
        <div class="stx-kpi-label">⏳ Pending Orders</div>
        <div class="stx-kpi-val" id="kpiOrdPending" style="color:#d97706;">0</div>
        <div class="stx-kpi-sub" id="kpiOrdSub">0 Pcs bhejna baki</div>
      </div>
      <div class="stx-kpi-card" onclick="openTabByName('tab-challan')">
        <div class="stx-kpi-label">🚚 Aaj ke Challans</div>
        <div class="stx-kpi-val" id="kpiTodayChallan" style="color:#16a34a;">₹0</div>
        <div class="stx-kpi-sub" id="kpiTodaySub">0 Bills | 0 Pcs</div>
      </div>
    `;
    const hero = dash.querySelector('.hero-stock');
    if (hero) hero.insertAdjacentElement('afterend', kpi);
    else dash.prepend(kpi);
  }

  const gw = document.getElementById('gatewayMenu');
  if (gw) {
    if (!document.getElementById('gwReportsRow')) {
      const r1 = document.createElement('div');
      r1.id = 'gwReportsRow';
      r1.className = 'list-row';
      r1.dataset.key = '9';
      r1.onclick = () => openPendingReports('ORDERS');
      r1.innerHTML = '<span>9. Pending Reports (Orders & Karigar)</span><span class="badge">Key: 9</span>';
      gw.appendChild(r1);
    }
    if (!document.getElementById('gwPartiesRow')) {
      const r2 = document.createElement('div');
      r2.id = 'gwPartiesRow';
      r2.className = 'list-row';
      r2.dataset.key = '0';
      r2.onclick = () => openPartyMaster();
      r2.innerHTML = '<span>0. Party Master (Manage & Edit Parties)</span><span class="badge">Key: 0</span>';
      gw.appendChild(r2);
    }
  }
}

async function refreshDashboard() {
  await openDB();
  ensureDashboardProWidgets();

  const bunkarAll = await dbGetAll('bunkarStock');
  const convertedAll = await dbGetAll('convertedStock');
  const pending = (await dbGetAll('jobWorkPending')).filter((p) => p.qty > 0);
  const ready = await dbGetAll('readyStock');
  const orders = await dbGetAll('orders');
  const challans = await dbGetAll('challans');

  const unbarcodedTotal = bunkarAll.reduce((s, x) => s + (x.qty || 0), 0);
  const convertedTotal = convertedAll.reduce((s, x) => s + (x.qty || 0), 0);
  const readyTotal = ready.reduce((s, x) => s + (x.qty || 0), 0);
  const grandTotal = unbarcodedTotal + convertedTotal + readyTotal;
  const pendingJWTotal = pending.reduce((s, x) => s + (x.qty || 0), 0);

  document.getElementById('statTotalStock').textContent = grandTotal;
  document.getElementById('statPendingJW').textContent = pendingJWTotal;
  document.getElementById('statReadyStock').textContent = readyTotal;
  document.getElementById('statChallans').textContent = challans.length;

  const chByOrd = {};
  challans.forEach((c) => {
    if (!c.orderNo) return;
    const k = String(c.orderNo);
    if (!chByOrd[k]) chByOrd[k] = [];
    chByOrd[k].push(c);
  });
  let pendOrdCount = 0;
  let pendOrdPcs = 0;
  orders.forEach((o) => {
    const st = computeOrderStatusFallback(o, chByOrd[String(o.orderNo)] || []);
    if (!st.isComplete) {
      pendOrdCount++;
      pendOrdPcs += st.totalPending;
    }
  });

  const today = stxTodayISO();
  const todayChallans = challans.filter((c) => c.date === today);
  const todayPcs = todayChallans.reduce((s, c) => s + (Number(c.totalPcs) || 0), 0);
  const todayAmt = todayChallans.reduce((s, c) => s + (Number(c.totalAmount) || 0), 0);

  const elKpiStock = document.getElementById('kpiStockTotal');
  if (elKpiStock) {
    elKpiStock.textContent = `${grandTotal} Pcs`;
    document.getElementById('kpiStockSub').textContent = `Karigar: ${unbarcodedTotal} | Conv: ${convertedTotal} | Ready: ${readyTotal}`;
    document.getElementById('kpiJWTotal').textContent = `${pendingJWTotal} Pcs`;
    document.getElementById('kpiJWSub').textContent = `${pending.length} Karigar par baki`;
    document.getElementById('kpiOrdPending').textContent = `${pendOrdCount} Orders`;
    document.getElementById('kpiOrdSub').textContent = `${pendOrdPcs} Pcs bhejna baki`;
    document.getElementById('kpiTodayChallan').textContent = `₹${todayAmt.toLocaleString('en-IN')}`;
    document.getElementById('kpiTodaySub').textContent = `${todayChallans.length} Bills | ${todayPcs} Pcs`;
  }
}

function updateNetBadge() {
  const el = document.getElementById('netStatus');
  if (!el) return;
  if (typeof window.stxIsLanMode === 'function' && window.stxIsLanMode()) {
    el.textContent = '🟢 LAN Live (Multi-PC)';
    el.style.background = '#dcfce7';
    el.style.color = '#166534';
  } else {
    el.textContent = navigator.onLine ? 'Online + Offline' : 'Offline Mode';
    el.style.background = '';
    el.style.color = '';
  }
}
window.addEventListener('online', updateNetBadge);
window.addEventListener('offline', updateNetBadge);

// === 8. LIVE MULTI-PC SYNC LISTENER ===
function showLanSyncToast() {
  let toast = document.getElementById('stxLanSyncToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'stxLanSyncToast';
    toast.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:9990',
      'background:#0f172a', 'color:#fff', 'border:1px solid #334155',
      'padding:10px 14px', 'border-radius:10px', 'box-shadow:0 10px 25px rgba(0,0,0,0.3)',
      'display:flex', 'align-items:center', 'gap:10px', 'font-size:12.5px', 'font-weight:600'
    ].join(';');
    toast.innerHTML = `
      <span>🔄 Dusre PC par naya data save hua hai</span>
      <button type="button" class="btn btn-success btn-sm" onclick="refreshActiveTabAfterLanSync()">Refresh Tab</button>
      <button type="button" class="btn btn-light btn-sm" onclick="hideLanSyncToast()">✕</button>
    `;
    document.body.appendChild(toast);
  }
  toast.style.display = 'flex';
}

function hideLanSyncToast() {
  const toast = document.getElementById('stxLanSyncToast');
  if (toast) toast.style.display = 'none';
}

function refreshActiveTabAfterLanSync() {
  hideLanSyncToast();
  const sec = getActiveSection();
  if (!sec) return;
  if (sec.id === 'tab-dash') refreshDashboard();
  else if (sec.id === 'tab-stock-detail') openStockDrilldown();
  else if (sec.id === 'tab-reports') openPendingReports();
  else if (sec.id === 'tab-parties') openPartyMaster();
  else if (sec.id === 'tab-settings') { loadFirms(); renderSettingsBackupExtras(); }
  else if (typeof window.onTabChanged === 'function') window.onTabChanged(sec.id);
}

window.addEventListener('stx-lan-sync', async (ev) => {
  try {
    const stores = (ev && ev.detail && Array.isArray(ev.detail.stores)) ? ev.detail.stores : [];
    if (stores.includes('_meta')) {
      const lockVisible = !document.getElementById('lockScreen').classList.contains('hidden');
      if (lockVisible && checkLicense()) {
        document.getElementById('lockScreen').classList.add('hidden');
        initApp();
        return;
      }
    }
    if (stores.includes('firms')) await loadFirms();
    await refreshDashboard();

    const sec = getActiveSection();
    if (!sec) return;
    if (sec.id === 'tab-stock-detail') await openStockDrilldown();
    else if (sec.id === 'tab-reports') await openPendingReports();
    else if (sec.id === 'tab-parties') await openPartyMaster();
    else if (sec.id === 'tab-daybook' && typeof window.onTabChanged === 'function') window.onTabChanged('tab-daybook');
    else if (sec.id === 'tab-settings') renderSettingsBackupExtras();
    else if (sec.id !== 'tab-dash') showLanSyncToast();
  } catch (_) {}
});

async function manageServiceWorkerForMode() {
  if (!('serviceWorker' in navigator)) return;
  try {
    if (typeof window.stxIsLanMode === 'function' && window.stxIsLanMode()) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    } else {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch (_) {}
}

async function initApp() {
  try {
    showTallyLoader('SimpliTex ERP', 'Connecting Database...', 15);
    if (window.stxLanReady) await window.stxLanReady;
    await manageServiceWorkerForMode();
    updateNetBadge();

    setTallyLoader('SimpliTex ERP', 'Checking License...', 25);
    if (!checkLicense()) {
      hideTallyLoader(true);
      return;
    }

    setTallyLoader(null, 'Opening Company Database...', 45);
    await openDB();
    await sleepMs(80);

    setTallyLoader(null, 'Loading Company & Masters...', 65);
    const firms = await loadFirms();
    const companyTitle = firms.length
      ? 'Company: ' + firms.map((f) => f.name).join(' / ')
      : 'SimpliTex Saree Wholesale ERP';

    setTallyLoader(companyTitle, 'Verifying & Syncing Live Stock...', 85);
    if (typeof window.stxRecalculateAllStock === 'function') {
      await window.stxRecalculateAllStock();
    }
    await sleepMs(80);

    await refreshDashboard();
    renderSettingsBackupExtras();

    setTallyLoader(companyTitle, 'Company Loaded — Ready!', 100);
    await sleepMs(180);
    hideTallyLoader(false);
  } catch (err) {
    hideTallyLoader(true);
    stxRecordError(err.message, 'initApp');
  }
}

window.addEventListener('DOMContentLoaded', initApp);
