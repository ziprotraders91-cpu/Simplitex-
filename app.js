// === SimpliTex Core App, Tally Keyboard Engine, Lock & Settings ===
const MASTER_SECRET = 'SIMPLITEX_MAU_2026_SECRET';
const JW_POOL_KEY = '__JW_POOL__';

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
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

// 2. License & Anti-Date-Cheat
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

// 3. LocalStorage PIN Auth
function checkPinAuth() {
  const auth = JSON.parse(localStorage.getItem('simplitex_auth') || 'null');
  if (sessionStorage.getItem('simplitex_logged') === '1') return true;
  const pinScreen = document.getElementById('pinScreen');
  const hint = document.getElementById('pinHint');
  if (!auth) {
    hint.textContent = 'Naya Account banayein (Device par save hoga)';
  } else {
    document.getElementById('loginUser').value = auth.username;
    hint.textContent = '4-Digit PIN daal kar Enter dabaye';
  }
  pinScreen.classList.remove('hidden');
  setTimeout(() => {
    const target = auth ? document.getElementById('loginPin') : document.getElementById('loginUser');
    if (target) target.focus();
  }, 100);
  return false;
}

function handlePinLogin() {
  const user = document.getElementById('loginUser').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  if (!user || pin.length < 4) return alert('Username aur 4-digit PIN daalein!');
  const pinHash = makeSignature(user + ':' + pin);
  const saved = JSON.parse(localStorage.getItem('simplitex_auth') || 'null');

  if (!saved) {
    localStorage.setItem('simplitex_auth', JSON.stringify({ username: user, pinHash }));
  } else if (saved.username !== user || saved.pinHash !== pinHash) {
    return alert('Username ya PIN galat hai!');
  }
  sessionStorage.setItem('simplitex_logged', '1');
  document.getElementById('pinScreen').classList.add('hidden');
  initApp();
}

function logoutPin() {
  sessionStorage.removeItem('simplitex_logged');
  location.reload();
}

// 4. Navigation & Stock Drilldown
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
  if (typeof window.onTabChanged === 'function') window.onTabChanged(tabId);
}

function openTabByName(tabId) {
  const order = ['tab-dash', 'tab-jobwork', 'tab-inward', 'tab-order', 'tab-barcode', 'tab-challan', 'tab-settings'];
  const idx = order.indexOf(tabId);
  const btns = document.querySelectorAll('.nav-btn');
  openTab(tabId, idx >= 0 ? btns[idx] : null);
}

async function openStockDrilldown() {
  openTab('tab-stock-detail', null);
  await openDB();
  const allBunkar = await dbGetAll('bunkarStock');
  const bunkarOnly = allBunkar.filter((b) => b.bunkarName !== JW_POOL_KEY && b.qty > 0);
  const jwPool = allBunkar.find((b) => b.bunkarName === JW_POOL_KEY);
  const ready = (await dbGetAll('readyStock')).filter((r) => r.qty > 0);

  document.getElementById('stockDetailBunkarBody').innerHTML = bunkarOnly.map((b) => `
    <tr><td><b>${b.bunkarName}</b></td><td><b>${b.qty} Pcs</b></td></tr>
  `).join('') || '<tr><td colspan="2">Koi Bunkar stock nahi hai</td></tr>';

  document.getElementById('stockDetailJWPool').textContent = jwPool ? jwPool.qty : 0;

  document.getElementById('stockDetailReadyBody').innerHTML = ready.map((r) => `
    <tr><td><b>${r.designName} (${r.firmCode})</b></td><td><b>${r.qty} Pcs</b></td></tr>
  `).join('') || '<tr><td colspan="2">Abhi koi Ready Barcoded stock nahi hai</td></tr>';
}

// 5. TALLY KEYBOARD ENGINE (Zero Mouse Navigation)
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

function focusNextField(currentEl) {
  const sec = getActiveSection();
  if (!sec) return;
  const fields = Array.from(sec.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), button.enter-btn:not([disabled])'))
    .filter((el) => el.offsetParent !== null);
  const idx = fields.indexOf(currentEl);
  if (idx >= 0 && idx + 1 < fields.length) {
    fields[idx + 1].focus();
    if (fields[idx + 1].select) fields[idx + 1].select();
  }
}

