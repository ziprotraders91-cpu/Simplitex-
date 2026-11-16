// === SimpliTex Module 1 (Job Work Outward) & Module 2 (Stock Inward) ===

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function renderInwardAndJobWorkHTML() {
  // === MODULE 2: STOCK INWARD ===
  document.getElementById('tab-inward').innerHTML = `
    <div class="card">
      <h2>2. Stock Inward (Dukan Me Saree Aana)</h2>

      <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <button type="button" id="btnInDirect" class="btn btn-dark" onclick="setInwardMode('DIRECT')">
          🏠 Direct Baithak se Aayi
        </button>
        <button type="button" id="btnInJW" class="btn" style="background:#e5e7eb; color:#111;" onclick="setInwardMode('JOBWORK')">
          🧵 Job Work se Wapas Aayi
        </button>
      </div>

      <input type="hidden" id="inwardMode" value="DIRECT" />

      <!-- Job Work Details (Sirf jab Job Work se Wapas aaye) -->
      <div id="inwardJWBox" class="hidden" style="background:#f9fafb; border:1px solid #dce1ea; padding:12px; border-radius:10px; margin-bottom:12px;">
        <div class="grid-2">
          <div>
            <label>Job Work Type *</label>
            <div style="display:flex; gap:6px;">
              <select id="inJWType"></select>
              <button type="button" class="btn btn-dark btn-sm" onclick="addNewJobWorkType()">+ Add</button>
            </div>
          </div>
          <div>
            <label>Saved Job Worker Chunein (Auto-Fill)</label>
            <select id="inWorkerSelect" onchange="onSelectWorker('in')">
              <option value="">-- Naya Job Worker --</option>
            </select>
          </div>
        </div>

        <div class="grid-2" style="margin-top:10px;">
          <div><label>Job Worker ka Naam *</label><input id="inWorkerName" placeholder="e.g. Raju Embroidery" /></div>
          <div><label>Mobile No.</label><input id="inWorkerPhone" type="tel" placeholder="9839xxxxxx" /></div>
        </div>
        <div style="margin-top:10px;">
          <label>Address</label>
          <input id="inWorkerAddr" placeholder="e.g. Mirza Hadi Pura, Mau" />
        </div>
        <div id="inWorkerPendingHint" style="margin-top:8px; font-size:12px; color:#1d4ed8;"></div>
      </div>

      <!-- Common Fields (Bunkar Saree, Qty, Date) -->
      <div class="grid-2">
        <div>
          <label>Date *</label>
          <input type="date" id="inDate" value="${todayISO()}" />
        </div>
        <div>
          <label>Saree Name (Bunkar / Weaver ka Naam) *</label>
          <input id="inBunkarName" list="bunkarDatalist" placeholder="e.g. FARHAN, IMRAN" />
          <datalist id="bunkarDatalist"></datalist>
        </div>
        <div>
          <label>Quantity (Pcs) *</label>
          <input type="number" id="inQty" min="1" placeholder="e.g. 10" />
        </div>
        <div>
          <label>Note / Remarks (Optional)</label>
          <input id="inNote" placeholder="e.g. Kora maal / Finishing ok" />
        </div>
      </div>

      <button type="button" class="btn btn-success" style="margin-top:14px; width:100%;" onclick="saveStockInward()">
        ✅ Stock Inward Save Karein (Dukan Stock +)
      </button>
    </div>

    <div class="card">
      <h2>Dukan ka Live Bunkar Stock (Available)</h2>
      <table>
        <thead><tr><th>Saree (Bunkar Naam)</th><th>Dukan Stock (Pcs)</th></tr></thead>
        <tbody id="bunkarStockTable"></tbody>
      </table>
    </div>

    <div class="card">
      <h2>Recent Stock Inward Entries (Last 20)</h2>
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Date</th><th>Source / Worker</th><th>Mob No.</th><th>Saree (Bunkar)</th><th>Pcs</th></tr></thead>
          <tbody id="inwardHistoryTable"></tbody>
        </table>
      </div>
    </div>
  `;

  // === MODULE 1: JOB WORK OUTWARD ===
  document.getElementById('tab-jobwork').innerHTML = `
    <div class="card">
      <h2>1. Job Work Outward (Dukan se Job Work pe Bhejna)</h2>
      <p style="font-size:12px; color:#6b7280; margin-top:-6px;">
        Sirf dukan ke available Bunkar stock me se hi saree job work pe jayegi.
      </p>

      <div class="grid-2">
        <div>
          <label>Date *</label>
          <input type="date" id="outDate" value="${todayISO()}" />
        </div>
        <div>
          <label>Job Work Type *</label>
          <div style="display:flex; gap:6px;">
            <select id="outJWType"></select>
            <button type="button" class="btn btn-dark btn-sm" onclick="addNewJobWorkType()">+ Add</button>
          </div>
        </div>
      </div>

      <div style="background:#f9fafb; border:1px solid #dce1ea; padding:12px; border-radius:10px; margin:12px 0;">
        <div class="grid-2">
          <div>
            <label>Saved Job Worker Chunein</label>
            <select id="outWorkerSelect" onchange="onSelectWorker('out')">
              <option value="">-- Naya Job Worker --</option>
            </select>
          </div>
          <div><label>Job Worker ka Naam *</label><input id="outWorkerName" placeholder="e.g. Raju Embroidery" /></div>
          <div><label>Mobile No.</label><input id="outWorkerPhone" type="tel" placeholder="9839xxxxxx" /></div>
          <div><label>Address</label><input id="outWorkerAddr" placeholder="e.g. Mau" /></div>
        </div>
      </div>

      <div class="grid-2">
        <div>
          <label>Saree Chunein (Bunkar Stock se) *</label>
          <select id="outBunkarSelect"></select>
        </div>
        <div>
          <label>Quantity (Pcs) *</label>
          <input type="number" id="outQty" min="1" placeholder="Kitni saree bhejni hai" />
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>Note / Design Instruction (Optional)</label>
        <input id="outNote" placeholder="e.g. Heavy border work / 3.60 cm jhalar" />
      </div>

      <button type="button" class="btn btn-dark" style="margin-top:14px; width:100%;" onclick="saveJobWorkOutward()">
        📤 Job Work pe Bhejein (Dukan Stock -)
      </button>
    </div>

    <div class="card">
      <h2>Job Work Pending Report (Kis Karigar ke Paas Kitni Saree Hai)</h2>
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Job Worker</th><th>Kaam</th><th>Saree (Bunkar)</th><th>Pending Pcs</th><th>Action</th></tr></thead>
          <tbody id="jwPendingTable"></tbody>
        </table>
      </div>
    </div>
  `;
}

