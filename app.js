// === SimpliTex Core App v5 (Tally Loader + 4-Stage Stock Drilldown + Auto Stock Audit + Year Closing) ===
const MASTER_SECRET = 'SIMPLITEX_MAU_2026_SECRET';
const JW_POOL_KEY = '__JW_POOL__';
let stockTabMode = 'BUNKAR'; // 'BUNKAR' | 'CONVERTED' | 'JW_WAPSI' | 'BARCODE'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// 0. TALLY-STYLE COMPANY LOADING SCREEN
function ensureTallyLoader() {
  let el = document.getElementById('stxTallyLoader');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'stxTallyLoader';
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:#0b0d12', 'color:#f9fafb',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:20px', 'font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
    'transition:opacity 0.28s ease'
  ].join(';');

  el.innerHTML = `
    <div style="width:100%; max-width:400px; background:#111827; border:1px solid #374151; border-radius:14px; padding:26px 22px; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.6);">
      <img src="./icon-192.png" alt="SimpliTex" style="width:64px; height:64px; border-radius:14px; margin-bottom:10px; border:1px solid #374151;" />
      <div style="font-size:22px; font-weight:800; letter-spacing:0.5px;">SimpliTex ERP</div>
      <div id="stxLoadCompany" style="font-size:13px; color:#fbbf24; font-weight:700; margin-top:4px; min-height:18px;">
        Loading Company...
      </div>

      <div style="background:#1f2937; border-radius:999px; height:10px; overflow:hidden; margin:18px 0 8px; border:1px solid #374151;">
        <div id="stxLoadBar" style="width:10%; height:100%; background:linear-gradient(90deg,#22c55e,#4ade80); transition:width 0.25s ease;"></div>
      </div>

      <div style="display:flex; justify-content:space-between; font-size:12px; color:#9ca3af;">
        <span id="stxLoadMsg">Starting SimpliTex...</span>
        <b id="stxLoadPct" style="color:#f9fafb;">10%</b>
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
  }, 280);
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (document.body) {
  showTallyLoader('Initializing Company...', 'Starting SimpliTex...', 10);
}

// 1. Pure JS Signature (100% Offline)
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

function getTodayYMD() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function addDaysYMD(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// 2. License & Anti-Date-Cheat (Payment Lock)
function getOrCreateLicense() {
  let lic = JSON.parse(localStorage.getItem('simplitex_license') || 'null');
  if (!lic) {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    lic = { deviceId: 'STX-' + rand, expiryYMD: addDaysYMD(15), lastSeenMs: Date.now() };
    localStorage.setItem('simplitex_license', JSON.stringify(lic));
  }
  return lic;
}

function checkLicense() {
  const lic = getOrCreateLicense();
  const now = Date.now();
  const today = getTodayYMD();

  if (now < lic.lastSeenMs - 3600000) {
    showLockScreen(lic.deviceId, 'Device ki Date/Time galat hai! Sahi karein ya Unlock Code daalein.');
    return false;
  }
  lic.lastSeenMs = now;
  localStorage.setItem('simplitex_license', JSON.stringify(lic));

  if (today > lic.expiryYMD) {
    showLockScreen(lic.deviceId, 'Monthly Plan khatam ho gaya hai. Admin se Unlock Code lein.');
    return false;
  }

  document.getElementById('expiryPill').textContent = 'Valid: ' + lic.expiryYMD;
  document.getElementById('settingsDeviceId').textContent = lic.deviceId;
  document.getElementById('settingsExpiry').textContent = lic.expiryYMD;
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
  if (parts.length !== 2 || parts[0].length !== 8) return alert('Format: YYYYMMDD-XXXXXX');
  const [ymdStr, sig] = parts;
  const expected = makeSignature(lic.deviceId + '|' + ymdStr);
  const ymdNum = parseInt(ymdStr, 10);

  if (sig !== expected || isNaN(ymdNum) || ymdNum < getTodayYMD()) {
    return alert('Invalid ya Expired Code!');
  }
  lic.expiryYMD = ymdNum;
  lic.lastSeenMs = Date.now();
  localStorage.setItem('simplitex_license', JSON.stringify(lic));
  document.getElementById('lockScreen').classList.add('hidden');
  alert('Unlocked! Valid till: ' + ymdNum);
  initApp();
}

// 3. UNIVERSAL SEARCH & 15-ROW PAGINATION ENGINE
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
      slice.length ? slice.map((item, idx) => opts.renderRow(item, start + idx, idx)).join('') : (opts.emptyHtml || '<p style="color:#6b7280; font-size:13px;">Koi record nahi mila</p>')
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

// 4. Navigation & 4-Stage Stock Drilldown
function getActiveSection() {
  return document.querySelector('.tab-sec:not(.hidden)');
}

function openTab(tabId, btn) {
  document.querySelectorAll('.tab-sec').forEach((s) => s.classList.add('hidden'));
  const sec = document.getElementById(tabId);
  if (sec) sec.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

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

  const btnStyle = (m) => stockTabMode === m
    ? 'background:#0b0d12; color:#fff; border:1px solid #0b0d12;'
    : 'background:#f3f4f6; color:#111827; border:1px solid #d1d5db;';

  const sec = document.getElementById('tab-stock-detail');
  sec.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>Dukan Live Stock Detail</h2>
        <button class="btn btn-light btn-sm" onclick="openTabByName('tab-dash')">← Back (Esc)</button>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        <button type="button" class="btn btn-sm" style="${btnStyle('BUNKAR')}" onclick="openStockDrilldown('BUNKAR')">
          🧵 Bunkar Stock (${bunkarTotal} Pcs)
        </button>
        <button type="button" class="btn btn-sm" style="${btnStyle('CONVERTED')}" onclick="openStockDrilldown('CONVERTED')">
          🔄 Converted Stock (${convertedTotal} Pcs)
        </button>
        <button type="button" class="btn btn-sm" style="${btnStyle('JW_WAPSI')}" onclick="openStockDrilldown('JW_WAPSI')">
          ↩️ Job Work se Wapsi (${jwPoolQty} Pcs)
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
      placeholder: '🔍 Bunkar search karein...',
      headHtml: '<tr><th>Bunkar / Saree Naam (Click for Passbook)</th><th>Available Pcs</th></tr>',
      getSearchText: (b) => b.bunkarName,
      renderRow: (b) => `
        <tr style="cursor:pointer;" onclick="if(typeof openBunkarPassbook==='function') openBunkarPassbook('${b.bunkarName}')">
          <td><b style="color:#1d4ed8; text-decoration:underline;">${b.bunkarName}</b> <small>(Passbook)</small></td>
          <td><b>${b.qty} Pcs</b></td>
        </tr>
      `,
      emptyHtml: '<tr><td colspan="2">Koi Bunkar stock nahi hai</td></tr>'
    });
  } else if (stockTabMode === 'CONVERTED') {
    content.innerHTML = `
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:700; color:#15803d; margin-bottom:12px;">
        Dukan par Design Name me convert hua stock (Manual Barcoding & Challan ke liye ready ho sakta hai): <b>${convertedTotal} Pcs</b>
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
          <td><b>${c.designName}</b></td>
          <td><small>${c.specLine || '-'}</small></td>
          <td><b style="color:#1d4ed8;">${c.qty} Pcs</b></td>
        </tr>
      `,
      emptyHtml: '<tr><td colspan="3">Abhi koi Converted Design stock nahi hai</td></tr>'
    });
  } else if (stockTabMode === 'JW_WAPSI') {
    const rawIn = (typeof dbGetByIndex === 'function')
      ? await dbGetByIndex('jobWorkLedger', 'direction', 'IN')
      : (await dbGetAll('jobWorkLedger')).filter((l) => l.direction === 'IN');

    const jwReturns = rawIn
      .filter((l) => l.jobWorkType !== 'DIRECT_BAITHAK')
      .sort((a, b) => b.createdAt - a.createdAt);

    content.innerHTML = `
      <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:12px 14px; border-radius:8px; font-weight:700; color:#1e3a8a; margin-bottom:12px;">
        Available Job Work se Wapas Pool (Stock Convert / Next Work ke liye): <span style="font-size:18px;">${jwPoolQty} Pcs</span>
      </div>
      <div id="stockJWWapsiPager"></div>
    `;
    mountPagedList({
      id: 'stockJWWapsiPager',
      items: jwReturns,
      perPage: 15,
      placeholder: '🔍 Date, Job Work ya Worker search karein...',
      headHtml: '<tr><th>Date</th><th>Job Work</th><th>Worker Name</th><th>Wapas Pcs</th><th>Note</th></tr>',
      getSearchText: (l) => `${l.date} ${l.jobWorkType} ${l.workerName} ${l.note || ''}`,
      renderRow: (l) => `
        <tr>
          <td style="white-space:nowrap;">${l.date}</td>
          <td><b>${l.jobWorkType}</b></td>
          <td><b>${l.workerName}</b></td>
          <td><b style="color:#15803d;">+${l.qty} Pcs</b></td>
          <td><small>${l.note || '-'}</small></td>
        </tr>
      `,
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
          <td><b>${r.designName} (${r.firmCode})</b></td>
          <td><small>${r.specLine || '-'}</small></td>
          <td><b style="color:#15803d;">${r.qty} Pcs</b></td>
        </tr>
      `,
      emptyHtml: '<tr><td colspan="3">Abhi koi Ready Barcoded stock nahi hai</td></tr>'
    });
  }
}

