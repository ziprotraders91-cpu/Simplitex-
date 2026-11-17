// === SimpliTex Module 1 (Job Work Batch + A5 Bill Print + Passbook) & Module 2 (Stock Inward) ===

const _JW_POOL = (typeof JW_POOL_KEY !== 'undefined') ? JW_POOL_KEY : '__JW_POOL__';
let jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null };
let inState = { step: 'MENU', jwType: '', worker: null, filterDate: '' };

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDMY(iso) {
  if (!iso || !iso.includes('-')) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(-2)}`;
}

function getSavedWorkDetails() {
  try { return JSON.parse(localStorage.getItem('simplitex_jw_work_details') || '[]'); } catch (_) { return []; }
}

function rememberWorkDetail(txt) {
  if (!txt) return;
  const list = getSavedWorkDetails();
  if (!list.includes(txt)) {
    list.unshift(txt);
    localStorage.setItem('simplitex_jw_work_details', JSON.stringify(list.slice(0, 100)));
  }
}

function ensureJWPrintSetup(pageCss) {
  if (!document.getElementById('simplitexPrintRoot')) {
    const div = document.createElement('div');
    div.id = 'simplitexPrintRoot';
    div.style.display = 'none';
    document.body.appendChild(div);
  }
  if (!document.getElementById('simplitexPrintCSS')) {
    const st = document.createElement('style');
    st.id = 'simplitexPrintCSS';
    st.textContent = `
      @media print {
        body > *:not(#simplitexPrintRoot) { display: none !important; }
        #simplitexPrintRoot { display: block !important; width: 100%; background: #fff; color: #000; }
      }
    `;
    document.head.appendChild(st);
  }
  let pageSt = document.getElementById('simplitexDynamicPageCSS');
  if (!pageSt) {
    pageSt = document.createElement('style');
    pageSt.id = 'simplitexDynamicPageCSS';
    document.head.appendChild(pageSt);
  }
  pageSt.textContent = pageCss || '@media print { @page { size: A5 landscape; margin: 6mm; } }';
}

// Tab Switch Hook
window.onTabChanged = function (tabId) {
  if (tabId === 'tab-jobwork') {
    jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null };
    renderJWOutward();
  } else if (tabId === 'tab-inward') {
    inState = { step: 'MENU', jwType: '', worker: null, filterDate: '' };
    renderStockInward();
  }
};

// Tally Esc Key
window.handleModuleEscape = function () {
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (!sec) return false;

  if (sec.id === 'tab-jobwork') {
    if (jwState.step === 'BATCH' || jwState.step === 'PASSBOOK') {
      jwState.step = 'WORKER'; jwState.worker = null; jwState.meta = null; renderJWOutward(); return true;
    }
    if (jwState.step === 'WORKER') {
      jwState.step = 'TYPE'; jwState.jwType = ''; renderJWOutward(); return true;
    }
  }
  if (sec.id === 'tab-inward') {
    if (inState.step === 'JW_RETURN') { inState.step = 'JW_WORKER'; inState.worker = null; renderStockInward(); return true; }
    if (inState.step === 'JW_WORKER') { inState.step = 'JW_TYPE'; inState.jwType = ''; renderStockInward(); return true; }
    if (inState.step === 'DIRECT' || inState.step === 'JW_TYPE' || inState.step === 'HISTORY') {
      inState.step = 'MENU'; renderStockInward(); return true;
    }
  }
  return false;
};

// ==========================================
// MODULE 1: JOB WORK OUTWARD + A5 BILL PRINT
// ==========================================
async function renderJWOutward() {
  await openDB();
  const box = document.getElementById('tab-jobwork');

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
            <div class="list-row ${i === 0 ? 'kbd-active' : ''}" data-key="${i + 1}" onclick="pickOutJWType('${esc(t.name)}')">
              <span>${i + 1}. ${esc(t.name)}</span>
              <span class="badge">Enter →</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return;
  }

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
            <div><label>Worker / Party Naam *</label><input id="newWNameOut" placeholder="e.g. G.K. Fabrics" /></div>
            <div><label>Mobile No.</label><input id="newWPhoneOut" type="tel" placeholder="9198xxxxxx" /></div>
            <div><label>Address</label><input id="newWAddrOut" placeholder="e.g. A.13/199, Ghasiaritol Varanasi" /></div>
            <div><label>City / Destination</label><input id="newWCityOut" placeholder="e.g. VARANASI" /></div>
          </div>
          <div style="margin-top:8px;"><label>Default Transport (Dispatched through)</label><input id="newWTransOut" placeholder="e.g. Kashi Express" /></div>
          <button class="btn btn-dark btn-sm" style="margin-top:8px;" onclick="saveNewWorker('out')">Save Worker</button>
        </div>

        <div class="list-menu kbd-list">
          ${workers.length ? workers.map((w, i) => {
            const p = pendList.find((x) => x.id === `${w.name}__${jwState.jwType.toUpperCase()}`);
            const pQty = p ? p.qty : 0;
            return `
              <div class="list-row ${i === 0 ? 'kbd-active' : ''}" data-key="${i + 1}" onclick="pickOutWorker(${w.id})">
                <div>
                  <div>${i + 1}. ${esc(w.name)}</div>
                  <small style="color:#6b7280; font-weight:400;">${esc(w.phone || '')} ${esc(w.city || w.address || '')}</small>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span class="badge" style="color:${pQty > 0 ? '#b91c1c' : '#15803d'};">Pending: ${pQty}</span>
                  <button type="button" class="btn btn-light btn-sm"
                          onclick="event.stopPropagation(); openWorkerPassbook(${w.id})">📜 Khata</button>
                </div>
              </div>
            `;
          }).join('') : '<p style="color:#6b7280; font-size:13px;">Abhi koi worker nahi hai. Upar "+ Naya Worker" dabaa kar jodein.</p>'}
        </div>
      </div>
    `;
    return;
  }

  if (jwState.step === 'PASSBOOK') {
    const jwUpper = jwState.jwType.toUpperCase();
    const wName = jwState.worker.name.toUpperCase();
    const ledger = (await dbGetAll('jobWorkLedger'))
      .filter((l) => l.workerName === wName && l.jobWorkType === jwUpper)
      .sort((a, b) => b.createdAt - a.createdAt);
    const pend = await dbGet('jobWorkPending', `${wName}__${jwUpper}`);

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 ${esc(wName)} (${esc(jwState.jwType)}) — Poora Khata</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div style="background:#fef2f2; border:1px solid #fecaca; padding:10px 14px; border-radius:8px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
          <span>Abhi Total Pending:</span>
          <b style="font-size:18px; color:#b91c1c;">${pend ? pend.qty : 0} Pcs</b>
        </div>

        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr><th>Date / No.</th><th>Kaam</th><th>Batch / Detail</th><th>Pcs</th><th>Kya Kaam Hoga</th><th>Action</th></tr>
            </thead>
            <tbody>
              ${ledger.map((l) => {
                const isOut = l.direction === 'OUT';
                const detail = isOut && Array.isArray(l.batchItems)
                  ? l.batchItems.map((b) => `${b.bunkarName === _JW_POOL ? 'POOL' : b.bunkarName} (${b.qty})`).join(', ')
                  : 'Total Wapsi Entry';
                return `
                  <tr>
                    <td style="white-space:nowrap;">${esc(l.date)}${l.jobWorkNo ? `<br/><small>#${esc(l.jobWorkNo)}</small>` : ''}</td>
                    <td><b style="color:${isOut ? '#1d4ed8' : '#15803d'};">${isOut ? '📤 Bheja (OUT)' : '📥 Wapas (IN)'}</b></td>
                    <td><small>${esc(detail)}</small></td>
                    <td><b>${isOut ? '+' : '-'}${l.qty}</b></td>
                    <td><small><b>${esc(l.note || '-')}</b></small></td>
                    <td style="white-space:nowrap;">
                      ${isOut ? `<button class="btn btn-dark btn-sm" onclick="printJobWorkBill(${l.id})">🖨️ A5 Bill</button>` : ''}
                      <button class="btn btn-danger btn-sm" onclick="reverseLedgerEntry(${l.id}, 'PASSBOOK')">↩️ Del</button>
                    </td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="6">Is worker ka abhi koi record nahi hai</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    return;
  }

  // STEP 3: BATCH FORM
  if (jwState.step === 'BATCH') {
    const stocks = (await dbGetAll('bunkarStock')).filter((s) => s.qty > 0);
    const firms = await dbGetAll('firms');
    const allLedger = await dbGetAll('jobWorkLedger');
    const maxNo = allLedger.reduce((m, x) => Math.max(m, Number(x.jobWorkNo) || 0), 0);
    const savedWorks = getSavedWorkDetails();

    if (!jwState.meta) {
      jwState.meta = {
        firmId: firms.length ? firms[0].id : '',
        jobWorkNo: maxNo + 1,
        date: todayISO(),
        transport: jwState.worker.transport || '',
        destination: jwState.worker.city || '',
        note: ''
      };
    }

    const m = jwState.meta;
    const totalBatch = jwState.batchRows.reduce((s, r) => s + r.qty, 0);

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${esc(jwState.jwType)} → ${esc(jwState.worker.name)} (Batch & A5 Bill)</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div class="grid-2" style="margin-bottom:10px;">
          <div>
            <label>Firm Chunein *</label>
            <select id="batchFirmId" onchange="syncBatchMeta()">
              ${firms.length ? firms.map((f) => `<option value="${f.id}" ${Number(m.firmId) === f.id ? 'selected' : ''}>${esc(f.name)} (${esc(f.shortCode)})</option>`).join('') : '<option value="">Settings me Firm add karein</option>'}
            </select>
          </div>
          <div class="grid-2">
            <div><label>Job Work No. *</label><input type="number" id="batchBillNo" value="${esc(m.jobWorkNo)}" onchange="syncBatchMeta()" /></div>
            <div><label>Dated *</label><input type="date" id="batchDate" value="${esc(m.date)}" onchange="syncBatchMeta()" /></div>
          </div>
          <div><label>Dispatched through (Transport)</label><input id="batchTransport" value="${esc(m.transport)}" placeholder="e.g. Kashi Express" onchange="syncBatchMeta()" /></div>
          <div><label>Destination (City)</label><input id="batchDestination" value="${esc(m.destination)}" placeholder="e.g. VARANASI" onchange="syncBatchMeta()" /></div>
        </div>

        <!-- PROMINENT JOB WORK / SWAROVSKI DESIGN WORK FIELD -->
        <div style="background:#fefce8; border:1px solid #fde047; padding:10px; border-radius:8px; margin-bottom:10px;">
          <label style="color:#854d0e; font-size:13px;">✨ Kya Kaam / Design Hoga? * (Bill ke neeche Bold print hoga)</label>
          <input id="batchNote" list="jwWorkDetailList" value="${esc(m.note)}"
                 placeholder="e.g. GAWATI ZARI CONTRAST ANCHAL" oninput="syncBatchMeta()" />
          <datalist id="jwWorkDetailList">
            ${savedWorks.map((w) => `<option value="${esc(w)}">`).join('')}
          </datalist>
        </div>

        <!-- Keyboard Fast Batch Entry -->
        <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px; border-radius:8px; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:700; color:#1e3a8a; margin-bottom:6px;">
            Batch Me Bunkar Saree Jodein (Bunkar chunein → Qty likh kar Enter dabayein):
          </div>
          <div class="grid-2">
            <div>
              <label>Description of Goods (Bunkar Naam)</label>
              <input id="batchBunkarInput" list="batchBunkarList" placeholder="e.g. MOHAMMAD ANAS, FARHAN" />
              <datalist id="batchBunkarList">
                ${stocks.map((s) => `<option value="${esc(s.bunkarName)}">${esc(s.bunkarName === _JW_POOL ? 'JOB WORK POOL' : s.bunkarName)} (${s.qty} Pcs)</option>`).join('')}
              </datalist>
            </div>
            <div>
              <label>Quantity (Pcs) — Enter se Add hoga</label>
              <input type="number" id="batchQtyInput" min="1" placeholder="e.g. 16" data-custom-enter="1"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); addBatchRow(); }" />
            </div>
          </div>
          <button type="button" class="btn btn-dark btn-sm" style="margin-top:8px;" onclick="addBatchRow()">+ Add Line</button>
        </div>

        <table>
          <thead><tr><th>Sl No.</th><th>Description of Goods (Bunkar)</th><th>Quantity</th><th>X</th></tr></thead>
          <tbody>
            ${jwState.batchRows.map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><b>${esc(r.bunkarName === _JW_POOL ? 'JOB WORK POOL' : r.bunkarName)}</b></td>
                <td><b>${r.qty}</b></td>
                <td><button class="btn btn-danger btn-sm" onclick="removeBatchRow(${i})">X</button></td>
              </tr>
            `).join('') || '<tr><td colspan="4" style="color:#6b7280;">Abhi batch khali hai... upar se add karein</td></tr>'}
          </tbody>
        </table>

        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:14px;">
          <div style="font-size:18px; font-weight:800;">TOTAL: <span style="color:#1d4ed8;">${totalBatch} Pcs</span></div>
          <button type="button" class="btn btn-success primary-save-btn" onclick="saveBatchOutward()">
            ✅ Save Batch & Print A5 Bill (Ctrl+S)
          </button>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('batchNote')?.focus(), 50);
  }
}

function syncBatchMeta() {
  if (!jwState.meta) jwState.meta = {};
  jwState.meta.firmId = document.getElementById('batchFirmId')?.value || '';
  jwState.meta.jobWorkNo = document.getElementById('batchBillNo')?.value || '';
  jwState.meta.date = document.getElementById('batchDate')?.value || todayISO();
  jwState.meta.transport = document.getElementById('batchTransport')?.value.trim() || '';
  jwState.meta.destination = document.getElementById('batchDestination')?.value.trim().toUpperCase() || '';
  jwState.meta.note = document.getElementById('batchNote')?.value.trim().toUpperCase() || '';
}

function pickOutJWType(name) { jwState.jwType = name; jwState.step = 'WORKER'; renderJWOutward(); }
async function pickOutWorker(id) {
  jwState.worker = await dbGet('jobWorkers', id);
  jwState.batchRows = [];
  jwState.meta = null;
  jwState.step = 'BATCH';
  renderJWOutward();
}
async function openWorkerPassbook(id) {
  jwState.worker = await dbGet('jobWorkers', id);
  jwState.step = 'PASSBOOK';
  renderJWOutward();
}

function showAddWorkerModal(mode) {
  const el = document.getElementById(mode === 'out' ? 'addWorkerInlineOut' : 'addWorkerInlineIn');
  el.classList.toggle('hidden');
  const inp = document.getElementById(mode === 'out' ? 'newWNameOut' : 'newWNameIn');
  if (!el.classList.contains('hidden')) inp.focus();
}

async function saveNewWorker(mode) {
  try {
    const pfx = mode === 'out' ? 'Out' : 'In';
    const name = document.getElementById('newWName' + pfx).value.trim().toUpperCase();
    const phone = document.getElementById('newWPhone' + pfx).value.trim();
    const address = document.getElementById('newWAddr' + pfx).value.trim();
    const city = (document.getElementById('newWCity' + pfx)?.value || '').trim().toUpperCase();
    const transport = (document.getElementById('newWTrans' + pfx)?.value || '').trim();
    const jwType = mode === 'out' ? jwState.jwType : inState.jwType;
    if (!name) return alert('Worker ka naam zaroori hai!');
    await dbPut('jobWorkers', { name, phone, address, city, transport, jobWorkType: jwType.toUpperCase() });
    mode === 'out' ? renderJWOutward() : renderStockInward();
  } catch (err) { alert('Save Error: ' + err.message); }
}

async function addJobWorkTypePrompt(mode) {
  const name = prompt('Naye Job Work ka naam likhein (e.g. Dying, Cutting, Stone):');
  if (!name || !name.trim()) return;
  await dbPut('jobWorkTypes', { name: name.trim() });
  mode === 'out' ? renderJWOutward() : renderStockInward();
}

async function addBatchRow() {
  syncBatchMeta();
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
  setTimeout(() => document.getElementById('batchBunkarInput')?.focus(), 50);
}

function removeBatchRow(idx) {
  syncBatchMeta();
  jwState.batchRows.splice(idx, 1);
  renderJWOutward();
}

async function saveBatchOutward() {
  try {
    syncBatchMeta();
    if (!jwState.batchRows.length) return alert('Batch khali hai! Kam se kam 1 saree add karein.');
    const m = jwState.meta;
    if (!m.note) {
      const entered = prompt('Bill ke neeche kya kaam print karna hai? (e.g. GAWATI ZARI CONTRAST ANCHAL)');
      if (entered && entered.trim()) m.note = entered.trim().toUpperCase();
    }
    if (m.note) rememberWorkDetail(m.note);

    const jwTypeUpper = jwState.jwType.toUpperCase();
    const workerName = jwState.worker.name.toUpperCase();

    let totalQty = 0;
    for (const row of jwState.batchRows) {
      const st = await dbGet('bunkarStock', row.bunkarName);
      const avail = st ? st.qty : 0;
      await dbPut('bunkarStock', { bunkarName: row.bunkarName, qty: Math.max(0, avail - row.qty), updatedAt: new Date().toISOString() });
      totalQty += row.qty;
    }

    if (m.transport || m.destination) {
      await dbPut('jobWorkers', {
        ...jwState.worker,
        transport: m.transport || jwState.worker.transport || '',
        city: m.destination || jwState.worker.city || ''
      });
    }

    const pendId = `${workerName}__${jwTypeUpper}`;
    const curPend = await dbGet('jobWorkPending', pendId);
    await dbPut('jobWorkPending', {
      id: pendId, workerName, jobWorkType: jwTypeUpper, qty: (curPend ? curPend.qty : 0) + totalQty
    });

    const ledgerId = await dbPut('jobWorkLedger', {
      direction: 'OUT', jobWorkType: jwTypeUpper, workerName,
      workerPhone: jwState.worker.phone || '',
      workerAddress: jwState.worker.address || '',
      firmId: m.firmId, jobWorkNo: m.jobWorkNo,
      transport: m.transport, destination: m.destination,
      qty: totalQty, batchItems: jwState.batchRows, date: m.date, note: m.note, createdAt: Date.now()
    });

    if (typeof refreshDashboard === 'function') await refreshDashboard();

    if (confirm(`📤 Job Work #${m.jobWorkNo} (${totalQty} Pcs) Save ho gaya!\nKya abhi Half-A4 (A5) Bill Print karna hai?`)) {
      await printJobWorkBill(ledgerId);
    }

    jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null };
    renderJWOutward();
  } catch (err) { alert('Save Error: ' + err.message); }
}

