// === SimpliTex Module 1 (Job Work Outward - Batch) & Module 2 (Stock Inward - Simple) ===

let jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [] };
let inState = { step: 'MENU', jwType: '', worker: null };

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Tab khulte hi clean Step 1 dikhana
window.onTabChanged = function (tabId) {
  if (tabId === 'tab-jobwork') {
    jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [] };
    renderJWOutward();
  } else if (tabId === 'tab-inward') {
    inState = { step: 'MENU', jwType: '', worker: null };
    renderStockInward();
  }
};

// Tally-style Esc Key (1 Step Peeche)
window.handleModuleEscape = function () {
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (!sec) return false;

  if (sec.id === 'tab-jobwork') {
    if (jwState.step === 'BATCH') { jwState.step = 'WORKER'; jwState.worker = null; renderJWOutward(); return true; }
    if (jwState.step === 'WORKER') { jwState.step = 'TYPE'; jwState.jwType = ''; renderJWOutward(); return true; }
  }
  if (sec.id === 'tab-inward') {
    if (inState.step === 'JW_RETURN') { inState.step = 'JW_WORKER'; inState.worker = null; renderStockInward(); return true; }
    if (inState.step === 'JW_WORKER') { inState.step = 'JW_TYPE'; inState.jwType = ''; renderStockInward(); return true; }
    if (inState.step === 'DIRECT' || inState.step === 'JW_TYPE') { inState.step = 'MENU'; renderStockInward(); return true; }
  }
  return false;
};

