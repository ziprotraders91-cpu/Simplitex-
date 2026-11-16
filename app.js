// === SimpliTex Core App, Lock System & Settings ===
// NOTE: Baad me bechte waqt ye SECRET badal dena (sirf tumhe aur admin-keygen ko pata rahega)
const MASTER_SECRET = 'SIMPLITEX_MAU_2026_SECRET';

// 1. Service Worker Register (Offline PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// 2. Pure JS Signature (Bina internet ke har browser me chalta hai)
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

// 3. License & Anti-Date-Cheat Check (LocalStorage)
function getOrCreateLicense() {
  let lic = JSON.parse(localStorage.getItem('simplitex_license') || 'null');
  if (!lic) {
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    lic = {
      deviceId: 'STX-' + rand,
      expiryYMD: addDaysYMD(15), // Pehle 15 din Free Trial testing ke liye
      lastSeenMs: Date.now()
    };
    localStorage.setItem('simplitex_license', JSON.stringify(lic));
  }
  return lic;
}

function checkLicense() {
  const lic = getOrCreateLicense();
  const now = Date.now();
  const today = getTodayYMD();

  // Agar kisi ne PC/Phone ki date peeche ki (1 ghante se zyada piche) -> Lock!
  if (now < lic.lastSeenMs - 3600000) {
    showLockScreen(lic.deviceId, 'Device ki Date/Time galat hai! Sahi karein ya naya Unlock Code daalein.');
    return false;
  }
  lic.lastSeenMs = now;
  localStorage.setItem('simplitex_license', JSON.stringify(lic));

  if (today > lic.expiryYMD) {
    showLockScreen(lic.deviceId, 'Aapka Monthly Plan khatam ho gaya hai. Renewal ke liye Admin se Unlock Code lein.');
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
  if (parts.length !== 2 || parts[0].length !== 8) {
    return alert('Code format galat hai! Sahi format: YYYYMMDD-XXXXXX');
  }
  const [ymdStr, sig] = parts;
  const expected = makeSignature(lic.deviceId + '|' + ymdStr);
  const ymdNum = parseInt(ymdStr, 10);

  if (sig !== expected || isNaN(ymdNum) || ymdNum < getTodayYMD()) {
    return alert('Invalid ya Expired Unlock Code!');
  }

  lic.expiryYMD = ymdNum;
  lic.lastSeenMs = Date.now();
  localStorage.setItem('simplitex_license', JSON.stringify(lic));
  document.getElementById('lockScreen').classList.add('hidden');
  alert('App Unlock ho gaya! Valid till: ' + ymdNum);
  initApp();
}

// 4. LocalStorage Chhota PIN Login
function checkPinAuth() {
  const auth = JSON.parse(localStorage.getItem('simplitex_auth') || 'null');
  if (sessionStorage.getItem('simplitex_logged') === '1') return true;

  const pinScreen = document.getElementById('pinScreen');
  const hint = document.getElementById('pinHint');
  if (!auth) {
    hint.textContent = 'Naya Account banayein (Ye aapke device par save hoga)';
  } else {
    document.getElementById('loginUser').value = auth.username;
    hint.textContent = 'Apna 4-Digit PIN daal kar login karein';
  }
  pinScreen.classList.remove('hidden');
  return false;
}

function handlePinLogin() {
  const user = document.getElementById('loginUser').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  if (!user || pin.length < 4) return alert('Username aur kam se kam 4 digit PIN daalein!');

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

// 5. Tabs Navigation
function openTab(tabId, btn) {
  document.querySelectorAll('.tab-sec').forEach((s) => s.classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function openTabByName(tabId) {
  const idx = ['tab-dash','tab-jobwork','tab-inward','tab-order','tab-barcode','tab-challan','tab-settings'].indexOf(tabId);
  const btns = document.querySelectorAll('.nav-btn');
  openTab(tabId, btns[idx]);
}

// 6. Multi-Firm Settings (Kamran Traders - KT / Indian Fabrics - IF)
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
  const tbody = document.getElementById('firmTableBody');
  tbody.innerHTML = firms.map((f) => `
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

// 7. Backup & Dashboard Stats
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
    const text = await file.text();
    await restoreFullBackup(text);
    alert('Backup Restore ho gaya!');
    initApp();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function refreshDashboard() {
  const bunkar = await dbGetAll('bunkarStock');
  const jwPend = await dbGetAll('jobWorkPending');
  const ready = await dbGetAll('readyStock');
  const challans = await dbGetAll('challans');

  document.getElementById('statBunkarStock').textContent = bunkar.reduce((s, x) => s + (x.qty || 0), 0);
  document.getElementById('statPendingJW').textContent = jwPend.reduce((s, x) => s + (x.qty || 0), 0);
  document.getElementById('statReadyStock').textContent = ready.reduce((s, x) => s + (x.qty || 0), 0);
  document.getElementById('statChallans').textContent = challans.length;
}

// Online/Offline Status Indicator
function updateNetBadge() {
  const el = document.getElementById('netStatus');
  el.textContent = navigator.onLine ? 'Online + Offline Sync' : 'Offline Mode';
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