// 5. TALLY KEYBOARD ENGINE
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

  if (e.altKey) {
    const map = { '0':'tab-dash', '1':'tab-jobwork', '2':'tab-inward', '3':'tab-order', '4':'tab-barcode', '5':'tab-challan', '7':'tab-settings' };
    if (e.key === '6') { e.preventDefault(); openStockDrilldown('BUNKAR'); return; }
    if (e.key === '8' && document.getElementById('tab-daybook')) { e.preventDefault(); openTab('tab-daybook', document.getElementById('navBtnDaybook')); return; }
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
    if (/^[1-9]$/.test(e.key)) {
      const target = visibleList.querySelector(`.list-row[data-key="${e.key}"]`);
      if (target) { e.preventDefault(); target.click(); return; }
    }
  }
});

// 6. Multi-Firm Settings
async function saveFirm() {
  try {
    const name = document.getElementById('firmName').value.trim();
    const shortCode = document.getElementById('firmCode').value.trim().toUpperCase();
    const phone = document.getElementById('firmPhone').value.trim();
    const gstin = document.getElementById('firmGst').value.trim().toUpperCase();
    const address = document.getElementById('firmAddress').value.trim();
    if (!name || !shortCode) return alert('Firm Name aur Short Code zaroori hai!');
    await dbPut('firms', { name, shortCode, phone, gstin, address });
    ['firmName','firmCode','firmPhone','firmGst','firmAddress'].forEach((id) => document.getElementById(id).value = '');
    await loadFirms();
    alert('Firm save ho gayi!');
  } catch (err) { alert('Save Error: ' + err.message); }
}