// ==========================================
// MODULE 1: JOB WORK OUTWARD (3-Step Batch)
// ==========================================
async function renderJWOutward() {
  await openDB();
  const box = document.getElementById('tab-jobwork');

  // STEP 1: JOB WORK TYPE CHUNEIN
  if (jwState.step === 'TYPE') {
    const types = await dbGetAll('jobWorkTypes');
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>1. Job Work Outward — Kaam Chunein</h2>
          <button class="btn btn-dark btn-sm" onclick="addJobWorkTypePrompt('out')">+ Naya Job Work</button>
        </div>
        <div class="list-menu kbd-list">
          ${types.map((t, i) => `
            <div class="list-row ${i === 0 ? 'kbd-active' : ''}" data-key="${i + 1}"
                 onclick="pickOutJWType('${esc(t.name)}')">
              <span>${i + 1}. ${esc(t.name)}</span>
              <span class="badge">Enter →</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return;
  }

  // STEP 2: US KAAM KE WORKERS KI LIST
  if (jwState.step === 'WORKER') {
    const allWorkers = await dbGetAll('jobWorkers');
    const workers = allWorkers.filter((w) => !w.jobWorkType || w.jobWorkType.toUpperCase() === jwState.jwType.toUpperCase());
    const pendList = await dbGetAll('jobWorkPending');

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${esc(jwState.jwType)} — Worker Chunein</h2>
          <div>
            <button class="btn btn-success btn-sm" onclick="showAddWorkerModal('out')">+ Naya Worker</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        <div id="addWorkerInlineOut" class="hidden" style="background:#f9fafb; border:1px solid #d1d5db; padding:12px; border-radius:8px; margin-bottom:12px;">
          <div class="grid-2">
            <div><label>Worker Naam *</label><input id="newWNameOut" placeholder="e.g. Raju Calender" /></div>
            <div><label>Mobile No.</label><input id="newWPhoneOut" type="tel" placeholder="9839xxxxxx" /></div>
          </div>
          <div style="margin-top:8px;"><label>Address</label><input id="newWAddrOut" placeholder="Mau" /></div>
          <button class="btn btn-dark btn-sm" style="margin-top:8px;" onclick="saveNewWorker('out')">Save Worker</button>
        </div>
        <div class="list-menu kbd-list">
          ${workers.length ? workers.map((w, i) => {
            const p = pendList.find((x) => x.id === `${w.name}__${jwState.jwType.toUpperCase()}`);
            const pQty = p ? p.qty : 0;
            return `
              <div class="list-row ${i === 0 ? 'kbd-active' : ''}" data-key="${i + 1}" onclick="pickOutWorker(${w.id})">
                <span>${i + 1}. ${esc(w.name)} <small style="color:#6b7280;">${esc(w.phone || '')}</small></span>
                <span class="badge">Pending: ${pQty} Pcs</span>
              </div>
            `;
          }).join('') : '<p style="color:#6b7280; font-size:13px;">Abhi koi worker nahi hai. Upar "+ Naya Worker" dabaa kar jodein.</p>'}
        </div>
      </div>
    `;
    return;
  }

  // STEP 3: BATCH FORM (200-500 Pcs Ek Saath)
  if (jwState.step === 'BATCH') {
    const stocks = (await dbGetAll('bunkarStock')).filter((s) => s.qty > 0);
    const totalBatch = jwState.batchRows.reduce((s, r) => s + r.qty, 0);

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${esc(jwState.jwType)} → ${esc(jwState.worker.name)} (Batch Entry)</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div class="grid-2" style="margin-bottom:12px;">
          <div><label>Date</label><input type="date" id="batchDate" value="${todayISO()}" /></div>
          <div><label>Note / Kaam Detail (Optional)</label><input id="batchNote" placeholder="e.g. Heavy finish" /></div>
        </div>

        <!-- Keyboard Fast Entry Row -->
        <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px; border-radius:8px; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:700; color:#1e3a8a; margin-bottom:6px;">
            Batch Me Saree Jodein (Bunkar chunein → Qty likh kar Enter dabayein):
          </div>
          <div class="grid-2">
            <div>
              <label>Saree (Bunkar Stock)</label>
              <input id="batchBunkarInput" list="batchBunkarList" placeholder="Bunkar naam likhein (e.g. FARHAN)" />
              <datalist id="batchBunkarList">
                ${stocks.map((s) => `<option value="${esc(s.bunkarName)}">${esc(s.bunkarName === JW_POOL_KEY ? 'JOB WORK POOL' : s.bunkarName)} (${s.qty} Pcs)</option>`).join('')}
              </datalist>
            </div>
            <div>
              <label>Qty (Pcs) — Enter se Add hoga</label>
              <input type="number" id="batchQtyInput" min="1" placeholder="e.g. 10" data-custom-enter="1"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); addBatchRow(); }" />
            </div>
          </div>
          <button type="button" class="btn btn-dark btn-sm" style="margin-top:8px;" onclick="addBatchRow()">+ Add Line</button>
        </div>

        <table>
          <thead><tr><th>#</th><th>Saree (Bunkar)</th><th>Pcs</th><th>Hataein</th></tr></thead>
          <tbody>
            ${jwState.batchRows.map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><b>${esc(r.bunkarName === JW_POOL_KEY ? 'JOB WORK POOL' : r.bunkarName)}</b></td>
                <td><b>${r.qty}</b></td>
                <td><button class="btn btn-danger btn-sm" onclick="removeBatchRow(${i})">X</button></td>
              </tr>
            `).join('') || '<tr><td colspan="4" style="color:#6b7280;">Abhi batch khali hai... upar se saree add karein</td></tr>'}
          </tbody>
        </table>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:14px;">
          <div style="font-size:18px; font-weight:800;">Total Batch: <span style="color:#1d4ed8;">${totalBatch} Pcs</span></div>
          <button type="button" class="btn btn-success primary-save-btn" onclick="saveBatchOutward()">
            ✅ Save Batch (Ctrl+S)
          </button>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('batchBunkarInput')?.focus(), 50);
  }
}

function pickOutJWType(name) { jwState.jwType = name; jwState.step = 'WORKER'; renderJWOutward(); }
async function pickOutWorker(id) {
  jwState.worker = await dbGet('jobWorkers', id);
  jwState.batchRows = [];
  jwState.step = 'BATCH';
  renderJWOutward();
}

function showAddWorkerModal(mode) {
  const el = document.getElementById(mode === 'out' ? 'addWorkerInlineOut' : 'addWorkerInlineIn');
  el.classList.toggle('hidden');
  const inp = document.getElementById(mode === 'out' ? 'newWNameOut' : 'newWNameIn');
  if (!el.classList.contains('hidden')) inp.focus();
}

async function saveNewWorker(mode) {
  const pfx = mode === 'out' ? 'Out' : 'In';
  const name = document.getElementById('newWName' + pfx).value.trim().toUpperCase();
  const phone = document.getElementById('newWPhone' + pfx).value.trim();
  const address = document.getElementById('newWAddr' + pfx).value.trim();
  const jwType = mode === 'out' ? jwState.jwType : inState.jwType;
  if (!name) return alert('Worker ka naam zaroori hai!');
  await dbPut('jobWorkers', { name, phone, address, jobWorkType: jwType.toUpperCase() });
  mode === 'out' ? renderJWOutward() : renderStockInward();
}

async function addJobWorkTypePrompt(mode) {
  const name = prompt('Naye Job Work ka naam likhein (e.g. Dying, Cutting, Stone):');
  if (!name || !name.trim()) return;
  await dbPut('jobWorkTypes', { name: name.trim() });
  mode === 'out' ? renderJWOutward() : renderStockInward();
}

async function addBatchRow() {
  const bInput = document.getElementById('batchBunkarInput');
  const qInput = document.getElementById('batchQtyInput');
  const bunkarName = bInput.value.trim().toUpperCase();
  const qty = parseInt(qInput.value, 10);

  if (!bunkarName) { bInput.focus(); return alert('Bunkar ka naam daalein!'); }
  if (!qty || qty <= 0) { qInput.focus(); return alert('Sahi Pcs daalein!'); }

  const st = await dbGet('bunkarStock', bunkarName);
  const avail = st ? st.qty : 0;
  const alreadyAdded = jwState.batchRows.filter((r) => r.bunkarName === bunkarName).reduce((s, r) => s + r.qty, 0);

  if (alreadyAdded + qty > avail) {
    return alert(`Dukan me ${bunkarName} ki sirf ${avail} saree hai (abhi tak ${alreadyAdded} add ho chuki)!`);
  }

  jwState.batchRows.push({ bunkarName, qty });
  bInput.value = '';
  qInput.value = '';
  await renderJWOutward();
}

function removeBatchRow(idx) {
  jwState.batchRows.splice(idx, 1);
  renderJWOutward();
}

async function saveBatchOutward() {
  if (!jwState.batchRows.length) return alert('Batch khali hai! Kam se kam 1 saree add karein.');
  const date = document.getElementById('batchDate').value || todayISO();
  const note = document.getElementById('batchNote').value.trim();
  const jwTypeUpper = jwState.jwType.toUpperCase();
  const workerName = jwState.worker.name.toUpperCase();

  let totalQty = 0;
  for (const row of jwState.batchRows) {
    const st = await dbGet('bunkarStock', row.bunkarName);
    const avail = st ? st.qty : 0;
    await dbPut('bunkarStock', { bunkarName: row.bunkarName, qty: Math.max(0, avail - row.qty), updatedAt: new Date().toISOString() });
    totalQty += row.qty;
  }

  // Worker ke khate me Total Pending add (+)
  const pendId = `${workerName}__${jwTypeUpper}`;
  const curPend = await dbGet('jobWorkPending', pendId);
  await dbPut('jobWorkPending', {
    id: pendId, workerName, jobWorkType: jwTypeUpper, qty: (curPend ? curPend.qty : 0) + totalQty
  });

  // Ledger me Batch Save
  await dbPut('jobWorkLedger', {
    direction: 'OUT', jobWorkType: jwTypeUpper, workerName,
    qty: totalQty, batchItems: jwState.batchRows, date, note, createdAt: Date.now()
  });

  alert(`📤 ${workerName} (${jwTypeUpper}) ko Total ${totalQty} Pcs Batch bhej diya gaya!`);
  jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [] };
  await refreshDashboard();
  renderJWOutward();
}

// ==========================================
// MODULE 2: STOCK INWARD (Simple, No Batch)
// ==========================================
async function renderStockInward() {
  await openDB();
  const box = document.getElementById('tab-inward');

  // STEP 1: 2 SEEDHE RASTE
  if (inState.step === 'MENU') {
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>2. Stock Inward — Maal Kahan se Aaya?</h2>
          <span class="shortcut-hint">Key 1 ya 2 dabayein</span>
        </div>
        <div class="list-menu kbd-list">
          <div class="list-row kbd-active" data-key="1" onclick="inState.step='DIRECT'; renderStockInward();">
            <span>1. Direct Baithak se Aayi (Bunkar ke Naam se)</span>
            <span class="badge">Key: 1</span>
          </div>
          <div class="list-row" data-key="2" onclick="inState.step='JW_TYPE'; renderStockInward();">
            <span>2. Job Work se Wapas Aayi (Total Pcs Entry)</span>
            <span class="badge">Key: 2</span>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // OPTION 1: DIRECT BAITHAK
  if (inState.step === 'DIRECT') {
    const stocks = await dbGetAll('bunkarStock');
    const names = stocks.filter((s) => s.bunkarName !== JW_POOL_KEY);
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>Direct Baithak se Stock Inward</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>
        <div class="grid-2">
          <div><label>Date</label><input type="date" id="dirDate" value="${todayISO()}" /></div>
          <div>
            <label>Saree (Bunkar ka Naam) *</label>
            <input id="dirBunkar" list="dirBunkarList" placeholder="e.g. FARHAN" />
            <datalist id="dirBunkarList">${names.map((n) => `<option value="${esc(n.bunkarName)}">`).join('')}</datalist>
          </div>
          <div><label>Quantity (Pcs) *</label><input type="number" id="dirQty" min="1" placeholder="e.g. 50" /></div>
          <div>
            <label>Note (Optional)</label>
            <input id="dirNote" placeholder="e.g. Kora maal" data-custom-enter="1"
                   onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveDirectInward(); }" />
          </div>
        </div>
        <button class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%;" onclick="saveDirectInward()">
          ✅ Save Direct Inward (Ctrl+S)
        </button>
      </div>
    `;
    setTimeout(() => document.getElementById('dirBunkar')?.focus(), 50);
    return;
  }

  // OPTION 2A: JOB WORK TYPE CHUNEIN
  if (inState.step === 'JW_TYPE') {
    const types = await dbGetAll('jobWorkTypes');
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>Job Work Wapsi — Kaam Chunein</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>
        <div class="list-menu kbd-list">
          ${types.map((t, i) => `
            <div class="list-row ${i === 0 ? 'kbd-active' : ''}" data-key="${i + 1}"
                 onclick="inState.jwType='${esc(t.name)}'; inState.step='JW_WORKER'; renderStockInward();">
              <span>${i + 1}. ${esc(t.name)}</span>
              <span class="badge">Enter →</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return;
  }

  // OPTION 2B: WORKER CHUNEIN (Pending Dikhega)
  if (inState.step === 'JW_WORKER') {
    const allWorkers = await dbGetAll('jobWorkers');
    const workers = allWorkers.filter((w) => !w.jobWorkType || w.jobWorkType.toUpperCase() === inState.jwType.toUpperCase());
    const pendList = await dbGetAll('jobWorkPending');

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${esc(inState.jwType)} Wapsi — Worker Chunein</h2>
          <div>
            <button class="btn btn-success btn-sm" onclick="showAddWorkerModal('in')">+ Naya Worker</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        <div id="addWorkerInlineIn" class="hidden" style="background:#f9fafb; border:1px solid #d1d5db; padding:12px; border-radius:8px; margin-bottom:12px;">
          <div class="grid-2">
            <div><label>Worker Naam *</label><input id="newWNameIn" placeholder="e.g. Raju Calender" /></div>
            <div><label>Mobile No.</label><input id="newWPhoneIn" type="tel" /></div>
          </div>
          <div style="margin-top:8px;"><label>Address</label><input id="newWAddrIn" /></div>
          <button class="btn btn-dark btn-sm" style="margin-top:8px;" onclick="saveNewWorker('in')">Save Worker</button>
        </div>
        <div class="list-menu kbd-list">
          ${workers.length ? workers.map((w, i) => {
            const p = pendList.find((x) => x.id === `${w.name}__${inState.jwType.toUpperCase()}`);
            const pQty = p ? p.qty : 0;
            return `
              <div class="list-row ${i === 0 ? 'kbd-active' : ''}" data-key="${i + 1}" onclick="pickInWorker(${w.id})">
                <span>${i + 1}. ${esc(w.name)}</span>
                <span class="badge" style="color:${pQty > 0 ? '#b91c1c' : '#15803d'};">Pending: ${pQty} Pcs</span>
              </div>
            `;
          }).join('') : '<p style="color:#6b7280; font-size:13px;">Koi worker nahi mila.</p>'}
        </div>
      </div>
    `;
    return;
  }

  // OPTION 2C: SIRF TOTAL WAPAS QTY ENTRY (NO BATCH / NO BUNKAR)
  if (inState.step === 'JW_RETURN') {
    const jwUpper = inState.jwType.toUpperCase();
    const pend = await dbGet('jobWorkPending', `${inState.worker.name.toUpperCase()}__${jwUpper}`);
    const pendQty = pend ? pend.qty : 0;

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${esc(inState.jwType)} → ${esc(inState.worker.name)} (Wapsi)</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; padding:12px; border-radius:8px; margin-bottom:12px; font-size:15px;">
          Is Karigar par Total Pending: <b style="color:#b91c1c;">${pendQty} Pcs</b>
        </div>
        <div class="grid-2">
          <div><label>Date</label><input type="date" id="jwRetDate" value="${todayISO()}" /></div>
          <div>
            <label>Total Kitni Saree Wapas Aayi (Pcs) *</label>
            <input type="number" id="jwRetQty" min="1" value="${pendQty > 0 ? pendQty : ''}" placeholder="e.g. 200" />
          </div>
        </div>
        <div style="margin-top:10px;">
          <label>Note (Optional)</label>
          <input id="jwRetNote" placeholder="e.g. Ok checked" data-custom-enter="1"
                 onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveJWReturnInward(); }" />
        </div>
        <button class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%;" onclick="saveJWReturnInward()">
          ✅ Wapsi Save Karein (Pending - / Stock +)
        </button>
      </div>
    `;
    setTimeout(() => { const el = document.getElementById('jwRetQty'); if (el) { el.focus(); el.select(); } }, 50);
  }
}

async function pickInWorker(id) {
  inState.worker = await dbGet('jobWorkers', id);
  inState.step = 'JW_RETURN';
  renderStockInward();
}

async function saveDirectInward() {
  const date = document.getElementById('dirDate').value || todayISO();
  const bunkarName = document.getElementById('dirBunkar').value.trim().toUpperCase();
  const qty = parseInt(document.getElementById('dirQty').value, 10);
  const note = document.getElementById('dirNote').value.trim();

  if (!bunkarName) return alert('Bunkar ka naam daalein!');
  if (!qty || qty <= 0) return alert('Sahi Pcs daalein!');

  const cur = await dbGet('bunkarStock', bunkarName);
  await dbPut('bunkarStock', { bunkarName, qty: (cur ? cur.qty : 0) + qty, updatedAt: new Date().toISOString() });
  await dbPut('jobWorkLedger', {
    direction: 'IN', jobWorkType: 'DIRECT_BAITHAK', workerName: 'DIRECT BAITHAK',
    bunkarName, qty, date, note, createdAt: Date.now()
  });

  alert(`✅ ${bunkarName} ki ${qty} saree Dukan Stock me jud gayi!`);
  document.getElementById('dirBunkar').value = '';
  document.getElementById('dirQty').value = '';
  document.getElementById('dirNote').value = '';
  document.getElementById('dirBunkar').focus();
  await refreshDashboard();
}

async function saveJWReturnInward() {
  const date = document.getElementById('jwRetDate').value || todayISO();
  const qty = parseInt(document.getElementById('jwRetQty').value, 10);
  const note = document.getElementById('jwRetNote').value.trim();
  const jwUpper = inState.jwType.toUpperCase();
  const workerName = inState.worker.name.toUpperCase();

  if (!qty || qty <= 0) return alert('Sahi Quantity daalein!');

  const pendId = `${workerName}__${jwUpper}`;
  const pend = await dbGet('jobWorkPending', pendId);
  const pendQty = pend ? pend.qty : 0;

  if (qty > pendQty) {
    if (!confirm(`${workerName} par sirf ${pendQty} Pcs pending hai. Phir bhi ${qty} Pcs wapsi enter karna hai?`)) return;
  }

  await dbPut('jobWorkPending', { id: pendId, workerName, jobWorkType: jwUpper, qty: Math.max(0, pendQty - qty) });

  // Returned Stock Pool me Add (+)
  const pool = await dbGet('bunkarStock', JW_POOL_KEY);
  await dbPut('bunkarStock', { bunkarName: JW_POOL_KEY, qty: (pool ? pool.qty : 0) + qty, updatedAt: new Date().toISOString() });

  await dbPut('jobWorkLedger', {
    direction: 'IN', jobWorkType: jwUpper, workerName, qty, date, note, createdAt: Date.now()
  });

  alert(`✅ ${workerName} se ${qty} Pcs wapas aa gayi! (Baki Pending: ${Math.max(0, pendQty - qty)} Pcs)`);
  inState = { step: 'MENU', jwType: '', worker: null };
  await refreshDashboard();
  renderStockInward();
}