// Mode Switch (Direct vs Job Work Return)
function setInwardMode(mode) {
  document.getElementById('inwardMode').value = mode;
  const isJW = mode === 'JOBWORK';
  document.getElementById('inwardJWBox').classList.toggle('hidden', !isJW);

  const bDir = document.getElementById('btnInDirect');
  const bJW = document.getElementById('btnInJW');
  bDir.style.background = isJW ? '#e5e7eb' : '#0b0d12';
  bDir.style.color = isJW ? '#111' : '#fff';
  bJW.style.background = isJW ? '#0b0d12' : '#e5e7eb';
  bJW.style.color = isJW ? '#fff' : '#111';
}

// Naya Job Work Type Add Karna (Embroidery, Calender, Jhalar, Swarovski + New)
async function addNewJobWorkType() {
  const name = prompt('Naye Job Work ka naam likhein (e.g. Dying, Stone, Cutting):');
  if (!name || !name.trim()) return;
  const clean = name.trim();
  await dbPut('jobWorkTypes', { name: clean });
  await refreshStockUI();
  document.getElementById('inJWType').value = clean;
  document.getElementById('outJWType').value = clean;
}

// Saved Job Worker Select karne par Mobile & Address Auto-Fill
async function onSelectWorker(prefix) {
  const val = document.getElementById(prefix + 'WorkerSelect').value;
  if (!val) {
    document.getElementById(prefix + 'WorkerName').value = '';
    document.getElementById(prefix + 'WorkerPhone').value = '';
    document.getElementById(prefix + 'WorkerAddr').value = '';
    if (prefix === 'in') document.getElementById('inWorkerPendingHint').innerHTML = '';
    return;
  }
  const w = await dbGet('jobWorkers', Number(val));
  if (!w) return;
  document.getElementById(prefix + 'WorkerName').value = w.name;
  document.getElementById(prefix + 'WorkerPhone').value = w.phone || '';
  document.getElementById(prefix + 'WorkerAddr').value = w.address || '';

  if (prefix === 'in') showPendingHintForWorker(w.name);
}