async function deleteFirm(id) {
  if (!confirm('Is Firm ko hatana hai?')) return;
  await dbDelete('firms', id);
  await loadFirms();
}

async function loadFirms() {
  const firms = await dbGetAll('firms');
  document.getElementById('firmTableBody').innerHTML = firms.map((f) => `
    <tr>
      <td><b>${f.name}</b><br/><small>${f.address || ''}</small></td>
      <td><b>${f.shortCode}</b></td>
      <td>${f.phone || '-'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteFirm(${f.id})">Delete</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4">Abhi koi firm add nahi hai</td></tr>';

  document.getElementById('activeFirmLabel').textContent =
    firms.length ? firms.map((f) => f.shortCode).join(' / ') + ' — Saree ERP' : 'Settings me Firm add karein';
  return firms;
}

// 7. Backup, Stock Audit Sync, Year Closing & Dashboard
async function downloadBackup() {
  const json = await exportFullBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SimpliTex-Backup-${getTodayYMD()}.json`;
  a.click();
  localStorage.setItem('simplitex_last_backup_ms', String(Date.now()));
  renderSettingsBackupExtras();
}

async function handleRestore(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    await restoreFullBackup(await file.text());
    alert('Backup Restore ho gaya!');
    initApp();
  } catch (err) { alert('Error: ' + err.message); }
}

async function runManualStockSync() {
  try {
    if (typeof window.stxRecalculateAllStock === 'function') {
      await window.stxRecalculateAllStock();
    }
    await refreshDashboard();
    alert('✅ Stock Audit & Sync Complete! Saari entries ginke 100% sahi Live Stock aur Pending update ho gaya hai.');
  } catch (err) {
    alert('Stock Sync Error: ' + err.message);
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
    statusHtml = '<span style="color:#b91c1c; font-weight:700;">⚠️ Abhi tak ek baar bhi Backup nahi liya gaya hai!</span>';
  } else {
    const daysAgo = Math.floor((Date.now() - lastMs) / 86400000);
    const dStr = new Date(lastMs).toLocaleDateString('en-IN');
    statusHtml = daysAgo > 7
      ? `<span style="color:#b45309; font-weight:700;">⚠️ Last Backup: ${dStr} (${daysAgo} din pehle) — Naya Backup le lein!</span>`
      : `<span style="color:#15803d; font-weight:700;">✅ Last Backup: ${dStr} (${daysAgo === 0 ? 'Aaj' : daysAgo + ' din pehle'})</span>`;
  }

  host.innerHTML = `
    <div style="font-size:12.5px; margin-bottom:10px;">${statusHtml}</div>
    <div style="border-top:1px dashed #d1d5db; padding-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="btn btn-dark btn-sm" onclick="runManualStockSync()">
        🔄 Stock Audit & Sync (Hisab Verify Karein)
      </button>
      <button type="button" class="btn btn-light btn-sm" onclick="startYearClosing()">
        🗓️ Year Closing (Backup Le Kar Purane Bills Clear Karein)
      </button>
    </div>
    <div style="font-size:11.5px; color:#6b7280; margin-top:6px;">
      *Year Closing me pehle Backup download hoga, phir aapka Live Stock Opening Balance ban kar save rahega aur sirf purane Bills/Ledger saaf honge.
    </div>
  `;
}

