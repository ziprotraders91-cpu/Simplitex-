// === SimpliTex Module 1 & 2 v3 (Complete: Edit Everywhere + Auto Stock Engine + Aligned + A5 Bill) ===

const _JW_POOL = (typeof JW_POOL_KEY !== 'undefined') ? JW_POOL_KEY : '__JW_POOL__';
let jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null, editId: null, origCreatedAt: null, origQtyMap: {} };
let inState = { step: 'MENU', jwType: '', worker: null, editId: null, editOrig: null, returnTo: '' };

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

function resetPager(id) {
  if (window._stxPagerState) delete window._stxPagerState[id];
}

function switchTabSectionOnly(tabId) {
  document.querySelectorAll('.tab-sec').forEach((s) => s.classList.add('hidden'));
  const sec = document.getElementById(tabId);
  if (sec) sec.classList.remove('hidden');
  const order = ['tab-dash', 'tab-jobwork', 'tab-inward', 'tab-order', 'tab-barcode', 'tab-challan', 'tab-settings'];
  const idx = order.indexOf(tabId);
  const btns = document.querySelectorAll('.nav-btn');
  btns.forEach((b) => b.classList.remove('active'));
  if (idx >= 0 && btns[idx]) btns[idx].classList.add('active');
}

async function getNextJobWorkNoFast() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('jobWorkLedger', 'readonly');
    const store = tx.objectStore('jobWorkLedger');
    let maxNo = 0, outFound = 0;
    const req = store.openCursor(null, 'prev');
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur || outFound >= 20) return resolve(maxNo + 1);
      const v = cur.value;
      if (v && v.direction === 'OUT') {
        outFound++;
        const n = Number(v.jobWorkNo) || 0;
        if (n > maxNo) maxNo = n;
      }
      cur.continue();
    };
    req.onerror = () => resolve(1);
  });
}

async function countInwardLedgerFast() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('jobWorkLedger', 'readonly');
    const store = tx.objectStore('jobWorkLedger');
    if (store.indexNames.contains('direction')) {
      const req = store.index('direction').count('IN');
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    } else {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).filter((l) => l.direction === 'IN').length);
      req.onerror = () => resolve(0);
    }
  });
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
    st.textContent = `@media print { body > *:not(#simplitexPrintRoot) { display: none !important; } #simplitexPrintRoot { display: block !important; width: 100%; background: #fff; color: #000; } }`;
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

window.onTabChanged = function (tabId) {
  if (tabId === 'tab-jobwork') {
    jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null, editId: null, origCreatedAt: null, origQtyMap: {} };
    resetPager('jwTypePager');
    renderJWOutward();
  } else if (tabId === 'tab-inward') {
    inState = { step: 'MENU', jwType: '', worker: null, editId: null, editOrig: null, returnTo: '' };
    renderStockInward();
  }
};

window.handleModuleEscape = function () {
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (!sec) return false;
  if (sec.id === 'tab-jobwork') {
    if (jwState.step === 'BATCH' || jwState.step === 'PASSBOOK') {
      jwState.step = 'WORKER'; jwState.worker = null; jwState.meta = null; jwState.editId = null; jwState.origQtyMap = {}; renderJWOutward(); return true;
    }
    if (jwState.step === 'WORKER') {
      jwState.step = 'TYPE'; jwState.jwType = ''; renderJWOutward(); return true;
    }
  }
  if (sec.id === 'tab-inward') {
    if (inState.step === 'JW_RETURN') {
      if (inState.returnTo === 'PASSBOOK') {
        inState.editId = null; inState.editOrig = null; inState.returnTo = '';
        switchTabSectionOnly('tab-jobwork'); renderJWOutward(); return true;
      }
      if (inState.editId) { inState.step = 'HISTORY'; inState.editId = null; inState.editOrig = null; renderStockInward(); return true; }
      inState.step = 'JW_WORKER'; inState.worker = null; renderStockInward(); return true;
    }
    if (inState.step === 'DIRECT' && inState.editId) {
      inState.step = 'HISTORY'; inState.editId = null; inState.editOrig = null; renderStockInward(); return true;
    }
    if (inState.step === 'JW_WORKER') { inState.step = 'JW_TYPE'; inState.jwType = ''; renderStockInward(); return true; }
    if (inState.step === 'DIRECT' || inState.step === 'JW_TYPE' || inState.step === 'HISTORY') {
      inState.step = 'MENU'; renderStockInward(); return true;
    }
  }
  return false;
};