async function showPendingHintForWorker(workerName) {
  const allPend = await dbGetAll('jobWorkPending');
  const list = allPend.filter((p) => p.workerName === workerName.toUpperCase() && p.qty > 0);
  const hint = document.getElementById('inWorkerPendingHint');
  if (!list.length) {
    hint.innerHTML = 'Is karigar par abhi koi pending nahi hai.';
    return;
  }
  hint.innerHTML = '<b>Pending (Click karein auto-fill ke liye):</b> ' + list.map((p) =>
    `<button type="button" class="btn btn-sm" style="margin:2px; background:#dbeafe; color:#1e3a8a;"
      onclick="quickFillReturn('${esc(p.jobWorkType)}','${esc(p.bunkarName)}',${p.qty})">
      ${esc(p.bunkarName)} (${esc(p.jobWorkType)}: ${p.qty} pcs)
    </button>`
  ).join('');
}

function quickFillReturn(jwType, bunkar, qty) {
  document.getElementById('inJWType').value = jwType;
  document.getElementById('inBunkarName').value = bunkar;
  document.getElementById('inQty').value = qty;
}

// Save or Update Job Worker Master
async function upsertJobWorker(name, phone, address) {
  const upper = name.trim().toUpperCase();
  const all = await dbGetAll('jobWorkers');
  const existing = all.find((w) => w.name.toUpperCase() === upper);
  const record = existing
    ? { ...existing, name: upper, phone: phone.trim() || existing.phone, address: address.trim() || existing.address }
    : { name: upper, phone: phone.trim(), address: address.trim() };
  await dbPut('jobWorkers', record);
  return record;
}

// === SAVE MODULE 2: STOCK INWARD ===
async function saveStockInward() {
  const mode = document.getElementById('inwardMode').value;
  const date = document.getElementById('inDate').value || todayISO();
  const bunkarRaw = document.getElementById('inBunkarName').value.trim().toUpperCase();
  const qty = parseInt(document.getElementById('inQty').value, 10);
  const note = document.getElementById('inNote').value.trim();

  if (!bunkarRaw) return alert('Saree (Bunkar ka naam) daalna zaroori hai!');
  if (!qty || qty <= 0) return alert('Sahi Quantity (Pcs) daalein!');

  let jwType = 'DIRECT_BAITHAK';
  let workerName = 'DIRECT BAITHAK';
  let workerPhone = '-';
  let workerAddr = '-';

  if (mode === 'JOBWORK') {
    jwType = document.getElementById('inJWType').value;
    workerName = document.getElementById('inWorkerName').value.trim().toUpperCase();
    workerPhone = document.getElementById('inWorkerPhone').value.trim();
    workerAddr = document.getElementById('inWorkerAddr').value.trim();

    if (!workerName) return alert('Job Worker ka naam daalein!');
    await upsertJobWorker(workerName, workerPhone, workerAddr);

    // Pending balance update
    const pendId = `${workerName}__${jwType}__${bunkarRaw}`;
    const pend = await dbGet('jobWorkPending', pendId);
    const pendQty = pend ? pend.qty : 0;

    if (qty > pendQty) {
      const ok = confirm(`${workerName} (${jwType}) ke paas ${bunkarRaw} ki sirf ${pendQty} saree pending dikh rahi hai. Phir bhi ${qty} pcs Inward karna hai?`);
      if (!ok) return;
    }
    const newPend = Math.max(0, pendQty - qty);
    await dbPut('jobWorkPending', {
      id: pendId, workerName, jobWorkType: jwType, bunkarName: bunkarRaw, qty: newPend
    });
  }

  // Dukan ke Bunkar Stock me Add (+)
  const curStock = await dbGet('bunkarStock', bunkarRaw);
  const newStockQty = (curStock ? curStock.qty : 0) + qty;
  await dbPut('bunkarStock', {
    bunkarName: bunkarRaw,
    qty: newStockQty,
    updatedAt: new Date().toISOString()
  });

  // Ledger me Save
  await dbPut('jobWorkLedger', {
    direction: 'IN',
    source: mode,
    jobWorkType: jwType,
    workerName,
    workerPhone,
    workerAddress: workerAddr,
    bunkarName: bunkarRaw,
    qty,
    date,
    note,
    createdAt: Date.now()
  });

  document.getElementById('inQty').value = '';
  document.getElementById('inNote').value = '';
  await refreshStockUI();
  if (typeof refreshDashboard === 'function') await refreshDashboard();
  alert(`✅ ${bunkarRaw} ki ${qty} saree Dukan Stock me jud gayi!`);
}