document.addEventListener('keydown', (e) => {
  // Agar Lock ya PIN screen khuli ho toh skip
  if (!document.getElementById('lockScreen').classList.contains('hidden')) return;
  if (!document.getElementById('pinScreen').classList.contains('hidden')) return;

  // Global Alt + 0..7 Shortcuts
  if (e.altKey) {
    const map = { '0':'tab-dash', '1':'tab-jobwork', '2':'tab-inward', '3':'tab-order', '4':'tab-barcode', '5':'tab-challan', '7':'tab-settings' };
    if (e.key === '6') { e.preventDefault(); openStockDrilldown(); return; }
    if (map[e.key]) { e.preventDefault(); openTabByName(map[e.key]); return; }
  }

  // Ctrl + S = Save Active Form
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const sec = getActiveSection();
    const saveBtn = sec ? sec.querySelector('.primary-save-btn') : null;
    if (saveBtn) saveBtn.click();
    return;
  }

  // Esc = 1 Step Back (Tally Style)
  if (e.key === 'Escape') {
    e.preventDefault();
    if (typeof window.handleModuleEscape === 'function' && window.handleModuleEscape()) return;
    openTabByName('tab-dash');
    return;
  }

  const tag = document.activeElement ? document.activeElement.tagName : '';
  const isTyping = (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA');
  const sec = getActiveSection();
  if (!sec) return;

  // Enter inside Form Inputs -> Move to Next Field
  if (e.key === 'Enter' && (tag === 'INPUT' || tag === 'SELECT')) {
    if (document.activeElement.dataset.customEnter === '1') return;
    e.preventDefault();
    focusNextField(document.activeElement);
    return;
  }

  // Arrow Up/Down & Enter on Selectable Lists (.kbd-list)
  const visibleList = Array.from(sec.querySelectorAll('.kbd-list')).find((l) => l.offsetParent !== null);
  if (visibleList && !isTyping) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveListSelection(visibleList, 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveListSelection(visibleList, -1); return; }
    if (e.key === 'Enter') {
      const active = visibleList.querySelector('.list-row.kbd-active');
      if (active) { e.preventDefault(); active.click(); return; }
    }
    // Number keys 1..9 quick pick
    if (/^[1-9]$/.test(e.key)) {
      const target = visibleList.querySelector(`.list-row[data-key="${e.key}"]`);
      if (target) { e.preventDefault(); target.click(); return; }
    }
  }
});

// 6. Multi-Firm Settings
async function saveFirm() {
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
}

// 7. Backup & Dashboard
async function downloadBackup() {
  const json = await exportFullBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SimpliTex-Backup-${getTodayYMD()}.json`;
  a.click();
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

async function refreshDashboard() {
  await openDB();
  const bunkarAll = await dbGetAll('bunkarStock');
  const pending = await dbGetAll('jobWorkPending');
  const ready = await dbGetAll('readyStock');
  const challans = await dbGetAll('challans');

  const unbarcodedTotal = bunkarAll.reduce((s, x) => s + (x.qty || 0), 0);
  const readyTotal = ready.reduce((s, x) => s + (x.qty || 0), 0);

  document.getElementById('statTotalStock').textContent = unbarcodedTotal + readyTotal;
  document.getElementById('statPendingJW').textContent = pending.reduce((s, x) => s + (x.qty || 0), 0);
  document.getElementById('statReadyStock').textContent = readyTotal;
  document.getElementById('statChallans').textContent = challans.length;
}

function updateNetBadge() {
  document.getElementById('netStatus').textContent = navigator.onLine ? 'Online + Offline' : 'Offline Mode';
}
window.addEventListener('online', updateNetBadge);
window.addEventListener('offline', updateNetBadge);

async function initApp() {
  updateNetBadge();
  if (!checkLicense()) return;
  if (!checkPinAuth()) return;
  await openDB();
  await loadFirms();
  await refreshDashboard();
}

window.addEventListener('DOMContentLoaded', initApp);
