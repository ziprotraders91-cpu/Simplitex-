// === SimpliTex Module 1 & 2 v6: Pro Job Work & Stock Inward (Swarovski 6-Field/Bill+Slip + Auto-Convert + Date Lists + Progress + Delete Guard) ===

const _JW_POOL = (typeof JW_POOL_KEY !== 'undefined') ? JW_POOL_KEY : '__JW_POOL__';
let jwState = {
  step: 'TYPE',
  jwType: '',
  worker: null,
  batchRows: [],
  meta: null,
  autoJobWorkNo: null,
  editId: null,
  origCreatedAt: null,
  origQtyMap: {},
  returnStep: '',
  listFilter: { from: '', to: '', type: 'ALL', worker: 'ALL' },
  pbFilter: { from: '', to: '' }
};
let inState = {
  step: 'MENU',
  jwType: '',
  worker: null,
  editId: null,
  editOrig: null,
  returnTo: '',
  histFilter: { from: '', to: '', source: 'ALL' }
};

function jwNotify(msg, type = 'info') {
  if (typeof window.stxToast === 'function') window.stxToast(msg, type);
  else alert(msg);
}

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

function isSwarovskiType(t) {
  const u = String(t || '').toUpperCase();
  return u.includes('SWAR') || u.includes('SIRO');
}