// === SAVE MODULE 1: JOB WORK OUTWARD ===
async function saveJobWorkOutward() {
  const date = document.getElementById('outDate').value || todayISO();
  const jwType = document.getElementById('outJWType').value;
  const workerName = document.getElementById('outWorkerName').value.trim().toUpperCase();
  const workerPhone = document.getElementById('outWorkerPhone').value.trim();
  const workerAddr = document.getElementById('outWorkerAddr').value.trim();
  const bunkarName = document.getElementById('outBunkarSelect').value;
  const qty = parseInt(document.getElementById('outQty').value, 10);
  const note = document.getElementById('outNote').value.trim();

  if (!workerName) return alert('Job Worker ka naam daalein!');
  if (!bunkarName) return alert('Pehle Dukan Stock se Saree (Bunkar) chunein!');
  if (!qty || qty <= 0) return alert('Sahi Quantity daalein!');

  const curStock = await dbGet('bunkarStock', bunkarName);
  const avail = curStock ? curStock.qty : 0;
  if (qty > avail) {
    return alert(`Dukan me ${bunkarName} ki sirf ${avail} saree bachi hai!`);
  }

  await upsertJobWorker(workerName, workerPhone, workerAddr);

  // Dukan Stock se Minus (-)
  await dbPut('bunkarStock', {
    bunkarName,
    qty: avail - qty,
    updatedAt: new Date().toISOString()
  });

  // Pending Job Work me Plus (+)
  const pendId = `${workerName}__${jwType}__${bunkarName}`;
  const pend = await dbGet('jobWorkPending', pendId);
  await dbPut('jobWorkPending', {
    id: pendId,
    workerName,
    jobWorkType: jwType,
    bunkarName,
    qty: (pend ? pend.qty : 0) + qty
  });

  // Ledger me Save
  await dbPut('jobWorkLedger', {
    direction: 'OUT',
    source: 'JOBWORK_OUT',
    jobWorkType: jwType,
    workerName,
    workerPhone,
    workerAddress: workerAddr,
    bunkarName,
    qty,
    date,
    note,
    createdAt: Date.now()
  });

  document.getElementById('outQty').value = '';
  document.getElementById('outNote').value = '';
  await refreshStockUI();
  if (typeof refreshDashboard === 'function') await refreshDashboard();
  alert(`📤 ${bunkarName} ki ${qty} saree ${workerName} (${jwType}) ke paas bhej di gayi!`);
}

// Pending table se 1-click Return pe bhejna
function jumpToReturn(workerName, jwType, bunkarName, qty) {
  openTabByName('tab-inward');
  setInwardMode('JOBWORK');
  document.getElementById('inJWType').value = jwType;
  document.getElementById('inWorkerName').value = workerName;
  document.getElementById('inBunkarName').value = bunkarName;
  document.getElementById('inQty').value = qty;
  dbGetAll('jobWorkers').then((ws) => {
    const w = ws.find((x) => x.name.toUpperCase() === workerName);
    if (w) {
      document.getElementById('inWorkerSelect').value = w.id;
      document.getElementById('inWorkerPhone').value = w.phone || '';
      document.getElementById('inWorkerAddr').value = w.address || '';
    }
  });
}