// === EXACT A5 (HALF-A4) JOB WORK BILL PRINT ===
async function printJobWorkBill(ledgerId) {
  const l = await dbGet('jobWorkLedger', ledgerId);
  if (!l) return;
  const firm = (l.firmId ? await dbGet('firms', Number(l.firmId)) : null) ||
               (await dbGetAll('firms'))[0] ||
               { name: 'SimpliTex Firm', address: '', phone: '' };

  ensureJWPrintSetup('@media print { @page { size: A5 landscape; margin: 6mm; } body { margin: 0; } }');

  const items = Array.isArray(l.batchItems) ? l.batchItems : [];
  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = `
    <div style="font-family:Arial,sans-serif; width:100%; max-width:196mm; margin:0 auto; color:#000;">
      <table style="width:100%; border-collapse:collapse; border:1.5px solid #000; font-size:11.5px;">
        <tr>
          <td style="width:55%; vertical-align:top; padding:0; border:1px solid #000;">
            <div style="padding:6px 8px; border-bottom:1px solid #000;">
              <div style="font-size:14px; font-weight:800;">${esc(firm.name)}</div>
              <div>${esc(firm.address || '')}</div>
              ${firm.phone ? `<div>Mob. No. ${esc(firm.phone)}</div>` : ''}
              ${firm.gstin ? `<div>GSTIN: ${esc(firm.gstin)}</div>` : ''}
            </div>
            <div style="padding:6px 8px;">
              <div style="font-size:13px; font-weight:800;">${esc(l.workerName)}</div>
              <div>${esc(l.workerAddress || l.destination || '')}</div>
              ${l.workerPhone ? `<div>Contact: ${esc(l.workerPhone)}</div>` : ''}
            </div>
          </td>

          <td style="width:45%; vertical-align:top; padding:0; border:1px solid #000;">
            <table style="width:100%; border-collapse:collapse; height:100%; font-size:11.5px;">
              <tr>
                <td style="width:50%; border-bottom:1px solid #000; border-right:1px solid #000; padding:6px;">
                  <div style="font-size:10px;">JOB WORK NO.</div>
                  <div style="font-weight:800; font-size:13px; margin-top:2px;">${esc(l.jobWorkNo || l.id)}</div>
                </td>
                <td style="width:50%; border-bottom:1px solid #000; padding:6px;">
                  <div style="font-size:10px;">Dated</div>
                  <div style="font-weight:800; font-size:13px; margin-top:2px;">${esc(formatDMY(l.date))}</div>
                </td>
              </tr>
              <tr>
                <td style="border-right:1px solid #000; padding:6px; vertical-align:top;">
                  <div style="font-size:10px;">Dispatched through</div>
                  <div style="font-weight:800; margin-top:3px;">${esc(l.transport || '-')}</div>
                </td>
                <td style="padding:6px; vertical-align:top;">
                  <div style="font-size:10px;">Destination</div>
                  <div style="font-weight:800; margin-top:3px;">${esc(l.destination || '-')}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table style="width:100%; border-collapse:collapse; border:1.5px solid #000; border-top:none; font-size:12px;">
        <thead>
          <tr>
            <th style="width:10%; border:1px solid #000; padding:5px; text-align:center;">Sl<br/>No.</th>
            <th style="width:72%; border:1px solid #000; padding:5px; text-align:center;">Description of Goods</th>
            <th style="width:18%; border:1px solid #000; padding:5px; text-align:center;">QUANTITY</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, i) => `
            <tr>
              <td style="border:1px solid #000; padding:4px 6px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:center; font-weight:700;">
                ${esc(it.bunkarName === _JW_POOL ? 'JOB WORK POOL' : it.bunkarName)}
              </td>
              <td style="border:1px solid #000; padding:4px 8px; text-align:center; font-weight:700;">${it.qty}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td style="border:1px solid #000; padding:5px;"></td>
            <td style="border:1px solid #000; padding:5px 12px; text-align:right; font-weight:800;">TOTAL</td>
            <td style="border:1px solid #000; padding:5px; text-align:center; font-weight:800; font-size:13px;">${l.qty}</td>
          </tr>
        </tfoot>
      </table>

      ${l.note ? `
        <div style="text-align:center; font-weight:900; font-size:15px; margin-top:7px; letter-spacing:0.6px; text-transform:uppercase;">
          ${esc(l.note)}
        </div>
      ` : ''}
    </div>
  `;
  setTimeout(() => window.print(), 150);
}

// ==========================================
// MODULE 2: STOCK INWARD + FULL INWARD RECORD
// ==========================================
async function renderStockInward() {
  await openDB();
  const box = document.getElementById('tab-inward');

  if (inState.step === 'MENU') {
    const ledger = (await dbGetAll('jobWorkLedger')).filter((l) => l.direction === 'IN');
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>2. Stock Inward — Maal Kahan se Aaya?</h2>
          <button class="btn btn-dark btn-sm" onclick="inState.step='HISTORY'; renderStockInward();">
            📜 Poora Record (${ledger.length})
          </button>
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

  if (inState.step === 'HISTORY') {
    const allIn = (await dbGetAll('jobWorkLedger'))
      .filter((l) => l.direction === 'IN')
      .sort((a, b) => b.createdAt - a.createdAt);
    const filtered = inState.filterDate ? allIn.filter((l) => l.date === inState.filterDate) : allIn;

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 Stock Inward Record (${filtered.length})</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
          <label style="margin:0;">Date Filter:</label>
          <input type="date" style="width:auto;" value="${esc(inState.filterDate)}"
                 onchange="inState.filterDate=this.value; renderStockInward();" />
          ${inState.filterDate ? `<button class="btn btn-light btn-sm" onclick="inState.filterDate=''; renderStockInward();">All Dates</button>` : ''}
        </div>

        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr><th>Date</th><th>Source</th><th>Bunkar / Worker</th><th>Pcs</th><th>Note</th><th>Galti Sudhar</th></tr>
            </thead>
            <tbody>
              ${filtered.map((l) => {
                const isDirect = l.jobWorkType === 'DIRECT_BAITHAK';
                return `
                  <tr>
                    <td style="white-space:nowrap;">${esc(l.date)}</td>
                    <td><b>${isDirect ? '🏠 Direct Baithak' : '🧵 ' + esc(l.jobWorkType)}</b></td>
                    <td><b>${esc(isDirect ? l.bunkarName : l.workerName)}</b></td>
                    <td><b style="color:#15803d;">+${l.qty}</b></td>
                    <td><small>${esc(l.note || '-')}</small></td>
                    <td><button class="btn btn-danger btn-sm" onclick="reverseLedgerEntry(${l.id}, 'INWARD_HIST')">↩️ Delete</button></td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="6">Koi record nahi mila</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    return;
  }

  if (inState.step === 'DIRECT') {
    const stocks = await dbGetAll('bunkarStock');
    const names = stocks.filter((s) => s.bunkarName !== _JW_POOL);
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
            <div><label>Worker Naam *</label><input id="newWNameIn" placeholder="e.g. G.K. Fabrics" /></div>
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
            <input type="number" id="jwRetQty" min="1" value="${pendQty > 0 ? pendQty : ''}" placeholder="e.g. 93" />
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
  try {
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
    if (typeof refreshDashboard === 'function') await refreshDashboard();
  } catch (err) { alert('Save Error: ' + err.message); }
}