// === MODULE 1: JOB WORK OUTWARD ===
async function renderJWOutward() {
  await openDB();
  const box = document.getElementById('tab-jobwork');

  if (jwState.step === 'TYPE') {
    const types = await dbGetAll('jobWorkTypes');
    box.innerHTML = `<div class="card"><div class="card-head"><h2>1. Job Work Outward — Kaam Chunein</h2><button class="btn btn-dark btn-sm" onclick="addJobWorkTypePrompt('out')">+ Naya Job Work</button></div><div id="jwTypePager"></div></div>`;
    mountPagedList({
      id: 'jwTypePager', mode: 'list', items: types, perPage: 15,
      placeholder: '🔍 Job Work search karein (Calender, Swarovski...)...',
      getSearchText: (t) => t.name,
      renderRow: (t, gIdx, pageIdx) => `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickOutJWType('${esc(t.name)}')"><span>${gIdx + 1}. ${esc(t.name)}</span><span class="badge">Enter →</span></div>`
    });
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
          <div><button class="btn btn-success btn-sm" onclick="showAddWorkerModal('out')">+ Naya Worker</button><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div>
        </div>
        <div id="addWorkerInlineOut" class="hidden" style="background:#f9fafb; border:1px solid #d1d5db; padding:12px; border-radius:8px; margin-bottom:12px;">
          <input type="hidden" id="editWorkerIdOut" value="" />
          <div class="grid-2" style="align-items:start;">
            <div><label>Worker / Party Naam *</label><input id="newWNameOut" placeholder="e.g. G.K. Fabrics" /></div>
            <div><label>Mobile No.</label><input id="newWPhoneOut" type="tel" placeholder="9198xxxxxx" /></div>
            <div><label>Address</label><input id="newWAddrOut" placeholder="e.g. A.13/199, Ghasiaritol Varanasi" /></div>
            <div><label>City / Destination</label><input id="newWCityOut" placeholder="e.g. VARANASI" /></div>
            <div><label>Default Transport</label><input id="newWTransOut" placeholder="e.g. Kashi Express" /></div>
            <div><label style="visibility:hidden;">.</label><button class="btn btn-dark" style="height:40px; width:100%;" onclick="saveNewWorker('out')">Save Worker</button></div>
          </div>
        </div>
        <div id="jwWorkerPager"></div>
      </div>`;
    mountPagedList({
      id: 'jwWorkerPager', mode: 'list', items: workers, perPage: 15,
      placeholder: '🔍 Worker naam, mobile ya city search karein...',
      getSearchText: (w) => `${w.name} ${w.phone || ''} ${w.city || ''} ${w.address || ''}`,
      renderRow: (w, gIdx, pageIdx) => {
        const p = pendList.find((x) => x.id === `${w.name}__${jwState.jwType.toUpperCase()}`);
        const pQty = p ? p.qty : 0;
        return `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickOutWorker(${w.id})">
          <div><div>${gIdx + 1}. ${esc(w.name)}</div><small style="color:#6b7280; font-weight:400;">${esc(w.phone || '')} ${esc(w.city || w.address || '')}</small></div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="badge" style="color:${pQty > 0 ? '#b91c1c' : '#15803d'};">Pending: ${pQty}</span>
            <button type="button" class="btn btn-light btn-sm" onclick="event.stopPropagation(); editWorkerInline(${w.id}, 'out')">✏️</button>
            <button type="button" class="btn btn-light btn-sm" onclick="event.stopPropagation(); openWorkerPassbook(${w.id})">📜 Khata</button>
          </div></div>`;
      },
      emptyHtml: '<p style="color:#6b7280; font-size:13px;">Koi worker nahi mila. Upar "+ Naya Worker" dabaa kar jodein.</p>'
    });
    return;
  }

  if (jwState.step === 'PASSBOOK') {
    const jwUpper = jwState.jwType.toUpperCase();
    const wName = jwState.worker.name.toUpperCase();
    const rawWorkerLedger = (typeof dbGetByIndex === 'function')
      ? await dbGetByIndex('jobWorkLedger', 'workerName', wName)
      : (await dbGetAll('jobWorkLedger')).filter((l) => l.workerName === wName);
    const ledger = rawWorkerLedger.filter((l) => l.jobWorkType === jwUpper).sort((a, b) => b.createdAt - a.createdAt);
    const pend = await dbGet('jobWorkPending', `${wName}__${jwUpper}`);
    box.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>📜 ${esc(wName)} (${esc(jwState.jwType)}) — Poora Khata</h2><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div>
        <div style="background:#fef2f2; border:1px solid #fecaca; padding:10px 14px; border-radius:8px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;"><span>Abhi Total Pending:</span><b style="font-size:18px; color:#b91c1c;">${pend ? pend.qty : 0} Pcs</b></div>
        <div id="jwPassbookPager"></div>
      </div>`;
    mountPagedList({
      id: 'jwPassbookPager', items: ledger, perPage: 15,
      placeholder: '🔍 Date, Bunkar, Bill No. ya Kaam search karein...',
      headHtml: '<tr><th>Date / No.</th><th>Kaam</th><th>Batch / Detail</th><th>Pcs</th><th>Kya Kaam Hoga</th><th>Action</th></tr>',
      getSearchText: (l) => `${l.date} ${l.jobWorkNo || ''} ${l.direction} ${Array.isArray(l.batchItems) ? l.batchItems.map((b) => b.bunkarName).join(' ') : ''} ${l.note || ''}`,
      renderRow: (l) => {
        const isOut = l.direction === 'OUT';
        const detail = isOut && Array.isArray(l.batchItems) ? l.batchItems.map((b) => `${b.bunkarName === _JW_POOL ? 'POOL' : b.bunkarName} (${b.qty})`).join(', ') : 'Total Wapsi Entry';
        return `<tr>
          <td style="white-space:nowrap;">${esc(l.date)}${l.jobWorkNo ? `<br/><small>#${esc(l.jobWorkNo)}</small>` : ''}</td>
          <td><b style="color:${isOut ? '#1d4ed8' : '#15803d'};">${isOut ? '📤 Bheja (OUT)' : '📥 Wapas (IN)'}</b></td>
          <td><small>${esc(detail)}</small></td>
          <td><b>${isOut ? '+' : '-'}${l.qty}</b></td>
          <td><small><b>${esc(l.note || '-')}</b></small></td>
          <td style="white-space:nowrap;">
            ${isOut ? `<button class="btn btn-dark btn-sm" onclick="printJobWorkBill(${l.id})">🖨️ A5</button>` : ''}
            <button class="btn btn-light btn-sm" onclick="${isOut ? `editLedgerOut(${l.id})` : `editLedgerIn(${l.id}, 'PASSBOOK')`}">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="reverseLedgerEntry(${l.id}, 'PASSBOOK')">↩️ Del</button>
          </td></tr>`;
      },
      emptyHtml: '<tr><td colspan="6">Is worker ka abhi koi record nahi hai</td></tr>'
    });
    return;
  }

  if (jwState.step === 'BATCH') {
    const rawStocks = await dbGetAll('bunkarStock');
    const stockMap = {};
    rawStocks.forEach((s) => { stockMap[s.bunkarName] = s.qty; });
    Object.keys(jwState.origQtyMap || {}).forEach((bName) => { stockMap[bName] = (stockMap[bName] || 0) + jwState.origQtyMap[bName]; });
    const stocks = Object.keys(stockMap).filter((k) => stockMap[k] > 0).map((k) => ({ bunkarName: k, qty: stockMap[k] }));
    const firms = await dbGetAll('firms');
    const savedWorks = getSavedWorkDetails();

    if (!jwState.meta) {
      const nextJWNo = await getNextJobWorkNoFast();
      jwState.meta = {
        firmId: firms.length ? firms[0].id : '', jobWorkNo: nextJWNo, date: todayISO(),
        transport: jwState.worker.transport || '', destination: jwState.worker.city || '', note: ''
      };
    }
    const m = jwState.meta;
    const totalBatch = jwState.batchRows.reduce((s, r) => s + r.qty, 0);
    const isEdit = !!jwState.editId;

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${isEdit ? '✏️ Edit Job Work' : esc(jwState.jwType)} → ${esc(jwState.worker.name)} (${isEdit ? '#' + esc(m.jobWorkNo) : 'Batch & A5 Bill'})</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>
        <div class="grid-2" style="margin-bottom:10px; align-items:start;">
          <div><label>Firm Chunein *</label><select id="batchFirmId" onchange="syncBatchMeta()">${firms.length ? firms.map((f) => `<option value="${f.id}" ${Number(m.firmId) === f.id ? 'selected' : ''}>${esc(f.name)} (${esc(f.shortCode)})</option>`).join('') : '<option value="">Settings me Firm add karein</option>'}</select></div>
          <div><label>Job Work No. *</label><input type="number" id="batchBillNo" value="${esc(m.jobWorkNo)}" onchange="syncBatchMeta()" /></div>
          <div><label>Dated *</label><input type="date" id="batchDate" value="${esc(m.date)}" onchange="syncBatchMeta()" /></div>
          <div><label>Dispatched through (Transport)</label><input id="batchTransport" value="${esc(m.transport)}" placeholder="e.g. Kashi Express" onchange="syncBatchMeta()" /></div>
          <div><label>Destination (City)</label><input id="batchDestination" value="${esc(m.destination)}" placeholder="e.g. VARANASI" onchange="syncBatchMeta()" /></div>
          <div><label>✨ Kya Kaam / Design Hoga? *</label><input id="batchNote" list="jwWorkDetailList" value="${esc(m.note)}" placeholder="e.g. GAWATI ZARI CONTRAST ANCHAL" oninput="syncBatchMeta()" /><datalist id="jwWorkDetailList">${savedWorks.map((w) => `<option value="${esc(w)}">`).join('')}</datalist></div>
        </div>
        <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:10px; border-radius:8px; margin-bottom:10px;">
          <div style="font-size:12px; font-weight:700; color:#1e3a8a; margin-bottom:6px;">Batch Me Bunkar Saree Jodein (Enter = Aage):</div>
          <div class="grid-2" style="align-items:start;">
            <div><label>Description of Goods (Bunkar Naam)</label><input id="batchBunkarInput" list="batchBunkarList" placeholder="e.g. MOHAMMAD ANAS, FARHAN" /><datalist id="batchBunkarList">${stocks.map((s) => `<option value="${esc(s.bunkarName)}">${esc(s.bunkarName === _JW_POOL ? 'JOB WORK POOL' : s.bunkarName)} (${s.qty} Pcs)</option>`).join('')}</datalist></div>
            <div><label>Quantity (Pcs) — Enter se Add hoga</label><input type="number" id="batchQtyInput" min="1" placeholder="e.g. 16" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); addBatchRow(); }" /></div>
          </div>
          <button type="button" class="btn btn-dark btn-sm" style="margin-top:8px;" onclick="addBatchRow()">+ Add Line</button>
        </div>
        <table><thead><tr><th>Sl No.</th><th>Description of Goods (Bunkar)</th><th>Quantity</th><th>X</th></tr></thead>
          <tbody>${jwState.batchRows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.bunkarName === _JW_POOL ? 'JOB WORK POOL' : r.bunkarName)}</b></td><td><b>${r.qty}</b></td><td><button class="btn btn-danger btn-sm" onclick="removeBatchRow(${i})">X</button></td></tr>`).join('') || '<tr><td colspan="4" style="color:#6b7280;">Abhi batch khali hai... upar se add karein</td></tr>'}</tbody>
        </table>
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-top:14px;">
          <div style="font-size:18px; font-weight:800;">TOTAL: <span style="color:#1d4ed8;">${totalBatch} Pcs</span></div>
          <button type="button" class="btn btn-success primary-save-btn" onclick="saveBatchOutward()">${isEdit ? '✅ Update Batch & Sync Stock (Ctrl+S)' : '✅ Save Batch & Print A5 Bill (Ctrl+S)'}</button>
        </div>
      </div>`;
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

function pickOutJWType(name) { jwState.jwType = name; jwState.step = 'WORKER'; resetPager('jwWorkerPager'); renderJWOutward(); }
async function pickOutWorker(id) {
  jwState.worker = await dbGet('jobWorkers', id);
  jwState.batchRows = []; jwState.meta = null; jwState.editId = null; jwState.origCreatedAt = null; jwState.origQtyMap = {};
  jwState.step = 'BATCH'; renderJWOutward();
}
async function openWorkerPassbook(id) {
  jwState.worker = await dbGet('jobWorkers', id); jwState.step = 'PASSBOOK'; resetPager('jwPassbookPager'); renderJWOutward();
}

async function editLedgerOut(id) {
  const entry = await dbGet('jobWorkLedger', id);
  if (!entry) return;
  const allWorkers = await dbGetAll('jobWorkers');
  const w = allWorkers.find((x) => x.name.toUpperCase() === entry.workerName) || {
    name: entry.workerName, phone: entry.workerPhone || '', address: entry.workerAddress || '', city: entry.destination || '', transport: entry.transport || ''
  };
  const origMap = {};
  (entry.batchItems || []).forEach((r) => { origMap[r.bunkarName] = (origMap[r.bunkarName] || 0) + (Number(r.qty) || 0); });
  jwState.jwType = entry.jobWorkType; jwState.worker = w; jwState.editId = entry.id; jwState.origCreatedAt = entry.createdAt; jwState.origQtyMap = origMap;
  jwState.batchRows = (entry.batchItems || []).map((r) => ({ bunkarName: r.bunkarName, qty: Number(r.qty) || 0 }));
  jwState.meta = { firmId: entry.firmId || '', jobWorkNo: entry.jobWorkNo || '', date: entry.date || todayISO(), transport: entry.transport || '', destination: entry.destination || '', note: entry.note || '' };
  jwState.step = 'BATCH'; renderJWOutward();
}

function showAddWorkerModal(mode) {
  const pfx = mode === 'out' ? 'Out' : 'In';
  const el = document.getElementById(mode === 'out' ? 'addWorkerInlineOut' : 'addWorkerInlineIn');
  const editHid = document.getElementById('editWorkerId' + pfx);
  if (editHid) editHid.value = '';
  ['newWName', 'newWPhone', 'newWAddr', 'newWCity', 'newWTrans'].forEach((f) => { const i = document.getElementById(f + pfx); if (i) i.value = ''; });
  el.classList.toggle('hidden');
  const inp = document.getElementById('newWName' + pfx);
  if (!el.classList.contains('hidden')) inp.focus();
}

async function editWorkerInline(id, mode) {
  const w = await dbGet('jobWorkers', id);
  if (!w) return;
  const pfx = mode === 'out' ? 'Out' : 'In';
  document.getElementById(mode === 'out' ? 'addWorkerInlineOut' : 'addWorkerInlineIn').classList.remove('hidden');
  if (document.getElementById('editWorkerId' + pfx)) document.getElementById('editWorkerId' + pfx).value = w.id;
  document.getElementById('newWName' + pfx).value = w.name || '';
  document.getElementById('newWPhone' + pfx).value = w.phone || '';
  document.getElementById('newWAddr' + pfx).value = w.address || '';
  if (document.getElementById('newWCity' + pfx)) document.getElementById('newWCity' + pfx).value = w.city || '';
  if (document.getElementById('newWTrans' + pfx)) document.getElementById('newWTrans' + pfx).value = w.transport || '';
  document.getElementById('newWName' + pfx).focus();
}

async function saveNewWorker(mode) {
  try {
    const pfx = mode === 'out' ? 'Out' : 'In';
    const editIdVal = document.getElementById('editWorkerId' + pfx)?.value;
    const name = document.getElementById('newWName' + pfx).value.trim().toUpperCase();
    const phone = document.getElementById('newWPhone' + pfx).value.trim();
    const address = document.getElementById('newWAddr' + pfx).value.trim();
    const city = (document.getElementById('newWCity' + pfx)?.value || '').trim().toUpperCase();
    const transport = (document.getElementById('newWTrans' + pfx)?.value || '').trim();
    const jwType = mode === 'out' ? jwState.jwType : inState.jwType;
    if (!name) return alert('Worker ka naam zaroori hai!');
    const payload = { name, phone, address, city, transport, jobWorkType: jwType.toUpperCase() };
    if (editIdVal) payload.id = Number(editIdVal);
    await dbPut('jobWorkers', payload);
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
  const avail = (st ? st.qty : 0) + ((jwState.origQtyMap && jwState.origQtyMap[bunkarName]) || 0);
  const alreadyAdded = jwState.batchRows.filter((r) => r.bunkarName === bunkarName).reduce((s, r) => s + r.qty, 0);
  if (alreadyAdded + qty > avail) return alert(`Dukan me ${bunkarName} ki sirf ${avail} saree hai (abhi tak ${alreadyAdded} add ho chuki)!`);
  jwState.batchRows.push({ bunkarName, qty });
  bInput.value = ''; qInput.value = '';
  await renderJWOutward();
  setTimeout(() => document.getElementById('batchBunkarInput')?.focus(), 50);
}

function removeBatchRow(idx) {
  syncBatchMeta(); jwState.batchRows.splice(idx, 1); renderJWOutward();
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
    const totalQty = jwState.batchRows.reduce((s, r) => s + r.qty, 0);
    if (jwState.worker.id && (m.transport || m.destination)) {
      await dbPut('jobWorkers', { ...jwState.worker, transport: m.transport || jwState.worker.transport || '', city: m.destination || jwState.worker.city || '' });
    }
    const record = {
      direction: 'OUT', jobWorkType: jwTypeUpper, workerName, workerPhone: jwState.worker.phone || '', workerAddress: jwState.worker.address || '',
      firmId: m.firmId, jobWorkNo: m.jobWorkNo, transport: m.transport, destination: m.destination,
      qty: totalQty, batchItems: jwState.batchRows, date: m.date, note: m.note, createdAt: jwState.origCreatedAt || Date.now()
    };
    if (jwState.editId) record.id = jwState.editId;
    const ledgerId = await dbPut('jobWorkLedger', record);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    const wasEdit = !!jwState.editId;
    if (confirm(`📤 Job Work #${m.jobWorkNo} (${totalQty} Pcs) ${wasEdit ? 'Update' : 'Save'} ho gaya!\nKya abhi Half-A4 (A5) Bill Print karna hai?`)) await printJobWorkBill(ledgerId);
    if (wasEdit) { jwState.step = 'PASSBOOK'; jwState.editId = null; jwState.origQtyMap = {}; jwState.meta = null; }
    else { jwState = { step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null, editId: null, origCreatedAt: null, origQtyMap: {} }; }
    renderJWOutward();
  } catch (err) { alert('Save Error: ' + err.message); }
}

async function printJobWorkBill(ledgerId) {
  const l = await dbGet('jobWorkLedger', ledgerId);
  if (!l) return;
  const firm = (l.firmId ? await dbGet('firms', Number(l.firmId)) : null) || (await dbGetAll('firms'))[0] || { name: 'SimpliTex Firm', address: '', phone: '' };
  ensureJWPrintSetup('@media print { @page { size: A5 landscape; margin: 6mm; } body { margin: 0; } }');
  const items = Array.isArray(l.batchItems) ? l.batchItems : [];
  document.getElementById('simplitexPrintRoot').innerHTML = `
    <div style="font-family:Arial,sans-serif; width:100%; max-width:196mm; margin:0 auto; color:#000;">
      <table style="width:100%; border-collapse:collapse; border:1.5px solid #000; font-size:11.5px;">
        <tr>
          <td style="width:55%; vertical-align:top; padding:0; border:1px solid #000;">
            <div style="padding:6px 8px; border-bottom:1px solid #000;"><div style="font-size:14px; font-weight:800;">${esc(firm.name)}</div><div>${esc(firm.address || '')}</div>${firm.phone ? `<div>Mob. No. ${esc(firm.phone)}</div>` : ''}${firm.gstin ? `<div>GSTIN: ${esc(firm.gstin)}</div>` : ''}</div>
            <div style="padding:6px 8px;"><div style="font-size:13px; font-weight:800;">${esc(l.workerName)}</div><div>${esc(l.workerAddress || l.destination || '')}</div>${l.workerPhone ? `<div>Contact: ${esc(l.workerPhone)}</div>` : ''}</div>
          </td>
          <td style="width:45%; vertical-align:top; padding:0; border:1px solid #000;">
            <table style="width:100%; border-collapse:collapse; height:100%; font-size:11.5px;">
              <tr>
                <td style="width:50%; border-bottom:1px solid #000; border-right:1px solid #000; padding:6px;"><div style="font-size:10px;">JOB WORK NO.</div><div style="font-weight:800; font-size:13px; margin-top:2px;">${esc(l.jobWorkNo || l.id)}</div></td>
                <td style="width:50%; border-bottom:1px solid #000; padding:6px;"><div style="font-size:10px;">Dated</div><div style="font-weight:800; font-size:13px; margin-top:2px;">${esc(formatDMY(l.date))}</div></td>
              </tr>
              <tr>
                <td style="border-right:1px solid #000; padding:6px; vertical-align:top;"><div style="font-size:10px;">Dispatched through</div><div style="font-weight:800; margin-top:3px;">${esc(l.transport || '-')}</div></td>
                <td style="padding:6px; vertical-align:top;"><div style="font-size:10px;">Destination</div><div style="font-weight:800; margin-top:3px;">${esc(l.destination || '-')}</div></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; border:1.5px solid #000; border-top:none; font-size:12px;">
        <thead><tr><th style="width:10%; border:1px solid #000; padding:5px; text-align:center;">Sl<br/>No.</th><th style="width:72%; border:1px solid #000; padding:5px; text-align:center;">Description of Goods</th><th style="width:18%; border:1px solid #000; padding:5px; text-align:center;">QUANTITY</th></tr></thead>
        <tbody>${items.map((it, i) => `<tr><td style="border:1px solid #000; padding:4px 6px; text-align:center;">${i + 1}</td><td style="border:1px solid #000; padding:4px 8px; text-align:center; font-weight:700;">${esc(it.bunkarName === _JW_POOL ? 'JOB WORK POOL' : it.bunkarName)}</td><td style="border:1px solid #000; padding:4px 8px; text-align:center; font-weight:700;">${it.qty}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td style="border:1px solid #000; padding:5px;"></td><td style="border:1px solid #000; padding:5px 12px; text-align:right; font-weight:800;">TOTAL</td><td style="border:1px solid #000; padding:5px; text-align:center; font-weight:800; font-size:13px;">${l.qty}</td></tr></tfoot>
      </table>
      ${l.note ? `<div style="text-align:center; font-weight:900; font-size:15px; margin-top:7px; letter-spacing:0.6px; text-transform:uppercase;">${esc(l.note)}</div>` : ''}
    </div>`;
  setTimeout(() => window.print(), 150);
}

// === MODULE 2: STOCK INWARD ===
async function renderStockInward() {
  await openDB();
  const box = document.getElementById('tab-inward');

  if (inState.step === 'MENU') {
    const inCount = await countInwardLedgerFast();
    box.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>2. Stock Inward — Maal Kahan se Aaya?</h2><button class="btn btn-dark btn-sm" onclick="inState.step='HISTORY'; resetPager('inwardHistPager'); renderStockInward();">📜 Poora Record (${inCount})</button></div>
        <div class="list-menu kbd-list">
          <div class="list-row kbd-active" data-key="1" onclick="inState.step='DIRECT'; inState.editId=null; inState.editOrig=null; renderStockInward();"><span>1. Direct Baithak se Aayi (Bunkar ke Naam se)</span><span class="badge">Key: 1</span></div>
          <div class="list-row" data-key="2" onclick="inState.step='JW_TYPE'; inState.editId=null; inState.editOrig=null; resetPager('inJWTypePager'); renderStockInward();"><span>2. Job Work se Wapas Aayi (Total Pcs Entry)</span><span class="badge">Key: 2</span></div>
        </div>
      </div>`;
    return;
  }

  if (inState.step === 'HISTORY') {
    const allInRaw = (typeof dbGetByIndex === 'function') ? await dbGetByIndex('jobWorkLedger', 'direction', 'IN') : (await dbGetAll('jobWorkLedger')).filter((l) => l.direction === 'IN');
    const allIn = allInRaw.sort((a, b) => b.createdAt - a.createdAt);
    box.innerHTML = `<div class="card"><div class="card-head"><h2>📜 Stock Inward Record (${allIn.length})</h2><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div><div id="inwardHistPager"></div></div>`;
    mountPagedList({
      id: 'inwardHistPager', items: allIn, perPage: 15,
      placeholder: '🔍 Date (2026-11), Bunkar, Worker ya Note search karein...',
      headHtml: '<tr><th>Date</th><th>Source</th><th>Bunkar / Worker</th><th>Pcs</th><th>Note</th><th>Action</th></tr>',
      getSearchText: (l) => `${l.date} ${l.jobWorkType} ${l.bunkarName || ''} ${l.workerName || ''} ${l.note || ''}`,
      renderRow: (l) => {
        const isDirect = l.jobWorkType === 'DIRECT_BAITHAK';
        return `<tr>
          <td style="white-space:nowrap;">${esc(l.date)}</td>
          <td><b>${isDirect ? '🏠 Direct Baithak' : '🧵 ' + esc(l.jobWorkType)}</b></td>
          <td><b>${esc(isDirect ? l.bunkarName : l.workerName)}</b></td>
          <td><b style="color:#15803d;">+${l.qty}</b></td>
          <td><small>${esc(l.note || '-')}</small></td>
          <td style="white-space:nowrap;"><button class="btn btn-light btn-sm" onclick="editLedgerIn(${l.id}, 'INWARD_HIST')">✏️ Edit</button> <button class="btn btn-danger btn-sm" onclick="reverseLedgerEntry(${l.id}, 'INWARD_HIST')">↩️ Del</button></td>
        </tr>`;
      },
      emptyHtml: '<tr><td colspan="6">Koi record nahi mila</td></tr>'
    });
    return;
  }

  if (inState.step === 'DIRECT') {
    const names = (await dbGetAll('bunkarStock')).filter((s) => s.bunkarName !== _JW_POOL);
    const orig = inState.editOrig, isEdit = !!inState.editId;
    box.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>${isEdit ? '✏️ Edit Direct Baithak Inward' : 'Direct Baithak se Stock Inward'}</h2><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div>
        <div class="grid-2" style="align-items:start;">
          <div><label>Date</label><input type="date" id="dirDate" value="${esc(orig ? orig.date : todayISO())}" /></div>
          <div><label>Saree (Bunkar ka Naam) *</label><input id="dirBunkar" list="dirBunkarList" value="${esc(orig ? orig.bunkarName : '')}" placeholder="e.g. FARHAN" /><datalist id="dirBunkarList">${names.map((n) => `<option value="${esc(n.bunkarName)}">`).join('')}</datalist></div>
          <div><label>Quantity (Pcs) *</label><input type="number" id="dirQty" min="1" value="${orig ? orig.qty : ''}" placeholder="e.g. 50" /></div>
          <div><label>Note (Optional)</label><input id="dirNote" value="${esc(orig ? (orig.note || '') : '')}" placeholder="e.g. Kora maal" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveDirectInward(); }" /></div>
        </div>
        <button class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%;" onclick="saveDirectInward()">${isEdit ? '✅ Update Direct Inward & Sync Stock (Ctrl+S)' : '✅ Save Direct Inward (Ctrl+S)'}</button>
      </div>`;
    setTimeout(() => document.getElementById('dirBunkar')?.focus(), 50);
    return;
  }

  if (inState.step === 'JW_TYPE') {
    const types = await dbGetAll('jobWorkTypes');
    box.innerHTML = `<div class="card"><div class="card-head"><h2>Job Work Wapsi — Kaam Chunein</h2><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div><div id="inJWTypePager"></div></div>`;
    mountPagedList({
      id: 'inJWTypePager', mode: 'list', items: types, perPage: 15, placeholder: '🔍 Job Work search karein...',
      getSearchText: (t) => t.name,
      renderRow: (t, gIdx, pageIdx) => `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="inState.jwType='${esc(t.name)}'; inState.step='JW_WORKER'; resetPager('inWorkerPager'); renderStockInward();"><span>${gIdx + 1}. ${esc(t.name)}</span><span class="badge">Enter →</span></div>`
    });
    return;
  }

  if (inState.step === 'JW_WORKER') {
    const workers = (await dbGetAll('jobWorkers')).filter((w) => !w.jobWorkType || w.jobWorkType.toUpperCase() === inState.jwType.toUpperCase());
    const pendList = await dbGetAll('jobWorkPending');
    box.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>${esc(inState.jwType)} Wapsi — Worker Chunein</h2><div><button class="btn btn-success btn-sm" onclick="showAddWorkerModal('in')">+ Naya Worker</button><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div></div>
        <div id="addWorkerInlineIn" class="hidden" style="background:#f9fafb; border:1px solid #d1d5db; padding:12px; border-radius:8px; margin-bottom:12px;">
          <input type="hidden" id="editWorkerIdIn" value="" />
          <div class="grid-2" style="align-items:start;">
            <div><label>Worker Naam *</label><input id="newWNameIn" placeholder="e.g. G.K. Fabrics" /></div>
            <div><label>Mobile No.</label><input id="newWPhoneIn" type="tel" /></div>
            <div><label>Address</label><input id="newWAddrIn" /></div>
            <div><label style="visibility:hidden;">.</label><button class="btn btn-dark" style="height:40px; width:100%;" onclick="saveNewWorker('in')">Save Worker</button></div>
          </div>
        </div>
        <div id="inWorkerPager"></div>
      </div>`;
    mountPagedList({
      id: 'inWorkerPager', mode: 'list', items: workers, perPage: 15, placeholder: '🔍 Worker search karein...',
      getSearchText: (w) => `${w.name} ${w.phone || ''} ${w.city || ''}`,
      renderRow: (w, gIdx, pageIdx) => {
        const p = pendList.find((x) => x.id === `${w.name}__${inState.jwType.toUpperCase()}`);
        const pQty = p ? p.qty : 0;
        return `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickInWorker(${w.id})"><span>${gIdx + 1}. ${esc(w.name)}</span><div style="display:flex; align-items:center; gap:6px;"><span class="badge" style="color:${pQty > 0 ? '#b91c1c' : '#15803d'};">Pending: ${pQty} Pcs</span><button type="button" class="btn btn-light btn-sm" onclick="event.stopPropagation(); editWorkerInline(${w.id}, 'in')">✏️</button></div></div>`;
      },
      emptyHtml: '<p style="color:#6b7280; font-size:13px;">Koi worker nahi mila.</p>'
    });
    return;
  }

  if (inState.step === 'JW_RETURN') {
    const jwUpper = inState.jwType.toUpperCase();
    const pend = await dbGet('jobWorkPending', `${inState.worker.name.toUpperCase()}__${jwUpper}`);
    const orig = inState.editOrig, isEdit = !!inState.editId;
    const pendQty = (pend ? pend.qty : 0) + (isEdit && orig ? (Number(orig.qty) || 0) : 0);
    box.innerHTML = `
      <div class="card">
        <div class="card-head"><h2>${isEdit ? '✏️ Edit Wapsi:' : ''} ${esc(inState.jwType)} → ${esc(inState.worker.name)} (Wapsi)</h2><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div>
        <div style="background:#fef2f2; border:1px solid #fecaca; padding:12px; border-radius:8px; margin-bottom:12px; font-size:15px;">Is Karigar par Total Pending: <b style="color:#b91c1c;">${pendQty} Pcs</b></div>
        <div class="grid-2" style="align-items:start;">
          <div><label>Date</label><input type="date" id="jwRetDate" value="${esc(orig ? orig.date : todayISO())}" /></div>
          <div><label>Total Kitni Saree Wapas Aayi (Pcs) *</label><input type="number" id="jwRetQty" min="1" value="${isEdit && orig ? orig.qty : (pendQty > 0 ? pendQty : '')}" placeholder="e.g. 93" /></div>
          <div style="grid-column: 1 / -1;"><label>Note (Optional)</label><input id="jwRetNote" value="${esc(orig ? (orig.note || '') : '')}" placeholder="e.g. Ok checked" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveJWReturnInward(); }" /></div>
        </div>
        <button class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%;" onclick="saveJWReturnInward()">${isEdit ? '✅ Update Wapsi & Sync Stock (Ctrl+S)' : '✅ Wapsi Save Karein (Pending - / Stock +)'}</button>
      </div>`;
    setTimeout(() => { const el = document.getElementById('jwRetQty'); if (el) { el.focus(); el.select(); } }, 50);
  }
}