// === REFRESH DROPDOWNS & TABLES ===
async function refreshStockUI() {
  if (!document.getElementById('inJWType')) return;
  await openDB();

  // 1. Job Work Types
  const types = await dbGetAll('jobWorkTypes');
  const typeOpts = types.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
  document.getElementById('inJWType').innerHTML = typeOpts;
  document.getElementById('outJWType').innerHTML = typeOpts;

  // 2. Saved Job Workers
  const workers = await dbGetAll('jobWorkers');
  const workerOpts = '<option value="">-- Naya Job Worker --</option>' +
    workers.map((w) => `<option value="${w.id}">${esc(w.name)} ${w.phone ? '(' + esc(w.phone) + ')' : ''}</option>`).join('');
  document.getElementById('inWorkerSelect').innerHTML = workerOpts;
  document.getElementById('outWorkerSelect').innerHTML = workerOpts;

  // 3. Bunkar Live Stock
  const stocks = await dbGetAll('bunkarStock');
  document.getElementById('bunkarDatalist').innerHTML = stocks.map((s) => `<option value="${esc(s.bunkarName)}">`).join('');

  const availStocks = stocks.filter((s) => s.qty > 0);
  document.getElementById('bunkarStockTable').innerHTML = availStocks.map((s) => `
    <tr><td><b>${esc(s.bunkarName)}</b></td><td><b>${s.qty} Pcs</b></td></tr>
  `).join('') || '<tr><td colspan="2">Abhi dukan me koi Bunkar stock nahi hai</td></tr>';

  document.getElementById('outBunkarSelect').innerHTML = availStocks.length
    ? availStocks.map((s) => `<option value="${esc(s.bunkarName)}">${esc(s.bunkarName)} (Available: ${s.qty} Pcs)</option>`).join('')
    : '<option value="">-- Dukan me stock 0 hai --</option>';

  // 4. Recent Inward History
  const ledger = await dbGetAll('jobWorkLedger');
  const inwardLogs = ledger.filter((l) => l.direction === 'IN').sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  document.getElementById('inwardHistoryTable').innerHTML = inwardLogs.map((l) => `
    <tr>
      <td>${esc(l.date)}</td>
      <td><b>${esc(l.workerName)}</b><br/><small>${esc(l.jobWorkType === 'DIRECT_BAITHAK' ? 'Direct Baithak' : l.jobWorkType)}</small></td>
      <td>${esc(l.workerPhone || '-')}</td>
      <td><b>${esc(l.bunkarName)}</b></td>
      <td><b>+${l.qty}</b></td>
    </tr>
  `).join('') || '<tr><td colspan="5">Abhi koi Inward entry nahi hui</td></tr>';

  // 5. Pending Job Work Table
  const pending = (await dbGetAll('jobWorkPending')).filter((p) => p.qty > 0);
  document.getElementById('jwPendingTable').innerHTML = pending.map((p) => `
    <tr>
      <td><b>${esc(p.workerName)}</b></td>
      <td>${esc(p.jobWorkType)}</td>
      <td><b>${esc(p.bunkarName)}</b></td>
      <td><b style="color:#b91c1c;">${p.qty} Pcs</b></td>
      <td>
        <button class="btn btn-success btn-sm" onclick="jumpToReturn('${esc(p.workerName)}','${esc(p.jobWorkType)}','${esc(p.bunkarName)}',${p.qty})">
          Wapas Aaya ↩️
        </button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">Kisi Job Worker ke paas koi maal pending nahi hai</td></tr>';
}

window.addEventListener('DOMContentLoaded', () => {
  renderInwardAndJobWorkHTML();
  setTimeout(refreshStockUI, 250);
});

document.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('nav-btn')) {
    refreshStockUI();
  }
});