async function saveJWReturnInward() {
  try {
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

    const pool = await dbGet('bunkarStock', _JW_POOL);
    await dbPut('bunkarStock', { bunkarName: _JW_POOL, qty: (pool ? pool.qty : 0) + qty, updatedAt: new Date().toISOString() });

    await dbPut('jobWorkLedger', {
      direction: 'IN', jobWorkType: jwUpper, workerName, qty, date, note, createdAt: Date.now()
    });

    alert(`✅ ${workerName} se ${qty} Pcs wapas aa gayi! (Baki Pending: ${Math.max(0, pendQty - qty)} Pcs)`);
    inState = { step: 'MENU', jwType: '', worker: null, filterDate: '' };
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    renderStockInward();
  } catch (err) { alert('Save Error: ' + err.message); }
}

async function reverseLedgerEntry(id, returnTo) {
  try {
    const entry = await dbGet('jobWorkLedger', id);
    if (!entry) return;
    if (!confirm(`Kya ye ${entry.date} ki (${entry.qty} Pcs) entry Delete karke Stock/Pending wapas theek karna hai?`)) return;

    if (entry.direction === 'OUT') {
      for (const row of (entry.batchItems || [])) {
        const st = await dbGet('bunkarStock', row.bunkarName);
        await dbPut('bunkarStock', { bunkarName: row.bunkarName, qty: (st ? st.qty : 0) + row.qty, updatedAt: new Date().toISOString() });
      }
      const pendId = `${entry.workerName}__${entry.jobWorkType}`;
      const p = await dbGet('jobWorkPending', pendId);
      if (p) await dbPut('jobWorkPending', { ...p, qty: Math.max(0, p.qty - entry.qty) });
    } else if (entry.direction === 'IN' && entry.jobWorkType === 'DIRECT_BAITHAK') {
      const st = await dbGet('bunkarStock', entry.bunkarName);
      if (st) await dbPut('bunkarStock', { ...st, qty: Math.max(0, st.qty - entry.qty), updatedAt: new Date().toISOString() });
    } else if (entry.direction === 'IN') {
      const pool = await dbGet('bunkarStock', _JW_POOL);
      if (pool) await dbPut('bunkarStock', { ...pool, qty: Math.max(0, pool.qty - entry.qty), updatedAt: new Date().toISOString() });
      const pendId = `${entry.workerName}__${entry.jobWorkType}`;
      const p = await dbGet('jobWorkPending', pendId);
      await dbPut('jobWorkPending', { id: pendId, workerName: entry.workerName, jobWorkType: entry.jobWorkType, qty: (p ? p.qty : 0) + entry.qty });
    }

    await dbDelete('jobWorkLedger', id);
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    returnTo === 'PASSBOOK' ? renderJWOutward() : renderStockInward();
  } catch (err) { alert('Reverse Error: ' + err.message); }
}