async function editLedgerIn(id, returnTo) {
  const entry = await dbGet('jobWorkLedger', id);
  if (!entry) return;
  inState.editId = entry.id; inState.editOrig = entry; inState.returnTo = returnTo || 'INWARD_HIST';
  if (entry.jobWorkType === 'DIRECT_BAITHAK') { inState.step = 'DIRECT'; }
  else {
    const allWorkers = await dbGetAll('jobWorkers');
    inState.jwType = entry.jobWorkType;
    inState.worker = allWorkers.find((x) => x.name.toUpperCase() === entry.workerName) || { name: entry.workerName };
    inState.step = 'JW_RETURN';
  }
  switchTabSectionOnly('tab-inward'); renderStockInward();
}

async function pickInWorker(id) {
  inState.worker = await dbGet('jobWorkers', id); inState.editId = null; inState.editOrig = null; inState.step = 'JW_RETURN'; renderStockInward();
}

async function saveDirectInward() {
  try {
    const date = document.getElementById('dirDate').value || todayISO();
    const bunkarName = document.getElementById('dirBunkar').value.trim().toUpperCase();
    const qty = parseInt(document.getElementById('dirQty').value, 10);
    const note = document.getElementById('dirNote').value.trim();
    if (!bunkarName) return alert('Bunkar ka naam daalein!');
    if (!qty || qty <= 0) return alert('Sahi Pcs daalein!');
    const record = { direction: 'IN', jobWorkType: 'DIRECT_BAITHAK', workerName: 'DIRECT BAITHAK', bunkarName, qty, date, note, createdAt: inState.editOrig ? inState.editOrig.createdAt : Date.now() };
    if (inState.editId) record.id = inState.editId;
    await dbPut('jobWorkLedger', record);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    if (inState.editId) {
      alert(`✅ ${bunkarName} (${qty} Pcs) Update ho gayi!`);
      inState.editId = null; inState.editOrig = null; inState.step = 'HISTORY'; renderStockInward(); return;
    }
    alert(`✅ ${bunkarName} ki ${qty} saree Dukan Stock me jud gayi!`);
    document.getElementById('dirBunkar').value = ''; document.getElementById('dirQty').value = ''; document.getElementById('dirNote').value = ''; document.getElementById('dirBunkar').focus();
  } catch (err) { alert('Save Error: ' + err.message); }
}