function getKarigarDesignMapClean() {
  try {
    const raw = JSON.parse(localStorage.getItem('simplitex_karigar_design_map') || '{}');
    const out = {};
    Object.keys(raw || {}).forEach((k) => {
      const v = raw[k];
      if (!v) return;
      if (typeof v === 'string') {
        out[k.toUpperCase()] = { designName: v.toUpperCase(), specLine: '', auto: true };
      } else if (typeof v === 'object' && v.designName) {
        out[k.toUpperCase()] = {
          designName: String(v.designName).toUpperCase(),
          specLine: String(v.specLine || '').toUpperCase(),
          auto: v.auto !== false
        };
      }
    });
    return out;
  } catch (_) {
    return {};
  }
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

function inDateRange(dateStr, from, to) {
  const d = String(dateStr || '');
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function renderProgressHtml(okQty, dmgQty, totalQty) {
  const tot = Math.max(1, Number(totalQty) || 0);
  const ok = Math.max(0, Number(okQty) || 0);
  const dmg = Math.max(0, Number(dmgQty) || 0);
  const done = Math.min(tot, ok + dmg);
  const pct = Math.round((done / tot) * 100);
  const pend = Math.max(0, tot - done);
  const isDone = pend === 0;
  const pillCls = isDone ? 'stx-pill-ok' : (done > 0 ? 'stx-pill-warn' : 'stx-pill-info');
  const pillTxt = isDone ? '✅ Complete' : (done > 0 ? `⏳ ${pend} Baki` : `📤 ${pend} Pending`);
  const fillCls = isDone ? 'done' : (done > 0 ? 'warn' : '');

  return `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:11.5px;">
        <span><b>${done}/${tot}</b>${dmg > 0 ? ` <small style="color:#dc2626;">(${dmg} Dmg)</small>` : ''}</span>
        <span class="stx-pill ${pillCls}">${pillTxt}</span>
      </div>
      <div class="stx-prog-wrap"><div class="stx-prog-fill ${fillCls}" style="width:${pct}%;"></div></div>
    </div>
  `;
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
  if (!db || typeof db.transaction !== 'function') {
    const all = await dbGetAll('jobWorkLedger');
    let maxNo = 0;
    for (const v of all) {
      if (v && v.direction === 'OUT') {
        const n = Number(v.jobWorkNo) || 0;
        if (n > maxNo) maxNo = n;
      }
    }
    return maxNo + 1;
  }

  return new Promise((resolve) => {
    const tx = db.transaction('jobWorkLedger', 'readonly');
    const store = tx.objectStore('jobWorkLedger');
    let maxNo = 0, outFound = 0;
    const req = store.openCursor(null, 'prev');
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur || outFound >= 25) return resolve(maxNo + 1);
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
  if (!db || typeof db.transaction !== 'function') {
    const ins = await dbGetByIndex('jobWorkLedger', 'direction', 'IN');
    return ins.length;
  }

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

const _prevTabHookInw = window.onTabChanged;
window.onTabChanged = function (tabId) {
  if (_prevTabHookInw) _prevTabHookInw(tabId);
  if (tabId === 'tab-jobwork') {
    jwState.step = 'TYPE';
    jwState.jwType = '';
    jwState.worker = null;
    jwState.batchRows = [];
    jwState.meta = null;
    jwState.autoJobWorkNo = null;
    jwState.editId = null;
    jwState.origCreatedAt = null;
    jwState.origQtyMap = {};
    jwState.returnStep = '';
    resetPager('jwTypePager');
    renderJWOutward();
  } else if (tabId === 'tab-inward') {
    inState.step = 'MENU';
    inState.jwType = '';
    inState.worker = null;
    inState.editId = null;
    inState.editOrig = null;
    inState.returnTo = '';
    renderStockInward();
  }
};

const _prevEscHookInw = window.handleModuleEscape;
window.handleModuleEscape = function () {
  if (_prevEscHookInw && _prevEscHookInw()) return true;
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (!sec) return false;
  if (sec.id === 'tab-jobwork') {
    if (jwState.step === 'BATCH') {
      const target = jwState.returnStep || 'WORKER';
      jwState.step = target;
      jwState.meta = null;
      jwState.autoJobWorkNo = null;
      jwState.editId = null;
      jwState.origQtyMap = {};
      jwState.returnStep = '';
      if (target === 'WORKER') jwState.worker = null;
      renderJWOutward();
      return true;
    }
    if (jwState.step === 'PASSBOOK') {
      jwState.step = 'WORKER';
      jwState.worker = null;
      renderJWOutward();
      return true;
    }
    if (jwState.step === 'OUT_LIST' || jwState.step === 'WORKER') {
      jwState.step = 'TYPE';
      jwState.jwType = '';
      renderJWOutward();
      return true;
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
function buildWorkerFormHtml(jwType, pfx) {
  const isSwar = isSwarovskiType(jwType);
  if (isSwar) {
    return `
      <input type="hidden" id="editWorkerId${pfx}" value="" />
      <div style="font-size:12px; font-weight:700; color:#1e3a8a; margin-bottom:8px;">
        💎 Swarovski Worker — Complete 6 Details
      </div>
      <div class="grid-2" style="align-items:start;">
        <div><label>1. Name *</label><input id="newWName${pfx}" placeholder="e.g. G.K. FABRICS" /></div>
        <div><label>2. Mob. No.</label><input id="newWPhone${pfx}" type="tel" placeholder="98xxxxxxxx" /></div>
        <div><label>3. Address</label><input id="newWAddr${pfx}" placeholder="e.g. Ring Road, Surat" /></div>
        <div><label>4. City</label><input id="newWCity${pfx}" placeholder="e.g. SURAT / VARANASI" /></div>
        <div><label>5. Transport</label><input id="newWTrans${pfx}" placeholder="e.g. Kashi Express" /></div>
        <div><label>6. GSTIN</label><input id="newWGst${pfx}" placeholder="e.g. 24AA..." /></div>
      </div>
      <button type="button" class="btn btn-dark" style="margin-top:10px; width:100%; height:42px;" onclick="saveNewWorker('${pfx === 'Out' ? 'out' : 'in'}')">✅ Save Swarovski Worker</button>
    `;
  }
  return `
    <input type="hidden" id="editWorkerId${pfx}" value="" />
    <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:8px;">
      🧵 ${esc(jwType)} Worker — Sirf 3 Details (Name, Mob, Address)
    </div>
    <div class="grid-2" style="align-items:start;">
      <div><label>1. Name *</label><input id="newWName${pfx}" placeholder="e.g. RAJU CUTTING" /></div>
      <div><label>2. Mob. No.</label><input id="newWPhone${pfx}" type="tel" placeholder="98xxxxxxxx" /></div>
      <div><label>3. Address</label><input id="newWAddr${pfx}" placeholder="e.g. Sadar Chowk, Mau" /></div>
      <div><label style="visibility:hidden;">.</label><button type="button" class="btn btn-dark" style="height:42px; width:100%;" onclick="saveNewWorker('${pfx === 'Out' ? 'out' : 'in'}')">✅ Save Worker</button></div>
    </div>
  `;
}

async function renderJWOutward() {
  await openDB();
  const box = document.getElementById('tab-jobwork');

  if (jwState.step === 'TYPE') {
    const types = await dbGetAll('jobWorkTypes');
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>1. Job Work Outward — Kaam Chunein</h2>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-light btn-sm" onclick="jwState.step='OUT_LIST'; resetPager('jwOutListPager'); renderJWOutward();">📋 Outward List (Date Filter)</button>
            <button class="btn btn-dark btn-sm" onclick="addJobWorkTypePrompt('out')">+ Naya Job Work</button>
          </div>
        </div>
        <div id="jwTypePager"></div>
      </div>`;
    mountPagedList({
      id: 'jwTypePager', mode: 'list', items: types, perPage: 15,
      placeholder: '🔍 Job Work search karein (Cutting, Calender, Embroidery, Jhalar, Swarovski)...',
      getSearchText: (t) => t.name,
      renderRow: (t, gIdx, pageIdx) => `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickOutJWType('${esc(t.name)}')"><span>${gIdx + 1}. ${esc(t.name)} ${isSwarovskiType(t.name) ? '<small style="color:#2563eb; font-weight:700;">(Bill + Slip)</small>' : ''}</span><span class="badge">Enter →</span></div>`
    });
    return;
  }

  if (jwState.step === 'OUT_LIST') {
    const allLedger = await dbGetAll('jobWorkLedger');
    const types = await dbGetAll('jobWorkTypes');
    const workers = await dbGetAll('jobWorkers');
    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { outProgressMap: {} };
    const progMap = analytics.outProgressMap || {};

    const outAll = allLedger
      .filter((l) => l.direction === 'OUT')
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    const f = jwState.listFilter;
    const filtered = outAll.filter((l) => {
      if (!inDateRange(l.date, f.from, f.to)) return false;
      if (f.type !== 'ALL' && String(l.jobWorkType || '').toUpperCase() !== f.type) return false;
      if (f.worker !== 'ALL' && String(l.workerName || '').toUpperCase() !== f.worker) return false;
      return true;
    });

    let sumSent = 0, sumOk = 0, sumDmg = 0, sumPend = 0;
    filtered.forEach((l) => {
      const p = progMap[l.id] || { totalQty: Number(l.qty) || 0, okQty: 0, damageQty: 0, pendingQty: Number(l.qty) || 0 };
      sumSent += p.totalQty;
      sumOk += p.okQty;
      sumDmg += p.damageQty;
      sumPend += p.pendingQty;
    });

    const workerNames = Array.from(new Set(outAll.map((l) => String(l.workerName || '').toUpperCase()).filter(Boolean))).sort();

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📋 Job Work Outward List (Kiski Saree Kahan Gayi)</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div class="stx-filter-bar">
          <div class="stx-f-item">
            <label>From Date</label>
            <input type="date" id="jwOutFrom" value="${esc(f.from)}" onchange="jwState.listFilter.from=this.value; resetPager('jwOutListPager'); renderJWOutward();" />
          </div>
          <div class="stx-f-item">
            <label>To Date</label>
            <input type="date" id="jwOutTo" value="${esc(f.to)}" onchange="jwState.listFilter.to=this.value; resetPager('jwOutListPager'); renderJWOutward();" />
          </div>
          <div class="stx-f-item">
            <label>Job Work Type</label>
            <select onchange="jwState.listFilter.type=this.value; resetPager('jwOutListPager'); renderJWOutward();">
              <option value="ALL">Sabhi Kaam</option>
              ${types.map((t) => `<option value="${esc(t.name.toUpperCase())}" ${f.type === t.name.toUpperCase() ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
          </div>
          <div class="stx-f-item">
            <label>Worker (Kahan Gayi)</label>
            <select onchange="jwState.listFilter.worker=this.value; resetPager('jwOutListPager'); renderJWOutward();">
              <option value="ALL">Sabhi Workers</option>
              ${workerNames.map((wn) => `<option value="${esc(wn)}" ${f.worker === wn ? 'selected' : ''}>${esc(wn)}</option>`).join('')}
            </select>
          </div>
          <button type="button" class="btn btn-light btn-sm" onclick="jwState.listFilter={from:'',to:'',type:'ALL',worker:'ALL'}; resetPager('jwOutListPager'); renderJWOutward();">Clear Filter</button>
        </div>

        <div class="stx-summary-strip">
          <div class="stx-summary-pill"><small>Total Entries</small><b>${filtered.length}</b></div>
          <div class="stx-summary-pill"><small>Total Sent</small><b style="color:#2563eb;">${sumSent} Pcs</b></div>
          <div class="stx-summary-pill"><small>Wapas OK</small><b style="color:#16a34a;">${sumOk} Pcs</b></div>
          <div class="stx-summary-pill"><small>Damage / Short</small><b style="color:#dc2626;">${sumDmg} Pcs</b></div>
          <div class="stx-summary-pill"><small>Abhi Pending</small><b style="color:#d97706;">${sumPend} Pcs</b></div>
        </div>

        <div style="font-size:12px; color:#64748b; font-weight:600; margin-bottom:8px;">
          💡 Kisi bhi entry par <b>Click</b> karne par uska poora Form khul jayega!
        </div>

        <div id="jwOutListPager"></div>
      </div>`;

    mountPagedList({
      id: 'jwOutListPager',
      items: filtered,
      perPage: 15,
      placeholder: '🔍 Date, Karigar naam, Worker, #No ya Kaam search karein...',
      headHtml: '<tr><th>Date / #</th><th>Kaam & Worker</th><th>Kiski-Kiski Saree Gayi (Karigar)</th><th>Wapsi Progress</th><th>Action</th></tr>',
      getSearchText: (l) => `${l.date} ${l.jobWorkNo || ''} ${l.jobWorkType} ${l.workerName} ${(l.batchItems || []).map((b) => b.bunkarName).join(' ')} ${l.note || ''}`,
      renderRow: (l) => {
        const isSwar = isSwarovskiType(l.jobWorkType);
        const prog = progMap[l.id] || { totalQty: Number(l.qty) || 0, okQty: 0, damageQty: 0, pendingQty: Number(l.qty) || 0 };
        const karigarsTxt = (l.batchItems || []).map((b) => `<b>${esc(b.bunkarName === _JW_POOL ? 'POOL' : b.bunkarName)}</b> (${b.qty})`).join(', ');
        return `
          <tr class="stx-row-click" onclick="editLedgerOut(${l.id}, 'OUT_LIST')">
            <td style="white-space:nowrap;"><b>${esc(l.date)}</b>${l.jobWorkNo ? `<br/><small style="color:#64748b;">#${esc(l.jobWorkNo)}</small>` : ''}</td>
            <td><span class="stx-pill stx-pill-info">${esc(l.jobWorkType)}</span><br/><b>${esc(l.workerName)}</b>${l.destination ? `<br/><small style="color:#64748b;">${esc(l.destination)}</small>` : ''}</td>
            <td><small>${karigarsTxt || '-'}</small>${l.note ? `<br/><small style="color:#64748b;">Kaam: ${esc(l.note)}</small>` : ''}</td>
            <td style="min-width:155px;">${renderProgressHtml(prog.okQty, prog.damageQty, prog.totalQty)}</td>
            <td style="white-space:nowrap;" onclick="event.stopPropagation()">
              ${isSwar ? `<button class="btn btn-dark btn-sm" title="A5 Bill" onclick="printJobWorkBill(${l.id})">🖨️ Bill</button> <button class="btn btn-success btn-sm" title="Packing Slip" onclick="printJobWorkPackingSlip(${l.id})">📦 Slip</button>` : ''}
              <button class="btn btn-light btn-sm" title="Edit Form" onclick="editLedgerOut(${l.id}, 'OUT_LIST')">✏️</button>
              <button class="btn btn-danger btn-sm" title="Delete" onclick="reverseLedgerEntry(${l.id}, 'OUT_LIST')">🗑️</button>
            </td>
          </tr>`;
      },
      emptyHtml: '<tr><td colspan="5">Selected filter me koi Job Work Outward record nahi mila</td></tr>'
    });
    return;
  }

  if (jwState.step === 'WORKER') {
    const allWorkers = await dbGetAll('jobWorkers');
    const workers = allWorkers.filter((w) => !w.jobWorkType || w.jobWorkType.toUpperCase() === jwState.jwType.toUpperCase());
    const pendList = await dbGetAll('jobWorkPending');
    const isSwar = isSwarovskiType(jwState.jwType);

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${esc(jwState.jwType)} — Worker Chunein</h2>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-light btn-sm" onclick="jwState.listFilter.type='${esc(jwState.jwType.toUpperCase())}'; jwState.step='OUT_LIST'; resetPager('jwOutListPager'); renderJWOutward();">📋 Outward List</button>
            <button class="btn btn-success btn-sm" onclick="showAddWorkerModal('out')">+ Naya Worker</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        <div id="addWorkerInlineOut" class="stx-subpanel hidden">
          ${buildWorkerFormHtml(jwState.jwType, 'Out')}
        </div>
        <div id="jwWorkerPager"></div>
      </div>`;
    mountPagedList({
      id: 'jwWorkerPager', mode: 'list', items: workers, perPage: 15,
      placeholder: '🔍 Worker naam, mobile ya city search karein...',
      getSearchText: (w) => `${w.name} ${w.phone || ''} ${w.city || ''} ${w.address || ''} ${w.gstin || ''}`,
      renderRow: (w, gIdx, pageIdx) => {
        const p = pendList.find((x) => x.id === `${w.name}__${jwState.jwType.toUpperCase()}`);
        const pQty = p ? p.qty : 0;
        const subInfo = isSwar
          ? `${w.phone || ''} ${w.city ? '• ' + w.city : ''} ${w.transport ? '• ' + w.transport : ''} ${w.gstin ? '• GST: ' + w.gstin : ''}`
          : `${w.phone || ''} ${w.address ? '• ' + w.address : ''}`;
        return `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickOutWorker(${w.id})">
          <div><div>${gIdx + 1}. ${esc(w.name)}</div><small style="color:#64748b; font-weight:500;">${esc(subInfo.trim())}</small></div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="badge" style="color:${pQty > 0 ? '#dc2626' : '#16a34a'};">Pending: ${pQty}</span>
            <button type="button" class="btn btn-light btn-sm" title="Edit Worker" onclick="event.stopPropagation(); editWorkerInline(${w.id}, 'out')">✏️</button>
            <button type="button" class="btn btn-light btn-sm" title="Worker Khata" onclick="event.stopPropagation(); openWorkerPassbook(${w.id})">📜 Khata</button>
          </div></div>`;
      },
      emptyHtml: '<p style="color:#64748b; font-size:13px;">Koi worker nahi mila. Upar "+ Naya Worker" dabaa kar jodein.</p>'
    });
    return;
  }

  if (jwState.step === 'PASSBOOK') {
    const jwUpper = jwState.jwType.toUpperCase();
    const wName = jwState.worker.name.toUpperCase();
    const isSwar = isSwarovskiType(jwUpper);
    const rawWorkerLedger = (typeof dbGetByIndex === 'function')
      ? await dbGetByIndex('jobWorkLedger', 'workerName', wName)
      : (await dbGetAll('jobWorkLedger')).filter((l) => l.workerName === wName);
    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { outProgressMap: {}, inAllocMap: {} };
    const progMap = analytics.outProgressMap || {};
    const allocMap = analytics.inAllocMap || {};

    const pbf = jwState.pbFilter;
    const ledger = rawWorkerLedger
      .filter((l) => l.jobWorkType === jwUpper && inDateRange(l.date, pbf.from, pbf.to))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    const pend = await dbGet('jobWorkPending', `${wName}__${jwUpper}`);

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 ${esc(wName)} (${esc(jwState.jwType)}) — Poora Khata</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>
        <div class="stx-filter-bar">
          <div class="stx-f-item"><label>From Date</label><input type="date" value="${esc(pbf.from)}" onchange="jwState.pbFilter.from=this.value; resetPager('jwPassbookPager'); renderJWOutward();" /></div>
          <div class="stx-f-item"><label>To Date</label><input type="date" value="${esc(pbf.to)}" onchange="jwState.pbFilter.to=this.value; resetPager('jwPassbookPager'); renderJWOutward();" /></div>
          <button type="button" class="btn btn-light btn-sm" onclick="jwState.pbFilter={from:'',to:''}; resetPager('jwPassbookPager'); renderJWOutward();">Clear</button>
          <div style="margin-left:auto; background:#fef2f2; border:1px solid #fecaca; padding:7px 12px; border-radius:8px; font-size:13px;">
            Total Pending: <b style="color:#dc2626; font-size:15px;">${pend ? pend.qty : 0} Pcs</b>
          </div>
        </div>
        <div id="jwPassbookPager"></div>
      </div>`;
    mountPagedList({
      id: 'jwPassbookPager', items: ledger, perPage: 15,
      placeholder: '🔍 Date, Karigar, Bill No. ya Kaam search karein...',
      headHtml: '<tr><th>Date / No.</th><th>Kaam</th><th>Karigar Detail</th><th>Pcs / Progress</th><th>Kya Kaam Hoga</th><th>Action</th></tr>',
      getSearchText: (l) => `${l.date} ${l.jobWorkNo || ''} ${l.direction} ${Array.isArray(l.batchItems) ? l.batchItems.map((b) => b.bunkarName).join(' ') : ''} ${l.note || ''}`,
      renderRow: (l) => {
        const isOut = l.direction === 'OUT';
        const prog = isOut ? progMap[l.id] : null;
        const allocs = !isOut ? (allocMap[l.id] || []) : [];
        const detail = isOut && Array.isArray(l.batchItems)
          ? l.batchItems.map((b) => `${b.bunkarName === _JW_POOL ? 'POOL' : b.bunkarName} (${b.qty})`).join(', ')
          : (allocs.length ? allocs.map((a) => `${a.bunkarName === _JW_POOL ? 'POOL' : a.bunkarName} (${a.qty})`).join(', ') : 'Wapsi Entry');
        const dmg = Number(l.damageQty) || 0;
        const clickFn = isOut ? `editLedgerOut(${l.id}, 'PASSBOOK')` : `editLedgerIn(${l.id}, 'PASSBOOK')`;
        return `<tr class="stx-row-click" onclick="${clickFn}">
          <td style="white-space:nowrap;">${esc(l.date)}${l.jobWorkNo ? `<br/><small style="color:#64748b;">#${esc(l.jobWorkNo)}</small>` : ''}</td>
          <td><b style="color:${isOut ? '#2563eb' : '#16a34a'};">${isOut ? '📤 Bheja' : '📥 Wapas'}</b></td>
          <td><small>${esc(detail)}</small></td>
          <td style="min-width:140px;">${isOut && prog ? renderProgressHtml(prog.okQty, prog.damageQty, prog.totalQty) : `<b style="color:#16a34a;">+${l.qty} Pcs</b>${dmg > 0 ? ` <small style="color:#dc2626;">(${dmg} Dmg)</small>` : ''}`}</td>
          <td><small><b>${esc(l.note || '-')}</b></small></td>
          <td style="white-space:nowrap;" onclick="event.stopPropagation()">
            ${isOut && isSwar ? `<button class="btn btn-dark btn-sm" title="A5 Bill" onclick="printJobWorkBill(${l.id})">🖨️ Bill</button> <button class="btn btn-success btn-sm" title="Packing Slip" onclick="printJobWorkPackingSlip(${l.id})">📦 Slip</button>` : ''}
            <button class="btn btn-light btn-sm" title="Edit" onclick="${clickFn}">✏️</button>
            <button class="btn btn-danger btn-sm" title="Delete" onclick="reverseLedgerEntry(${l.id}, 'PASSBOOK')">🗑️</button>
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
    const isSwar = isSwarovskiType(jwState.jwType);

    if (!jwState.meta) {
      const nextJWNo = await getNextJobWorkNoFast();
      jwState.autoJobWorkNo = String(nextJWNo);
      jwState.meta = {
        firmId: firms.length ? firms[0].id : '',
        jobWorkNo: nextJWNo,
        date: todayISO(),
        transport: jwState.worker.transport || '',
        destination: jwState.worker.city || '',
        workerGstin: jwState.worker.gstin || '',
        note: ''
      };
    }
    const m = jwState.meta;
    const totalBatch = jwState.batchRows.reduce((s, r) => s + r.qty, 0);
    const isEdit = !!jwState.editId;

    const metaGridHtml = isSwar
      ? `
        <div class="grid-2" style="align-items:start;">
          <div><label>Firm Chunein *</label><select id="batchFirmId" onchange="syncBatchMeta()">${firms.length ? firms.map((f) => `<option value="${f.id}" ${Number(m.firmId) === f.id ? 'selected' : ''}>${esc(f.name)} (${esc(f.shortCode)})</option>`).join('') : '<option value="">Settings me Firm add karein</option>'}</select></div>
          <div><label>Job Work No. *</label><input type="number" id="batchBillNo" value="${esc(m.jobWorkNo)}" onchange="syncBatchMeta()" /></div>
          <div><label>Dated *</label><input type="date" id="batchDate" value="${esc(m.date)}" onchange="syncBatchMeta()" /></div>
          <div><label>Dispatched through (Transport)</label><input id="batchTransport" value="${esc(m.transport)}" placeholder="e.g. Kashi Express" onchange="syncBatchMeta()" /></div>
          <div><label>Destination (City)</label><input id="batchDestination" value="${esc(m.destination)}" placeholder="e.g. SURAT / VARANASI" onchange="syncBatchMeta()" /></div>
          <div><label>Worker GSTIN</label><input id="batchWorkerGst" value="${esc(m.workerGstin || '')}" placeholder="e.g. 24AA..." onchange="syncBatchMeta()" /></div>
          <div style="grid-column: 1 / -1;"><label>✨ Kya Kaam / Design Hoga? *</label><input id="batchNote" list="jwWorkDetailList" value="${esc(m.note)}" placeholder="e.g. GAWATI ZARI CONTRAST ANCHAL" oninput="syncBatchMeta()" /><datalist id="jwWorkDetailList">${savedWorks.map((w) => `<option value="${esc(w)}">`).join('')}</datalist></div>
        </div>
      `
      : `
        <div class="grid-2" style="align-items:start;">
          <div><label>Dated *</label><input type="date" id="batchDate" value="${esc(m.date)}" onchange="syncBatchMeta()" /></div>
          <div><label>Slip / Ref No. *</label><input type="number" id="batchBillNo" value="${esc(m.jobWorkNo)}" onchange="syncBatchMeta()" /></div>
          <div style="grid-column: 1 / -1;"><label>✨ Kya Kaam / Design Hoga?</label><input id="batchNote" list="jwWorkDetailList" value="${esc(m.note)}" placeholder="e.g. CUTTING / JHALAR / CALENDER DETAIL" oninput="syncBatchMeta()" /><datalist id="jwWorkDetailList">${savedWorks.map((w) => `<option value="${esc(w)}">`).join('')}</datalist></div>
        </div>
      `;

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${isEdit ? '✏️ Edit Job Work' : esc(jwState.jwType)} → ${esc(jwState.worker.name)} ${isEdit ? '(#' + esc(m.jobWorkNo) + ')' : ''}</h2>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${isEdit && isSwar ? `<button class="btn btn-dark btn-sm" onclick="printJobWorkBill(${jwState.editId})">🖨️ Print Bill</button><button class="btn btn-success btn-sm" onclick="printJobWorkPackingSlip(${jwState.editId})">📦 Packing Slip</button>` : ''}
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        ${metaGridHtml}
      </div>

      <div class="card">
        <div class="card-head">
          <h2>📦 Batch Me Karigar / Bunkar Saree Jodein</h2>
          <span class="shortcut-hint">Enter = Aage</span>
        </div>
        <div class="stx-subpanel">
          <div class="grid-2" style="align-items:start;">
            <div><label>Karigar / Bunkar Naam *</label><input id="batchBunkarInput" list="batchBunkarList" placeholder="e.g. KARAN, ROHAN, FARHAN" /><datalist id="batchBunkarList">${stocks.map((s) => `<option value="${esc(s.bunkarName)}">${esc(s.bunkarName === _JW_POOL ? 'JOB WORK POOL' : s.bunkarName)} (${s.qty} Pcs)</option>`).join('')}</datalist></div>
            <div><label>Quantity (Pcs) — Enter se Add</label><input type="number" id="batchQtyInput" min="1" placeholder="e.g. 16" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); addBatchRow(); }" /></div>
          </div>
          <button type="button" class="btn btn-dark btn-sm" style="margin-top:10px;" onclick="addBatchRow()">+ Add Line</button>
        </div>

        <div style="overflow-x:auto;">
          <table><thead><tr><th>Sl No.</th><th>Karigar / Saree Name</th><th>Quantity</th><th>X</th></tr></thead>
            <tbody>${jwState.batchRows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.bunkarName === _JW_POOL ? 'JOB WORK POOL' : r.bunkarName)}</b></td><td><b>${r.qty}</b></td><td><button type="button" class="btn btn-danger btn-sm" onclick="removeBatchRow(${i})">X</button></td></tr>`).join('') || '<tr><td colspan="4" style="color:#64748b;">Abhi batch khali hai... upar se add karein</td></tr>'}</tbody>
          </table>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-top:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="font-size:18px; font-weight:800;">TOTAL: <span style="color:#2563eb;">${totalBatch} Pcs</span></div>
          <button type="button" class="btn btn-success primary-save-btn" onclick="saveBatchOutward()">
            ${isEdit ? '✅ Update Batch & Sync Stock (Ctrl+S)' : (isSwar ? '✅ Save & Print Bill / Packing Slip (Ctrl+S)' : '✅ Save Batch (Ctrl+S)')}
          </button>
        </div>
      </div>`;
    setTimeout(() => document.getElementById('batchNote')?.focus(), 50);
  }
}

function syncBatchMeta() {
  if (!jwState.meta) jwState.meta = {};
  const firmEl = document.getElementById('batchFirmId');
  const billEl = document.getElementById('batchBillNo');
  const dateEl = document.getElementById('batchDate');
  const transEl = document.getElementById('batchTransport');
  const destEl = document.getElementById('batchDestination');
  const gstEl = document.getElementById('batchWorkerGst');
  const noteEl = document.getElementById('batchNote');

  if (firmEl) jwState.meta.firmId = firmEl.value || '';
  if (billEl) jwState.meta.jobWorkNo = billEl.value || '';
  if (dateEl) jwState.meta.date = dateEl.value || todayISO();
  if (transEl) jwState.meta.transport = transEl.value.trim();
  if (destEl) jwState.meta.destination = destEl.value.trim().toUpperCase();
  if (gstEl) jwState.meta.workerGstin = gstEl.value.trim().toUpperCase();
  if (noteEl) jwState.meta.note = noteEl.value.trim().toUpperCase();
}

function pickOutJWType(name) { jwState.jwType = name; jwState.step = 'WORKER'; resetPager('jwWorkerPager'); renderJWOutward(); }
async function pickOutWorker(id) {
  jwState.worker = await dbGet('jobWorkers', id);
  jwState.batchRows = []; jwState.meta = null; jwState.autoJobWorkNo = null; jwState.editId = null; jwState.origCreatedAt = null; jwState.origQtyMap = {}; jwState.returnStep = '';
  jwState.step = 'BATCH'; renderJWOutward();
}
async function openWorkerPassbook(id) {
  jwState.worker = await dbGet('jobWorkers', id); jwState.step = 'PASSBOOK'; resetPager('jwPassbookPager'); renderJWOutward();
}

async function editLedgerOut(id, returnStep) {
  const entry = await dbGet('jobWorkLedger', id);
  if (!entry) return;
  const allWorkers = await dbGetAll('jobWorkers');
  const w = allWorkers.find((x) => x.name.toUpperCase() === entry.workerName) || {
    name: entry.workerName, phone: entry.workerPhone || '', address: entry.workerAddress || '', city: entry.destination || '', transport: entry.transport || '', gstin: entry.workerGstin || ''
  };
  const origMap = {};
  (entry.batchItems || []).forEach((r) => { origMap[r.bunkarName] = (origMap[r.bunkarName] || 0) + (Number(r.qty) || 0); });
  jwState.jwType = entry.jobWorkType;
  jwState.worker = w;
  jwState.editId = entry.id;
  jwState.origCreatedAt = entry.createdAt;
  jwState.origQtyMap = origMap;
  jwState.returnStep = returnStep || 'OUT_LIST';
  jwState.autoJobWorkNo = null;
  jwState.batchRows = (entry.batchItems || []).map((r) => ({ bunkarName: r.bunkarName, qty: Number(r.qty) || 0 }));
  jwState.meta = {
    firmId: entry.firmId || '',
    jobWorkNo: entry.jobWorkNo || '',
    date: entry.date || todayISO(),
    transport: entry.transport || '',
    destination: entry.destination || '',
    workerGstin: entry.workerGstin || w.gstin || '',
    note: entry.note || ''
  };
  jwState.step = 'BATCH';
  renderJWOutward();
}

function showAddWorkerModal(mode) {
  const pfx = mode === 'out' ? 'Out' : 'In';
  const el = document.getElementById(mode === 'out' ? 'addWorkerInlineOut' : 'addWorkerInlineIn');
  const editHid = document.getElementById('editWorkerId' + pfx);
  if (editHid) editHid.value = '';
  ['newWName', 'newWPhone', 'newWAddr', 'newWCity', 'newWTrans', 'newWGst'].forEach((f) => { const i = document.getElementById(f + pfx); if (i) i.value = ''; });
  el.classList.toggle('hidden');
  const inp = document.getElementById('newWName' + pfx);
  if (!el.classList.contains('hidden') && inp) inp.focus();
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
  if (document.getElementById('newWGst' + pfx)) document.getElementById('newWGst' + pfx).value = w.gstin || '';
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
    const gstin = (document.getElementById('newWGst' + pfx)?.value || '').trim().toUpperCase();
    const jwType = mode === 'out' ? jwState.jwType : inState.jwType;
    if (!name) return jwNotify('Worker ka naam zaroori hai!', 'warn');
    const payload = { name, phone, address, city, transport, gstin, jobWorkType: jwType.toUpperCase() };
    if (editIdVal) payload.id = Number(editIdVal);
    await dbPut('jobWorkers', payload);
    jwNotify('✅ Worker save ho gaya!', 'success');
    mode === 'out' ? renderJWOutward() : renderStockInward();
  } catch (err) { jwNotify('Save Error: ' + err.message, 'error'); }
}

async function addJobWorkTypePrompt(mode) {
  if (typeof window.stxOpenModal === 'function') {
    window.stxOpenModal({
      title: '+ Naya Job Work Add Karein',
      bodyHtml: `
        <label>Kaam ka naam likhein (e.g. Cutting, Calender, Embroidery, Jhalar, Swarovski)</label>
        <input id="stxNewJWTypeInput" placeholder="e.g. Cutting"
               onkeydown="if(event.key==='Enter'){ event.preventDefault(); document.getElementById('stxSaveJWTypeBtn')?.click(); }" />
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn-light', onClick: () => stxCloseModal() },
        {
          label: '✅ Save',
          className: 'btn btn-success',
          onClick: async () => {
            const name = document.getElementById('stxNewJWTypeInput')?.value.trim();
            if (!name) return jwNotify('Kaam ka naam likhein!', 'warn');
            await dbPut('jobWorkTypes', { name });
            stxCloseModal();
            jwNotify(`✅ "${name}" add ho gaya!`, 'success');
            mode === 'out' ? renderJWOutward() : renderStockInward();
          }
        }
      ]
    });
    setTimeout(() => {
      const btns = document.querySelectorAll('#stxModalActions button');
      if (btns[1]) btns[1].id = 'stxSaveJWTypeBtn';
      document.getElementById('stxNewJWTypeInput')?.focus();
    }, 40);
    return;
  }
  const name = prompt('Naye Job Work ka naam likhein:');
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
  if (!bunkarName) { bInput.focus(); return jwNotify('Karigar / Bunkar ka naam daalein!', 'warn'); }
  if (!qty || qty <= 0) { qInput.focus(); return jwNotify('Sahi Pcs daalein!', 'warn'); }
  const st = await dbGet('bunkarStock', bunkarName);
  const avail = (st ? st.qty : 0) + ((jwState.origQtyMap && jwState.origQtyMap[bunkarName]) || 0);
  const alreadyAdded = jwState.batchRows.filter((r) => r.bunkarName === bunkarName).reduce((s, r) => s + r.qty, 0);
  if (alreadyAdded + qty > avail) return jwNotify(`Dukan me ${bunkarName} ki sirf ${avail} saree hai!`, 'warn');
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
    if (!jwState.batchRows.length) return jwNotify('Batch khali hai! Kam se kam 1 saree add karein.', 'warn');
    const m = jwState.meta;

    if (!jwState.editId && jwState.autoJobWorkNo && String(m.jobWorkNo) === String(jwState.autoJobWorkNo)) {
      const freshNo = await getNextJobWorkNoFast();
      if (freshNo > Number(m.jobWorkNo)) m.jobWorkNo = freshNo;
    }

    if (m.note) rememberWorkDetail(m.note);
    const jwTypeUpper = jwState.jwType.toUpperCase();
    const isSwar = isSwarovskiType(jwTypeUpper);
    const workerName = jwState.worker.name.toUpperCase();
    const totalQty = jwState.batchRows.reduce((s, r) => s + r.qty, 0);

    if (isSwar && jwState.worker.id && (m.transport || m.destination || m.workerGstin)) {
      await dbPut('jobWorkers', {
        ...jwState.worker,
        transport: m.transport || jwState.worker.transport || '',
        city: m.destination || jwState.worker.city || '',
        gstin: m.workerGstin || jwState.worker.gstin || ''
      });
    }

    const record = {
      direction: 'OUT',
      jobWorkType: jwTypeUpper,
      workerName,
      workerPhone: jwState.worker.phone || '',
      workerAddress: jwState.worker.address || '',
      workerGstin: isSwar ? (m.workerGstin || jwState.worker.gstin || '') : '',
      firmId: isSwar ? m.firmId : '',
      jobWorkNo: m.jobWorkNo,
      transport: isSwar ? m.transport : '',
      destination: isSwar ? m.destination : '',
      qty: totalQty,
      batchItems: jwState.batchRows,
      date: m.date,
      note: m.note,
      createdAt: jwState.origCreatedAt || Date.now()
    };
    if (jwState.editId) record.id = jwState.editId;
    const ledgerId = await dbPut('jobWorkLedger', record);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();

    const wasEdit = !!jwState.editId;
    const retTarget = jwState.returnStep || 'PASSBOOK';
    const savedNo = m.jobWorkNo;
    if (wasEdit) {
      jwState.step = retTarget;
      jwState.editId = null; jwState.origQtyMap = {}; jwState.meta = null; jwState.autoJobWorkNo = null; jwState.returnStep = '';
    } else {
      jwState = {
        ...jwState,
        step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null, autoJobWorkNo: null, editId: null, origCreatedAt: null, origQtyMap: {}, returnStep: ''
      };
    }
    await renderJWOutward();

    // Sirf Swarovski me Bill + Packing Slip print modal khulega; baaki job work me no bill headache!
    if (isSwar && typeof window.stxOpenModal === 'function') {
      window.stxOpenModal({
        title: `💎 Swarovski #${savedNo} ${wasEdit ? 'Update' : 'Save'} Ho Gaya!`,
        bodyHtml: `<div style="font-size:14px;"><b>${esc(workerName)}</b> — <b>${totalQty} Pcs</b></div><p style="margin-top:6px;">Bill aur Packing Slip dono yahan se print kar sakte hain:</p>`,
        buttons: [
          { label: '🖨️ Print A5 Bill', className: 'btn btn-dark', onClick: () => { stxCloseModal(); printJobWorkBill(ledgerId); } },
          { label: '📦 Packing Slip', className: 'btn btn-success', onClick: () => { stxCloseModal(); printJobWorkPackingSlip(ledgerId); } },
          { label: 'Done', className: 'btn btn-light', onClick: () => stxCloseModal() }
        ]
      });
    } else {
      jwNotify(`✅ ${jwTypeUpper} (${workerName} — ${totalQty} Pcs) ${wasEdit ? 'Update' : 'Save'} ho gaya!`, 'success');
    }
  } catch (err) { jwNotify('Save Error: ' + err.message, 'error'); }
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
            <div style="padding:6px 8px;"><div style="font-size:13px; font-weight:800;">${esc(l.workerName)}</div><div>${esc(l.workerAddress || l.destination || '')}</div>${l.workerPhone ? `<div>Contact: ${esc(l.workerPhone)}</div>` : ''}${l.workerGstin ? `<div><b>GSTIN: ${esc(l.workerGstin)}</b></div>` : ''}</div>
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

async function printJobWorkPackingSlip(ledgerId) {
  const l = await dbGet('jobWorkLedger', ledgerId);
  if (!l) return;
  ensureJWPrintSetup('@media print { @page { size: A5 portrait; margin: 6mm; } body { margin: 0; } }');
  const items = Array.isArray(l.batchItems) ? l.batchItems : [];
  document.getElementById('simplitexPrintRoot').innerHTML = `
    <div style="width:100%; min-height:185mm; border:3px solid #000; padding:12px; box-sizing:border-box; font-family:Arial,sans-serif; display:flex; flex-direction:column; justify-content:space-between; color:#000;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2.5px solid #000; padding-bottom:8px;">
          <div style="font-size:19px; font-weight:900; letter-spacing:0.6px;">JOB WORK PACKING SLIP</div>
          <div style="text-align:right; font-size:13px; font-weight:800;">
            <div>JW #: ${esc(l.jobWorkNo || l.id)}</div>
            <div>Date: ${esc(formatDMY(l.date))}</div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px 0; border-bottom:2px dashed #000; font-size:13px;">
          <div><small style="font-weight:700; color:#444;">KAAM / WORK</small><br/><b style="font-size:16px;">${esc(l.jobWorkType)}</b></div>
          <div style="text-align:right;"><small style="font-weight:700; color:#444;">DESTINATION</small><br/><b style="font-size:16px;">${esc(l.destination || '-')}</b></div>
          <div><small style="font-weight:700; color:#444;">KARIGAR / WORKER</small><br/><b style="font-size:14px;">${esc(l.workerName)}</b></div>
          <div style="text-align:right;"><small style="font-weight:700; color:#444;">TRANSPORT</small><br/><b style="font-size:14px;">${esc(l.transport || '-')}</b></div>
        </div>

        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="border:1.5px solid #000; padding:6px; text-align:center; width:12%;">S.No</th>
              <th style="border:1.5px solid #000; padding:6px;">Saree / Karigar</th>
              <th style="border:1.5px solid #000; padding:6px; text-align:center; width:22%;">Qty (Pcs)</th>
              <th style="border:1.5px solid #000; padding:6px; text-align:center; width:14%;">Chk</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it, i) => `
              <tr>
                <td style="border:1.5px solid #000; padding:6px; text-align:center;">${i + 1}</td>
                <td style="border:1.5px solid #000; padding:6px; font-weight:800;">${esc(it.bunkarName === _JW_POOL ? 'JOB WORK POOL' : it.bunkarName)}</td>
                <td style="border:1.5px solid #000; padding:6px; text-align:center; font-weight:900; font-size:14px;">${it.qty}</td>
                <td style="border:1.5px solid #000; padding:6px; text-align:center;">[ &nbsp; ]</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${l.note ? `<div style="margin-top:10px; border:1.5px solid #000; padding:7px; text-align:center; font-weight:900; font-size:14px;">KAAM: ${esc(l.note)}</div>` : ''}
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:3px solid #000; padding-top:10px; margin-top:14px; font-size:19px; font-weight:900;">
        <div>TOTAL SAREE: ${l.qty} PCS</div>
        <div style="font-size:13px;">Checked By: _________</div>
      </div>
    </div>`;
  setTimeout(() => window.print(), 150);
}

// === MODULE 2: STOCK INWARD & KARIGAR-WISE JW WAPSI ===
async function renderStockInward() {
  await openDB();
  const box = document.getElementById('tab-inward');

  if (inState.step === 'MENU') {
    const inCount = await countInwardLedgerFast();
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>2. Stock Inward — Maal Kahan se Aaya?</h2>
          <button class="btn btn-dark btn-sm" onclick="inState.step='HISTORY'; resetPager('inwardHistPager'); renderStockInward();">📜 Inward / Wapsi List (${inCount})</button>
        </div>
        <div class="list-menu kbd-list">
          <div class="list-row kbd-active" data-key="1" onclick="inState.step='DIRECT'; inState.editId=null; inState.editOrig=null; renderStockInward();"><span>1. Direct Baithak se Aayi (Karigar / Bunkar ke Naam se)</span><span class="badge">Key: 1</span></div>
          <div class="list-row" data-key="2" onclick="inState.step='JW_TYPE'; inState.editId=null; inState.editOrig=null; resetPager('inJWTypePager'); renderStockInward();"><span>2. Job Work se Wapas Aayi (Total Pcs Entry + Auto Karigar & Barcode)</span><span class="badge">Key: 2</span></div>
          <div class="list-row" data-key="3" onclick="inState.step='HISTORY'; resetPager('inwardHistPager'); renderStockInward();"><span>3. 📋 Inward / Wapsi List (Date Filter & Click-to-Open)</span><span class="badge">Key: 3</span></div>
        </div>
      </div>`;
    return;
  }

  if (inState.step === 'HISTORY') {
    const allInRaw = (typeof dbGetByIndex === 'function')
      ? await dbGetByIndex('jobWorkLedger', 'direction', 'IN')
      : (await dbGetAll('jobWorkLedger')).filter((l) => l.direction === 'IN');

    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { inAllocMap: {} };
    const allocMap = analytics.inAllocMap || {};

    const hf = inState.histFilter;
    const allIn = allInRaw
      .filter((l) => {
        if (!inDateRange(l.date, hf.from, hf.to)) return false;
        const isDirect = l.jobWorkType === 'DIRECT_BAITHAK';
        if (hf.source === 'DIRECT' && !isDirect) return false;
        if (hf.source === 'JW' && isDirect) return false;
        return true;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    const sumOk = allIn.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const sumDmg = allIn.reduce((s, l) => s + (Number(l.damageQty) || 0), 0);

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 Stock Inward & Job Work Wapsi List (${allIn.length})</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div class="stx-filter-bar">
          <div class="stx-f-item"><label>From Date</label><input type="date" value="${esc(hf.from)}" onchange="inState.histFilter.from=this.value; resetPager('inwardHistPager'); renderStockInward();" /></div>
          <div class="stx-f-item"><label>To Date</label><input type="date" value="${esc(hf.to)}" onchange="inState.histFilter.to=this.value; resetPager('inwardHistPager'); renderStockInward();" /></div>
          <div class="stx-f-item">
            <label>Source Filter</label>
            <select onchange="inState.histFilter.source=this.value; resetPager('inwardHistPager'); renderStockInward();">
              <option value="ALL" ${hf.source === 'ALL' ? 'selected' : ''}>Sabhi (Baithak + JW Wapsi)</option>
              <option value="JW" ${hf.source === 'JW' ? 'selected' : ''}>Sirf Job Work Wapsi</option>
              <option value="DIRECT" ${hf.source === 'DIRECT' ? 'selected' : ''}>Sirf Direct Baithak</option>
            </select>
          </div>
          <button type="button" class="btn btn-light btn-sm" onclick="inState.histFilter={from:'',to:'',source:'ALL'}; resetPager('inwardHistPager'); renderStockInward();">Clear Filter</button>
        </div>

        <div class="stx-summary-strip">
          <div class="stx-summary-pill"><small>Total Entries</small><b>${allIn.length}</b></div>
          <div class="stx-summary-pill"><small>Total Wapas OK</small><b style="color:#16a34a;">+${sumOk} Pcs</b></div>
          <div class="stx-summary-pill"><small>Damage / Shortage</small><b style="color:#dc2626;">${sumDmg} Pcs</b></div>
        </div>

        <div style="font-size:12px; color:#64748b; font-weight:600; margin-bottom:8px;">
          💡 Kisi bhi entry par <b>Click</b> karne par uska Form khul jayega!
        </div>

        <div id="inwardHistPager"></div>
      </div>`;
    mountPagedList({
      id: 'inwardHistPager', items: allIn, perPage: 15,
      placeholder: '🔍 Date, Karigar, Worker ya Note search karein...',
      headHtml: '<tr><th>Date</th><th>Source</th><th>Karigar Breakdown</th><th>OK / Dmg</th><th>Note</th><th>Action</th></tr>',
      getSearchText: (l) => {
        const allocs = (allocMap[l.id] || []).map((a) => `${a.bunkarName} ${a.qty}`).join(' ');
        return `${l.date} ${l.jobWorkType} ${l.bunkarName || ''} ${l.workerName || ''} ${allocs} ${l.note || ''}`;
      },
      renderRow: (l) => {
        const isDirect = l.jobWorkType === 'DIRECT_BAITHAK';
        const allocs = !isDirect ? (allocMap[l.id] || []) : [];
        const karigarHtml = isDirect
          ? `<b>${esc(l.bunkarName)}</b>`
          : (allocs.length
              ? allocs.map((a) => `<b>${esc(a.bunkarName === _JW_POOL ? 'POOL' : a.bunkarName)}</b> - ${a.qty} pcs`).join(', ')
              : `<b>${esc(l.workerName)}</b>`);
        const dmg = Number(l.damageQty) || 0;
        return `<tr class="stx-row-click" onclick="editLedgerIn(${l.id}, 'INWARD_HIST')">
          <td style="white-space:nowrap;"><b>${esc(l.date)}</b></td>
          <td><b>${isDirect ? '🏠 Baithak' : '🧵 ' + esc(l.jobWorkType)}</b>${!isDirect ? `<br/><small style="color:#64748b;">${esc(l.workerName)}</small>` : ''}</td>
          <td><small>${karigarHtml}</small></td>
          <td><b style="color:#16a34a;">+${l.qty} Pcs</b>${dmg > 0 ? `<br/><small style="color:#dc2626; font-weight:700;">Dmg: ${dmg}</small>` : ''}</td>
          <td><small>${esc(l.note || '-')}</small></td>
          <td style="white-space:nowrap;" onclick="event.stopPropagation()">
            <button class="btn btn-light btn-sm" title="Edit Form" onclick="editLedgerIn(${l.id}, 'INWARD_HIST')">✏️</button>
            <button class="btn btn-danger btn-sm" title="Delete" onclick="reverseLedgerEntry(${l.id}, 'INWARD_HIST')">🗑️</button>
          </td>
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
          <div><label>Saree (Karigar / Bunkar Naam) *</label><input id="dirBunkar" list="dirBunkarList" value="${esc(orig ? orig.bunkarName : '')}" placeholder="e.g. FARHAN, KARAN" /><datalist id="dirBunkarList">${names.map((n) => `<option value="${esc(n.bunkarName)}">`).join('')}</datalist></div>
          <div><label>Quantity (Pcs) *</label><input type="number" id="dirQty" min="1" value="${orig ? orig.qty : ''}" placeholder="e.g. 50" /></div>
          <div><label>Note (Optional)</label><input id="dirNote" value="${esc(orig ? (orig.note || '') : '')}" placeholder="e.g. Kora maal" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveDirectInward(); }" /></div>
        </div>
        <button class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%; height:44px;" onclick="saveDirectInward()">${isEdit ? '✅ Update Direct Inward & Sync Stock (Ctrl+S)' : '✅ Save Direct Inward (Ctrl+S)'}</button>
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
        <div id="addWorkerInlineIn" class="stx-subpanel hidden">
          ${buildWorkerFormHtml(inState.jwType, 'In')}
        </div>
        <div id="inWorkerPager"></div>
      </div>`;
    mountPagedList({
      id: 'inWorkerPager', mode: 'list', items: workers, perPage: 15, placeholder: '🔍 Worker search karein...',
      getSearchText: (w) => `${w.name} ${w.phone || ''} ${w.city || ''}`,
      renderRow: (w, gIdx, pageIdx) => {
        const p = pendList.find((x) => x.id === `${w.name}__${inState.jwType.toUpperCase()}`);
        const pQty = p ? p.qty : 0;
        return `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickInWorker(${w.id})"><span>${gIdx + 1}. ${esc(w.name)}</span><div style="display:flex; align-items:center; gap:6px;"><span class="badge" style="color:${pQty > 0 ? '#dc2626' : '#16a34a'};">Pending: ${pQty} Pcs</span><button type="button" class="btn btn-light btn-sm" onclick="event.stopPropagation(); editWorkerInline(${w.id}, 'in')">✏️</button></div></div>`;
      },
      emptyHtml: '<p style="color:#64748b; font-size:13px;">Koi worker nahi mila.</p>'
    });
    return;
  }

  if (inState.step === 'JW_RETURN') {
    const jwUpper = inState.jwType.toUpperCase();
    const wUpper = inState.worker.name.toUpperCase();
    const pendId = `${wUpper}__${jwUpper}`;
    const orig = inState.editOrig, isEdit = !!inState.editId;

    let opening = null;
    try { opening = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null'); } catch (_) {}
    const allLedger = await dbGetAll('jobWorkLedger');
    const simLedger = isEdit ? allLedger.filter((x) => x.id !== inState.editId) : allLedger;
    const simAnalytics = (typeof window.stxComputeJWAnalytics === 'function')
      ? window.stxComputeJWAnalytics(opening, simLedger)
      : { pendingMap: {}, workerQueueMap: {}, outProgressMap: {} };

    const pendQty = Math.max(0, simAnalytics.pendingMap[pendId]?.qty || 0);
    const openBatches = allLedger
      .filter((l) => l.direction === 'OUT' && String(l.workerName || '').toUpperCase() === wUpper && String(l.jobWorkType || '').toUpperCase() === jwUpper)
      .map((l) => ({ l, prog: simAnalytics.outProgressMap[l.id] }))
      .filter((x) => x.prog && x.prog.pendingQty > 0)
      .sort((a, b) => (a.l.date || '').localeCompare(b.l.date || ''));

    window._stxSimJWQueue = (simAnalytics.workerQueueMap[pendId] || []).map((q) => ({ bunkarName: q.bunkarName, remQty: q.remQty }));

    const batchesHtml = openBatches.length
      ? `
        <div class="stx-subpanel" style="margin-bottom:14px;">
          <div style="font-size:12px; font-weight:800; color:#334155; margin-bottom:6px;">
            📦 Is Karigar par Baki Batches (${openBatches.length}):
          </div>
          ${openBatches.map(({ l, prog }) => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 0; border-bottom:1px dashed #cbd5e1; font-size:12px;">
              <div><b>${esc(l.date)}</b> ${l.jobWorkNo ? `(#${esc(l.jobWorkNo)})` : ''} — ${prog.items.map((it) => `${esc(it.bunkarName)}: <b>${it.pendingQty}</b>/${it.sentQty}`).join(', ')}</div>
              <div style="min-width:130px;">${renderProgressHtml(prog.okQty, prog.damageQty, prog.totalQty)}</div>
            </div>
          `).join('')}
        </div>
      `
      : '';

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${isEdit ? '✏️ Edit Wapsi:' : ''} ${esc(inState.jwType)} → ${esc(inState.worker.name)} (Wapsi)</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div style="background:#fef2f2; border:1px solid #fecaca; padding:12px 14px; border-radius:10px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:14px; font-weight:700;">Is Worker par Total Pending:</span>
          <b style="color:#dc2626; font-size:20px;">${pendQty} Pcs</b>
        </div>

        ${batchesHtml}

        <div class="grid-2" style="align-items:start;">
          <div><label>Date *</label><input type="date" id="jwRetDate" value="${esc(orig ? orig.date : todayISO())}" /></div>
          <div><label>OK Saree Wapas Aayi (Total Pcs) *</label><input type="number" id="jwRetQty" min="0" value="${isEdit && orig ? orig.qty : (pendQty > 0 ? pendQty : '')}" placeholder="e.g. 20" oninput="previewJWReturnAlloc()" /></div>
          <div><label>Damage / Shortage (Pcs — Optional)</label><input type="number" id="jwRetDamage" min="0" value="${isEdit && orig ? (orig.damageQty || 0) : 0}" placeholder="0" oninput="previewJWReturnAlloc()" /></div>
          <div><label>Note (Optional)</label><input id="jwRetNote" value="${esc(orig ? (orig.note || '') : '')}" placeholder="e.g. Ok checked" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveJWReturnInward(); }" /></div>
        </div>

        <div id="jwRetPreviewBox" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:11px 13px; margin-top:12px; font-size:12.5px; color:#1e3a8a;"></div>

        <button class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%; height:44px;" onclick="saveJWReturnInward()">
          ${isEdit ? '✅ Update Wapsi & Sync Stock (Ctrl+S)' : '✅ Wapsi Save Karein (Karigar + Auto Barcode Sync)'}
        </button>
      </div>`;

    previewJWReturnAlloc();
    setTimeout(() => { const el = document.getElementById('jwRetQty'); if (el) { el.focus(); el.select(); } }, 50);
  }
}

function previewJWReturnAlloc() {
  const box = document.getElementById('jwRetPreviewBox');
  if (!box) return;
  const okQty = Math.max(0, parseInt(document.getElementById('jwRetQty')?.value, 10) || 0);
  const dmgQty = Math.max(0, parseInt(document.getElementById('jwRetDamage')?.value, 10) || 0);

  if (okQty === 0 && dmgQty === 0) {
    box.innerHTML = 'ℹ️ Wapas aane wali <b>Total Pcs</b> daalein — software khud Karigar ke naam par stock save kar dega.';
    return;
  }

  const queue = (window._stxSimJWQueue || []).map((x) => ({ ...x }));
  const allocMap = {};
  let okLeft = okQty;

  for (let i = 0; i < queue.length && okLeft > 0; i++) {
    if (queue[i].remQty <= 0) continue;
    const take = Math.min(queue[i].remQty, okLeft);
    queue[i].remQty -= take;
    okLeft -= take;
    allocMap[queue[i].bunkarName] = (allocMap[queue[i].bunkarName] || 0) + take;
  }
  if (okLeft > 0) allocMap[_JW_POOL] = (allocMap[_JW_POOL] || 0) + okLeft;

  const kdMap = getKarigarDesignMapClean();
  const parts = Object.keys(allocMap).map((kName) => {
    const q = allocMap[kName];
    const disp = kName === _JW_POOL ? 'JW POOL' : kName;
    const mapped = kdMap[kName.toUpperCase()];
    if (mapped && mapped.auto) {
      return `<b>${esc(disp)} - ${q} pcs</b> <span class="stx-pill stx-pill-ok">⚡ Auto-Convert → ${esc(mapped.designName)}</span>`;
    }
    return `<b>${esc(disp)} - ${q} pcs</b> <span class="stx-pill stx-pill-info">Karigar Stock</span>`;
  });

  box.innerHTML = `
    <div style="font-weight:800; margin-bottom:4px;">🔮 Automatic Karigar Wapsi Breakdown:</div>
    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">${parts.join(' &nbsp;|&nbsp; ')}</div>
    ${dmgQty > 0 ? `<div style="margin-top:5px; color:#b91c1c; font-weight:700;">⚠️ Damage / Shortage: ${dmgQty} Pcs (Pending se kam honge, stock me nahi judenge)</div>` : ''}
  `;
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
    if (!bunkarName) return jwNotify('Karigar / Bunkar ka naam daalein!', 'warn');
    if (!qty || qty <= 0) return jwNotify('Sahi Pcs daalein!', 'warn');
    const record = { direction: 'IN', jobWorkType: 'DIRECT_BAITHAK', workerName: 'DIRECT BAITHAK', bunkarName, qty, date, note, createdAt: inState.editOrig ? inState.editOrig.createdAt : Date.now() };
    if (inState.editId) record.id = inState.editId;
    await dbPut('jobWorkLedger', record);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    if (inState.editId) {
      jwNotify(`✅ ${bunkarName} (${qty} Pcs) Update ho gayi!`, 'success');
      inState.editId = null; inState.editOrig = null; inState.step = 'HISTORY'; renderStockInward(); return;
    }
    jwNotify(`✅ ${bunkarName} ki ${qty} saree Dukan Stock me jud gayi!`, 'success');
    document.getElementById('dirBunkar').value = ''; document.getElementById('dirQty').value = ''; document.getElementById('dirNote').value = ''; document.getElementById('dirBunkar').focus();
  } catch (err) { jwNotify('Save Error: ' + err.message, 'error'); }
}

async function deleteAutoConvertLogsForJwIn(jwInId) {
  if (!jwInId) return;
  const logs = await dbGetAll('barcodingLogs');
  for (const b of logs) {
    if (b && b.autoFromJwInId === jwInId) {
      await dbDelete('barcodingLogs', b.id);
    }
  }
}

async function saveJWReturnInward() {
  try {
    const date = document.getElementById('jwRetDate').value || todayISO();
    const qty = Math.max(0, parseInt(document.getElementById('jwRetQty').value, 10) || 0);
    const damageQty = Math.max(0, parseInt(document.getElementById('jwRetDamage')?.value, 10) || 0);
    const note = document.getElementById('jwRetNote').value.trim();
    const jwUpper = inState.jwType.toUpperCase(), workerName = inState.worker.name.toUpperCase();

    if (qty <= 0 && damageQty <= 0) return jwNotify('Kam se kam OK Pcs ya Damage Pcs daalein!', 'warn');

    const pend = await dbGet('jobWorkPending', `${workerName}__${jwUpper}`);
    const isEdit = !!inState.editId;
    const origCleared = (isEdit && inState.editOrig)
      ? ((Number(inState.editOrig.qty) || 0) + (Number(inState.editOrig.damageQty) || 0))
      : 0;
    const pendQty = (pend ? pend.qty : 0) + origCleared;
    const totalEntered = qty + damageQty;

    if (totalEntered > pendQty && !confirm(`${workerName} par sirf ${pendQty} Pcs pending hai. Phir bhi ${totalEntered} Pcs enter karna hai?`)) return;

    if (isEdit) {
      await deleteAutoConvertLogsForJwIn(inState.editId);
    }

    const record = {
      direction: 'IN',
      jobWorkType: jwUpper,
      workerName,
      qty,
      damageQty,
      date,
      note,
      createdAt: inState.editOrig ? inState.editOrig.createdAt : Date.now()
    };
    if (inState.editId) record.id = inState.editId;
    const savedId = await dbPut('jobWorkLedger', record);

    // Compute Karigar-wise allocations for this Wapsi entry & Auto-Convert mapped Karigars!
    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { inAllocMap: {} };
    const allocs = (analytics.inAllocMap && analytics.inAllocMap[savedId]) || [];
    const kdMap = getKarigarDesignMapClean();

    const autoConvertedItems = [];
    const unmappedItems = [];

    for (const a of allocs) {
      if (!a || !a.bunkarName || a.bunkarName === _JW_POOL) continue;
      const mapped = kdMap[a.bunkarName.toUpperCase()];
      if (mapped && mapped.auto && mapped.designName) {
        const exDes = await dbGet('designs', mapped.designName);
        const specLine = mapped.specLine || (exDes ? exDes.specLine : '') || '';
        await dbPut('designs', {
          designName: mapped.designName,
          specLine,
          createdAt: exDes ? exDes.createdAt : Date.now()
        });
        await dbPut('barcodingLogs', {
          date,
          mode: 'STOCK_CONVERT',
          sourceName: a.bunkarName,
          designName: mapped.designName,
          firmCode: '',
          specLine,
          barcodeVal: mapped.designName,
          qty: a.qty,
          autoFromJwInId: savedId,
          createdAt: Date.now()
        });
        autoConvertedItems.push({ sourceName: a.bunkarName, designName: mapped.designName, specLine, firmCode: '', qty: a.qty });
      } else {
        unmappedItems.push({ sourceName: a.bunkarName, qty: a.qty });
      }
    }

    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();

    const retTarget = inState.returnTo;
    inState.editId = null; inState.editOrig = null; inState.returnTo = '';
    if (retTarget === 'PASSBOOK') { switchTabSectionOnly('tab-jobwork'); renderJWOutward(); }
    else if (isEdit) { inState.step = 'HISTORY'; renderStockInward(); }
    else { inState = { ...inState, step: 'MENU', jwType: '', worker: null, editId: null, editOrig: null, returnTo: '' }; renderStockInward(); }

    const totalAutoPcs = autoConvertedItems.reduce((s, x) => s + x.qty, 0);
    if (autoConvertedItems.length && typeof window.stxOpenModal === 'function') {
      const autoHtml = autoConvertedItems.map((x) => `<li>⚡ <b>${esc(x.sourceName)} (${x.qty} Pcs)</b> → Auto-Converted to Design <b>${esc(x.designName)}</b></li>`).join('');
      const unmapHtml = unmappedItems.map((x) => `<li>⏳ <b>${esc(x.sourceName)} (${x.qty} Pcs)</b> — New Karigar (1 baar "Stock Convert" me Design set karein)</li>`).join('');
      window.stxOpenModal({
        title: `✅ ${workerName} Wapsi Save + Auto Barcode Ready!`,
        bodyHtml: `
          <div style="font-size:13.5px; margin-bottom:8px;">OK Wapsi: <b style="color:#16a34a;">${qty} Pcs</b>${damageQty > 0 ? ` | Damage: <b style="color:#dc2626;">${damageQty} Pcs</b>` : ''}</div>
          <ul style="margin:6px 0 0 18px; padding:0; font-size:13px; line-height:1.6;">${autoHtml}${unmapHtml}</ul>
        `,
        buttons: [
          {
            label: `🖨️ Print ${totalAutoPcs} Dukan Stickers`,
            className: 'btn btn-dark',
            onClick: () => {
              stxCloseModal();
              if (typeof window.printBatchBarcodeStickers === 'function') {
                window.printBatchBarcodeStickers(autoConvertedItems, 'THERMAL');
              }
            }
          },
          { label: 'Done', className: 'btn btn-success', onClick: () => stxCloseModal() }
        ]
      });
    } else {
      const allocSummary = allocs.map((a) => `${a.bunkarName === _JW_POOL ? 'POOL' : a.bunkarName}: ${a.qty}`).join(', ');
      jwNotify(`✅ ${workerName} Wapsi ${isEdit ? 'Update' : 'Save'}! (${allocSummary || qty + ' Pcs'})`, 'success', 3400);
    }
  } catch (err) { jwNotify('Save Error: ' + err.message, 'error'); }
}

async function reverseLedgerEntry(id, returnTo) {
  try {
    const entry = await dbGet('jobWorkLedger', id);
    if (!entry) return;
    const desc = entry.direction === 'OUT'
      ? `<b>Type:</b> 📤 Job Work Out (${esc(entry.jobWorkType)})<br/><b>Worker:</b> ${esc(entry.workerName)}<br/><b>Date:</b> ${esc(entry.date)} &nbsp;|&nbsp; <b>Qty:</b> ${entry.qty} Pcs`
      : `<b>Type:</b> 📥 Inward / Wapsi (${esc(entry.jobWorkType === 'DIRECT_BAITHAK' ? 'Direct Baithak' : entry.jobWorkType)})<br/><b>Name:</b> ${esc(entry.bunkarName || entry.workerName)}<br/><b>Date:</b> ${esc(entry.date)} &nbsp;|&nbsp; <b>Qty:</b> ${entry.qty} Pcs`;

    const doDelete = async () => {
      if (entry.direction === 'IN') {
        await deleteAutoConvertLogsForJwIn(id);
      }
      await dbDelete('jobWorkLedger', id);
      if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
      if (typeof refreshDashboard === 'function') await refreshDashboard();
      jwNotify('Entry delete ho gayi & stock sync hua', 'info');
      (returnTo === 'PASSBOOK' || returnTo === 'OUT_LIST') ? renderJWOutward() : renderStockInward();
    };

    if (typeof window.stxConfirmDelete === 'function') {
      window.stxConfirmDelete({
        title: '⚠️ Job Work Entry Delete Karein?',
        detailsHtml: desc,
        onConfirm: doDelete
      });
    } else if (confirm(`Kya ye ${entry.date} ki (${entry.qty} Pcs) entry Delete karni hai?`)) {
      await doDelete();
    }
  } catch (err) { jwNotify('Reverse Error: ' + err.message, 'error'); }
}