async function startYearClosing() {
  if (!confirm('🗓️ Kya aap Naya Saal (Year Closing) shuru karna chahte hain?\nPehle aapka poora Backup (.json) download hoga, phir aapke Live Stock & Pending ko naye saal ka Opening Stock bana kar purane Bills/Ledger saaf kiye jayenge.')) return;
  const check = prompt('Confirm karne ke liye "CLOSE" likhein:');
  if (!check || check.trim().toUpperCase() !== 'CLOSE') return alert('Year Closing cancel kar diya gaya.');

  try {
    if (typeof window.stxRecalculateAllStock === 'function') {
      await window.stxRecalculateAllStock();
    }
    await downloadBackup();

    const openingSnapshot = {
      bunkarStock: (await dbGetAll('bunkarStock')).filter((b) => b.qty > 0),
      convertedStock: (await dbGetAll('convertedStock')).filter((c) => c.qty > 0),
      jobWorkPending: (await dbGetAll('jobWorkPending')).filter((p) => p.qty > 0),
      readyStock: (await dbGetAll('readyStock')).filter((r) => r.qty > 0)
    };
    localStorage.setItem('simplitex_opening_stock', JSON.stringify(openingSnapshot));

    if (typeof clearTransactionStoresForNewYear === 'function') {
      await clearTransactionStoresForNewYear();
    }
    if (typeof window.stxRecalculateAllStock === 'function') {
      await window.stxRecalculateAllStock();
    }
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    alert('✅ Poora Backup download ho gaya aur Naya Saal ready hai! Live Stock Opening Balance ke roop me bilkul safe hai.');
  } catch (err) {
    alert('Year Closing Error: ' + err.message);
  }
}

async function refreshDashboard() {
  await openDB();
  const bunkarAll = await dbGetAll('bunkarStock');
  const convertedAll = await dbGetAll('convertedStock');
  const pending = await dbGetAll('jobWorkPending');
  const ready = await dbGetAll('readyStock');
  const challansCount = (typeof dbCount === 'function')
    ? await dbCount('challans')
    : (await dbGetAll('challans')).length;

  const unbarcodedTotal = bunkarAll.reduce((s, x) => s + (x.qty || 0), 0);
  const convertedTotal = convertedAll.reduce((s, x) => s + (x.qty || 0), 0);
  const readyTotal = ready.reduce((s, x) => s + (x.qty || 0), 0);

  document.getElementById('statTotalStock').textContent = unbarcodedTotal + convertedTotal + readyTotal;
  document.getElementById('statPendingJW').textContent = pending.reduce((s, x) => s + (x.qty || 0), 0);
  document.getElementById('statReadyStock').textContent = readyTotal;
  document.getElementById('statChallans').textContent = challansCount;
}

function updateNetBadge() {
  document.getElementById('netStatus').textContent = navigator.onLine ? 'Online + Offline' : 'Offline Mode';
}
window.addEventListener('online', updateNetBadge);
window.addEventListener('offline', updateNetBadge);

async function initApp() {
  try {
    showTallyLoader('SimpliTex ERP', 'Checking License...', 15);
    updateNetBadge();
    if (!checkLicense()) {
      hideTallyLoader(true);
      return;
    }

    setTallyLoader(null, 'Opening Company Database...', 40);
    await openDB();
    await sleepMs(100);

    setTallyLoader(null, 'Loading Company & Masters...', 65);
    const firms = await loadFirms();
    const companyTitle = firms.length
      ? 'Company: ' + firms.map((f) => f.name).join(' / ')
      : 'SimpliTex Saree Wholesale ERP';

    setTallyLoader(companyTitle, 'Verifying & Syncing Live Stock...', 85);
    if (typeof window.stxRecalculateAllStock === 'function') {
      await window.stxRecalculateAllStock();
    }
    await sleepMs(100);

    await refreshDashboard();
    renderSettingsBackupExtras();

    setTallyLoader(companyTitle, 'Company Loaded — Ready!', 100);
    await sleepMs(200);
    hideTallyLoader(false);
  } catch (err) {
    hideTallyLoader(true);
    alert('App Loading Error: ' + err.message);
  }
}

window.addEventListener('DOMContentLoaded', initApp);