async function saveJWReturnInward() {
  try {
    const date = document.getElementById('jwRetDate').value || todayISO();
    const qty = parseInt(document.getElementById('jwRetQty').value, 10);
    const note = document.getElementById('jwRetNote').value.trim();
    const jwUpper = inState.jwType.toUpperCase(), workerName = inState.worker.name.toUpperCase();
    if (!qty || qty <= 0) return alert('Sahi Quantity daalein!');
    const pend = await dbGet('jobWorkPending', `${workerName}__${jwUpper}`);
    const isEdit = !!inState.editId;
    const pendQty = (pend ? pend.qty : 0) + (isEdit && inState.editOrig ? (Number(inState.editOrig.qty) || 0) : 0);
    if (qty > pendQty && !confirm(`${workerName} par sirf ${pendQty} Pcs pending hai. Phir bhi ${qty} Pcs wapsi enter karna hai?`)) return;
    const record = { direction: 'IN', jobWorkType: jwUpper, workerName, qty, date, note, createdAt: inState.editOrig ? inState.editOrig.createdAt : Date.now() };
    if (inState.editId) record.id = inState.editId;
    await dbPut('jobWorkLedger', record);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    alert(`✅ ${workerName} se ${qty} Pcs wapsi ${isEdit ? 'Update' : 'Save'} ho gayi! (Baki Pending: ${Math.max(0, pendQty - qty)} Pcs)`);
    const retTarget = inState.returnTo;
    inState.editId = null; inState.editOrig = null; inState.returnTo = '';
    if (retTarget === 'PASSBOOK') { switchTabSectionOnly('tab-jobwork'); renderJWOutward(); }
    else if (isEdit) { inState.step = 'HISTORY'; renderStockInward(); }
    else { inState = { step: 'MENU', jwType: '', worker: null, editId: null, editOrig: null, returnTo: '' }; renderStockInward(); }
  } catch (err) { alert('Save Error: ' + err.message); }
}

async function reverseLedgerEntry(id, returnTo) {
  try {
    const entry = await dbGet('jobWorkLedger', id);
    if (!entry) return;
    if (!confirm(`Kya ye ${entry.date} ki (${entry.qty} Pcs) entry Delete karke Stock/Pending dobara calculate karna hai?`)) return;
    await dbDelete('jobWorkLedger', id);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    returnTo === 'PASSBOOK' ? renderJWOutward() : renderStockInward();
  } catch (err) { alert('Reverse Error: ' + err.message); }
}
