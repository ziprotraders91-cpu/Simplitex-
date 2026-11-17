// === SimpliTex Module 1 & 2 v6: Job Work & Stock Inward ===
// Features: 3-Field vs Swarovski 6-Field Worker, Bill + Packing Slip ONLY for Swarovski,
// Clickable Outward & Inward Lists + From-To Date Filter, Progress Bars + Damage/Shortage,
// Karigar-Wise FIFO Preview + Auto-Convert Dukan Barcode on JW Wapsi, Accidental Delete Guard.

const _JW_POOL = (typeof JW_POOL_KEY !== 'undefined') ? JW_POOL_KEY : '__JW_POOL__';

let jwState = {
  step: 'TYPE', // 'TYPE' | 'OUT_LIST' | 'WORKER' | 'PASSBOOK' | 'BATCH'
  jwType: '',
  worker: null,
  batchRows: [],
  meta: null,
  autoJobWorkNo: null,
  editId: null,
  origCreatedAt: null,
  origQtyMap: {},
  fromDate: '',
  toDate: '',
  filterType: 'ALL',
  filterWorker: 'ALL',
  returnTo: ''
};

let inState = {
  step: 'MENU', // 'MENU' | 'HISTORY' | 'DIRECT' | 'JW_TYPE' | 'JW_WORKER' | 'JW_RETURN'
  jwType: '',
  worker: null,
  editId: null,
  editOrig: null,
  returnTo: '',
  fromDate: '',
  toDate: '',
  filterSource: 'ALL'
};

let _jwReturnSimCache = { queue: [], openingRem: 0, karigarMap: {} };

function jwNotify(msg, type = 'info', ms = 2800) {
  if (typeof window.stxToast === 'function') window.stxToast(msg, type, ms);
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

function isSwarovskiType(jwType) {
  return /SWAR|SIRO/i.test(String(jwType || ''));
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

function getKarigarMapSafe() {
  try {
    const raw = JSON.parse(localStorage.getItem('simplitex_karigar_design_map') || '{}');
    const out = {};
    Object.keys(raw || {}).forEach((k) => {
      const v = raw[k];
      if (!v) return;
      if (typeof v === 'string') {
        out[k.toUpperCase()] = { designName: v.toUpperCase(), specLine: '', auto: true };
      } else if (v.designName) {
        out[k.toUpperCase()] = {
          designName: String(v.designName).toUpperCase(),
          specLine: String(v.specLine || '').toUpperCase(),
          auto: v.auto !== false
        };
      }
    });
    return out;
  } catch (_) { return {}; }
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

async function countInwardLedgerFast() {
  const ins = (typeof dbGetByIndex === 'function')
    ? await dbGetByIndex('jobWorkLedger', 'direction', 'IN')
    : (await dbGetAll('jobWorkLedger')).filter((l) => l.direction === 'IN');
  return ins.length;
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

function buildProgressCell(sent, ok, dmg, pending) {
  const done = ok + dmg;
  const pct = sent > 0 ? Math.min(100, Math.round((done / sent) * 100)) : 0;
  const isComplete = pending <= 0 && sent > 0;
  const fillCls = isComplete ? 'done' : (done > 0 ? 'warn' : '');
  const pill = isComplete
    ? `<span class="stx-pill stx-pill-ok">✅ Complete</span>`
    : (done > 0
      ? `<span class="stx-pill stx-pill-warn">⏳ ${pending} Baki</span>`
      : `<span class="stx-pill stx-pill-bad">📤 ${pending} Pending</span>`);
  const dmgTxt = dmg > 0 ? ` <small style="color:#dc2626;">(Dmg: ${dmg})</small>` : '';
  return `
    <div>
      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:11.5px;">
        <b>${ok}/${sent} OK${dmgTxt}</b>
        ${pill}
      </div>
      <div class="stx-prog-wrap"><div class="stx-prog-fill ${fillCls}" style="width:${pct}%;"></div></div>
    </div>
  `;
}

// === TAB & ESCAPE HOOKS ===
window.onTabChanged = function (tabId) {
  if (tabId === 'tab-jobwork') {
    jwState = {
      step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null, autoJobWorkNo: null,
      editId: null, origCreatedAt: null, origQtyMap: {},
      fromDate: '', toDate: '', filterType: 'ALL', filterWorker: 'ALL', returnTo: ''
    };
    resetPager('jwTypePager');
    renderJWOutward();
  } else if (tabId === 'tab-inward') {
    inState = {
      step: 'MENU', jwType: '', worker: null, editId: null, editOrig: null,
      returnTo: '', fromDate: '', toDate: '', filterSource: 'ALL'
    };
    renderStockInward();
  }
};

window.handleModuleEscape = function () {
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (!sec) return false;
  if (sec.id === 'tab-jobwork') {
    if (jwState.step === 'BATCH') {
      const ret = jwState.returnTo;
      jwState.meta = null; jwState.autoJobWorkNo = null; jwState.editId = null; jwState.origQtyMap = {}; jwState.batchRows = []; jwState.returnTo = '';
      if (ret === 'OUT_LIST') { jwState.step = 'OUT_LIST'; renderJWOutward(); return true; }
      if (ret === 'PASSBOOK') { jwState.step = 'PASSBOOK'; renderJWOutward(); return true; }
      jwState.step = 'WORKER'; jwState.worker = null; renderJWOutward(); return true;
    }
    if (jwState.step === 'PASSBOOK') {
      jwState.step = 'WORKER'; jwState.worker = null; renderJWOutward(); return true;
    }
    if (jwState.step === 'WORKER' || jwState.step === 'OUT_LIST') {
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

// === CONDITIONAL WORKER FORM (Swarovski = 6 Fields | Others = 3 Fields) ===
function buildWorkerFormHtml(mode, jwType) {
  const pfx = mode === 'out' ? 'Out' : 'In';
  const boxId = mode === 'out' ? 'addWorkerInlineOut' : 'addWorkerInlineIn';
  const isSwar = isSwarovskiType(jwType);

  if (!isSwar) {
    return `
      <div id="${boxId}" class="hidden stx-subpanel">
        <div style="font-size:12px; font-weight:800; color:#1e3a8a; margin-bottom:10px;">
          👷 ${esc(jwType)} Worker (Sirf 3 Details)
        </div>
        <input type="hidden" id="editWorkerId${pfx}" value="" />
        <div class="grid-2" style="align-items:start;">
          <div><label>1. Name *</label><input id="newWName${pfx}" placeholder="e.g. RAJU CUTTING" /></div>
          <div><label>2. Mob. No.</label><input id="newWPhone${pfx}" type="tel" placeholder="98xxxxxxxx" /></div>
          <div><label>3. Address</label><input id="newWAddr${pfx}" placeholder="Market / Mohalla..." /></div>
          <div><label style="visibility:hidden;">.</label><button type="button" class="btn btn-dark" style="height:42px; width:100%;" onclick="saveNewWorker('${mode}')">✅ Save Worker</button></div>
        </div>
      </div>`;
  }

  return `
    <div id="${boxId}" class="hidden stx-subpanel">
      <div style="font-size:12px; font-weight:800; color:#1e3a8a; margin-bottom:10px;">
        💎 ${esc(jwType)} Worker (Full 6 Details)
      </div>
      <input type="hidden" id="editWorkerId${pfx}" value="" />
      <div class="grid-2" style="align-items:start;">
        <div><label>1. Name *</label><input id="newWName${pfx}" placeholder="e.g. G.K. FABRICS" /></div>
        <div><label>2. Mob. No.</label><input id="newWPhone${pfx}" type="tel" placeholder="98xxxxxxxx" /></div>
        <div><label>3. Address</label><input id="newWAddr${pfx}" placeholder="Shop / Factory address..." /></div>
        <div><label>4. City</label><input id="newWCity${pfx}" placeholder="e.g. SURAT / VARANASI" /></div>
        <div><label>5. Transport</label><input id="newWTrans${pfx}" placeholder="e.g. Kashi Express" /></div>
        <div><label>6. GSTIN</label><input id="newWGst${pfx}" placeholder="e.g. 24AA..." /></div>
      </div>
      <button type="button" class="btn btn-dark" style="margin-top:12px; width:100%;" onclick="saveNewWorker('${mode}')">✅ Save Swarovski Worker</button>
    </div>`;
}

// === MODULE 1: JOB WORK OUTWARD ===
async function renderJWOutward() {
  await openDB();
  const box = document.getElementById('tab-jobwork');

  if (jwState.step === 'TYPE') {
    const types = await dbGetAll('jobWorkTypes');
    const allOut = (await dbGetByIndex('jobWorkLedger', 'direction', 'OUT')).length;
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>1. Job Work Outward — Kaam Chunein</h2>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="jwState.step='OUT_LIST'; resetPager('jwOutListPager'); renderJWOutward();">📋 Outward List (${allOut})</button>
            <button class="btn btn-dark btn-sm" onclick="addJobWorkTypePrompt('out')">+ Naya Job Work</button>
          </div>
        </div>
        <div id="jwTypePager"></div>
      </div>`;
    mountPagedList({
      id: 'jwTypePager', mode: 'list', items: types, perPage: 15,
      placeholder: '🔍 Job Work search karein (Cutting, Calender, Swarovski...)...',
      getSearchText: (t) => t.name,
      renderRow: (t, gIdx, pageIdx) => `
        <div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickOutJWType('${esc(t.name)}')">
          <span>${gIdx + 1}. ${esc(t.name)} ${isSwarovskiType(t.name) ? '<small style="color:#2563eb;">(Bill + Slip)</small>' : ''}</span>
          <span class="badge">Enter →</span>
        </div>`
    });
    return;
  }

  if (jwState.step === 'OUT_LIST') {
    const allLedger = await dbGetAll('jobWorkLedger');
    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { outProgressMap: {} };
    const progMap = analytics.outProgressMap || {};

    const allOut = allLedger
      .filter((l) => l.direction === 'OUT')
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    const typeSet = Array.from(new Set(allOut.map((l) => l.jobWorkType).filter(Boolean))).sort();
    const workerSet = Array.from(new Set(allOut.map((l) => l.workerName).filter(Boolean))).sort();

    const filtered = allOut.filter((l) => {
      if (jwState.fromDate && (l.date || '') < jwState.fromDate) return false;
      if (jwState.toDate && (l.date || '') > jwState.toDate) return false;
      if (jwState.filterType !== 'ALL' && l.jobWorkType !== jwState.filterType) return false;
      if (jwState.filterWorker !== 'ALL' && l.workerName !== jwState.filterWorker) return false;
      return true;
    });

    let sumSent = 0, sumOk = 0, sumDmg = 0, sumPend = 0;
    filtered.forEach((l) => {
      const p = progMap[l.id] || { totalQty: Number(l.qty) || 0, okQty: 0, damageQty: 0, pendingQty: Number(l.qty) || 0 };
      sumSent += p.totalQty; sumOk += p.okQty; sumDmg += p.damageQty; sumPend += p.pendingQty;
    });

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📋 Job Work Outward List (Kiski Saree Kahan Gayi)</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div class="stx-filter-bar">
          <div class="stx-f-item">
            <label>From Date</label>
            <input type="date" value="${esc(jwState.fromDate)}" onchange="jwState.fromDate=this.value; resetPager('jwOutListPager'); renderJWOutward();" />
          </div>
          <div class="stx-f-item">
            <label>To Date</label>
            <input type="date" value="${esc(jwState.toDate)}" onchange="jwState.toDate=this.value; resetPager('jwOutListPager'); renderJWOutward();" />
          </div>
          <div class="stx-f-item">
            <label>Kaam (Type)</label>
            <select onchange="jwState.filterType=this.value; resetPager('jwOutListPager'); renderJWOutward();">
              <option value="ALL">Sabhi Kaam</option>
              ${typeSet.map((t) => `<option value="${esc(t)}" ${jwState.filterType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          <div class="stx-f-item">
            <label>Worker (Karigar)</label>
            <select onchange="jwState.filterWorker=this.value; resetPager('jwOutListPager'); renderJWOutward();">
              <option value="ALL">Sabhi Workers</option>
              ${workerSet.map((w) => `<option value="${esc(w)}" ${jwState.filterWorker === w ? 'selected' : ''}>${esc(w)}</option>`).join('')}
            </select>
          </div>
          <button type="button" class="btn btn-light btn-sm" onclick="jwState.fromDate=''; jwState.toDate=''; jwState.filterType='ALL'; jwState.filterWorker='ALL'; resetPager('jwOutListPager'); renderJWOutward();">Reset</button>
        </div>

        <div class="stx-summary-strip">
          <div class="stx-summary-pill"><small>Entries</small><b>${filtered.length}</b></div>
          <div class="stx-summary-pill"><small>Total Sent</small><b style="color:#2563eb;">${sumSent} Pcs</b></div>
          <div class="stx-summary-pill"><small>Wapas OK</small><b style="color:#16a34a;">${sumOk} Pcs</b></div>
          <div class="stx-summary-pill"><small>Damage / Short</small><b style="color:#d97706;">${sumDmg} Pcs</b></div>
          <div class="stx-summary-pill"><small>Abhi Pending</small><b style="color:#dc2626;">${sumPend} Pcs</b></div>
        </div>

        <div style="font-size:12px; color:#475569; margin-bottom:8px; font-weight:600;">
          💡 Kisi bhi row par <b>click karne par uska poora Outward Form</b> khul jayega.
        </div>
        <div id="jwOutListPager"></div>
      </div>`;

    mountPagedList({
      id: 'jwOutListPager', items: filtered, perPage: 15,
      placeholder: '🔍 Karigar naam, Worker, Kaam, No. ya Note search karein...',
      headHtml: '<tr><th>Date / #</th><th>Kahan Gayi (Worker & Kaam)</th><th>Kiski Kitni Saree Gayi</th><th>Wapsi Progress</th><th>Action</th></tr>',
      getSearchText: (l) => {
        const bTxt = (l.batchItems || []).map((b) => `${b.bunkarName} ${b.qty}`).join(' ');
        return `${l.date} ${l.jobWorkNo || ''} ${l.jobWorkType} ${l.workerName} ${bTxt} ${l.note || ''}`;
      },
      renderRow: (l) => {
        const p = progMap[l.id] || { totalQty: Number(l.qty) || 0, okQty: 0, damageQty: 0, pendingQty: Number(l.qty) || 0 };
        const isSwar = isSwarovskiType(l.jobWorkType);
        const batchTxt = (l.batchItems || []).map((b) => `<b>${esc(b.bunkarName === _JW_POOL ? 'POOL' : b.bunkarName)}</b> (${b.qty})`).join(', ');
        return `
          <tr class="stx-row-click" onclick="editLedgerOut(${l.id}, 'OUT_LIST')">
            <td style="white-space:nowrap;"><b>${esc(l.date)}</b>${l.jobWorkNo ? `<br/><small style="color:#64748b;">#${esc(l.jobWorkNo)}</small>` : ''}</td>
            <td><b>${esc(l.workerName)}</b><br/><small style="color:#2563eb; font-weight:700;">${esc(l.jobWorkType)}</small></td>
            <td><small>${batchTxt || '-'}</small>${l.note ? `<br/><small style="color:#64748b;">Note: ${esc(l.note)}</small>` : ''}</td>
            <td style="min-width:155px;">${buildProgressCell(p.totalQty, p.okQty, p.damageQty, p.pendingQty)}</td>
            <td style="white-space:nowrap;" onclick="event.stopPropagation()">
              ${isSwar ? `<button class="btn btn-dark btn-sm" title="A5 Bill" onclick="printJobWorkBill(${l.id})">🖨️ Bill</button> <button class="btn btn-success btn-sm" title="Packing Slip" onclick="printJobWorkPackingSlip(${l.id})">📦 Slip</button> ` : ''}
              <button class="btn btn-light btn-sm" title="Edit" onclick="editLedgerOut(${l.id}, 'OUT_LIST')">✏️</button>
              <button class="btn btn-danger btn-sm" title="Delete" onclick="reverseLedgerEntry(${l.id}, 'OUT_LIST')">🗑️</button>
            </td>
          </tr>`;
      },
      emptyHtml: '<tr><td colspan="5">Is date range mein koi Outward entry nahi mili</td></tr>'
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
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-success btn-sm" onclick="showAddWorkerModal('out')">+ Naya Worker</button>
            <button class="btn btn-primary btn-sm" onclick="jwState.filterType='${esc(jwState.jwType.toUpperCase())}'; jwState.step='OUT_LIST'; resetPager('jwOutListPager'); renderJWOutward();">📋 Outward List</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        ${buildWorkerFormHtml('out', jwState.jwType)}
        <div id="jwWorkerPager"></div>
      </div>`;
    mountPagedList({
      id: 'jwWorkerPager', mode: 'list', items: workers, perPage: 15,
      placeholder: '🔍 Worker naam, mobile ya address search karein...',
      getSearchText: (w) => `${w.name} ${w.phone || ''} ${w.city || ''} ${w.address || ''}`,
      renderRow: (w, gIdx, pageIdx) => {
        const p = pendList.find((x) => x.id === `${w.name}__${jwState.jwType.toUpperCase()}`);
        const pQty = p ? p.qty : 0;
        return `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickOutWorker(${w.id})">
          <div><div>${gIdx + 1}. ${esc(w.name)}</div><small style="color:#64748b; font-weight:500;">${esc(w.phone || '')} ${esc(w.city || w.address || '')}</small></div>
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
    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { outProgressMap: {}, inAllocMap: {} };
    const progMap = analytics.outProgressMap || {};
    const allocMap = analytics.inAllocMap || {};

    const rawWorkerLedger = (typeof dbGetByIndex === 'function')
      ? await dbGetByIndex('jobWorkLedger', 'workerName', wName)
      : (await dbGetAll('jobWorkLedger')).filter((l) => l.workerName === wName);
    const allLedger = rawWorkerLedger
      .filter((l) => l.jobWorkType === jwUpper)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    const ledger = allLedger.filter((l) => {
      if (jwState.fromDate && (l.date || '') < jwState.fromDate) return false;
      if (jwState.toDate && (l.date || '') > jwState.toDate) return false;
      return true;
    });

    const pend = await dbGet('jobWorkPending', `${wName}__${jwUpper}`);
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 ${esc(wName)} (${esc(jwState.jwType)}) — Poora Khata</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div class="stx-filter-bar">
          <div class="stx-f-item"><label>From Date</label><input type="date" value="${esc(jwState.fromDate)}" onchange="jwState.fromDate=this.value; resetPager('jwPassbookPager'); renderJWOutward();" /></div>
          <div class="stx-f-item"><label>To Date</label><input type="date" value="${esc(jwState.toDate)}" onchange="jwState.toDate=this.value; resetPager('jwPassbookPager'); renderJWOutward();" /></div>
          <button type="button" class="btn btn-light btn-sm" onclick="jwState.fromDate=''; jwState.toDate=''; resetPager('jwPassbookPager'); renderJWOutward();">Reset</button>
          <div style="margin-left:auto; background:#fef2f2; border:1px solid #fecaca; padding:7px 12px; border-radius:8px; font-size:13px;">
            Abhi Pending: <b style="color:#dc2626; font-size:15px;">${pend ? pend.qty : 0} Pcs</b>
          </div>
        </div>

        <div id="jwPassbookPager"></div>
      </div>`;

    mountPagedList({
      id: 'jwPassbookPager', items: ledger, perPage: 15,
      placeholder: '🔍 Date, Karigar, No. ya Kaam search karein...',
      headHtml: '<tr><th>Date / No.</th><th>Kaam</th><th>Karigar Detail</th><th>Pcs / Progress</th><th>Kya Kaam / Note</th><th>Action</th></tr>',
      getSearchText: (l) => `${l.date} ${l.jobWorkNo || ''} ${l.direction} ${Array.isArray(l.batchItems) ? l.batchItems.map((b) => b.bunkarName).join(' ') : ''} ${l.note || ''}`,
      renderRow: (l) => {
        const isOut = l.direction === 'OUT';
        const p = isOut ? (progMap[l.id] || { totalQty: l.qty, okQty: 0, damageQty: 0, pendingQty: l.qty }) : null;
        const allocs = !isOut ? (allocMap[l.id] || []) : [];
        const detail = isOut && Array.isArray(l.batchItems)
          ? l.batchItems.map((b) => `<b>${esc(b.bunkarName === _JW_POOL ? 'POOL' : b.bunkarName)}</b> (${b.qty})`).join(', ')
          : (allocs.length ? allocs.map((a) => `<b>${esc(a.bunkarName === _JW_POOL ? 'POOL' : a.bunkarName)}</b> (${a.qty})`).join(', ') : 'Wapsi Entry');
        const dmg = Number(l.damageQty) || 0;
        return `
          <tr class="stx-row-click" onclick="${isOut ? `editLedgerOut(${l.id}, 'PASSBOOK')` : `editLedgerIn(${l.id}, 'PASSBOOK')`}">
            <td style="white-space:nowrap;">${esc(l.date)}${l.jobWorkNo ? `<br/><small style="color:#64748b;">#${esc(l.jobWorkNo)}</small>` : ''}</td>
            <td><b style="color:${isOut ? '#2563eb' : '#16a34a'};">${isOut ? '📤 Bheja' : '📥 Wapas'}</b></td>
            <td><small>${detail}</small></td>
            <td style="min-width:140px;">${isOut ? buildProgressCell(p.totalQty, p.okQty, p.damageQty, p.pendingQty) : `<b style="color:#16a34a;">-${l.qty} OK</b>${dmg > 0 ? `<br/><small style="color:#dc2626;">Dmg: ${dmg}</small>` : ''}`}</td>
            <td><small><b>${esc(l.note || '-')}</b></small></td>
            <td style="white-space:nowrap;" onclick="event.stopPropagation()">
              ${isOut && isSwar ? `<button class="btn btn-dark btn-sm" title="A5 Bill" onclick="printJobWorkBill(${l.id})">🖨️ Bill</button> <button class="btn btn-success btn-sm" title="Packing Slip" onclick="printJobWorkPackingSlip(${l.id})">📦 Slip</button> ` : ''}
              <button class="btn btn-light btn-sm" title="Edit" onclick="${isOut ? `editLedgerOut(${l.id}, 'PASSBOOK')` : `editLedgerIn(${l.id}, 'PASSBOOK')`}">✏️</button>
              <button class="btn btn-danger btn-sm" title="Delete" onclick="reverseLedgerEntry(${l.id}, 'PASSBOOK')">🗑️</button>
            </td>
          </tr>`;
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
    const stocks = Object.keys(stockMap).filter((k) => stockMap[k] > 0).map((k) => ({ bunkarName: k, qty: stockMap[k] })).sort((a, b) => a.bunkarName.localeCompare(b.bunkarName));
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
        transport: isSwar ? (jwState.worker.transport || '') : '',
        destination: isSwar ? (jwState.worker.city || '') : '',
        workerGstin: isSwar ? (jwState.worker.gstin || '') : '',
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
          <div><label>Dispatched Through (Transport)</label><input id="batchTransport" value="${esc(m.transport)}" placeholder="e.g. Kashi Express" onchange="syncBatchMeta()" /></div>
          <div><label>Destination (City)</label><input id="batchDestination" value="${esc(m.destination)}" placeholder="e.g. SURAT / VARANASI" onchange="syncBatchMeta()" /></div>
          <div><label>Worker GSTIN</label><input id="batchWorkerGstin" value="${esc(m.workerGstin || '')}" placeholder="e.g. 24AA..." onchange="syncBatchMeta()" /></div>
          <div style="grid-column:1 / -1;"><label>✨ Kya Kaam / Design Hoga? *</label><input id="batchNote" list="jwWorkDetailList" value="${esc(m.note)}" placeholder="e.g. GAWATI ZARI CONTRAST ANCHAL" oninput="syncBatchMeta()" /><datalist id="jwWorkDetailList">${savedWorks.map((w) => `<option value="${esc(w)}">`).join('')}</datalist></div>
        </div>`
      : `
        <div class="grid-2" style="align-items:start;">
          <div><label>Dated *</label><input type="date" id="batchDate" value="${esc(m.date)}" onchange="syncBatchMeta()" /></div>
          <div><label>Ref / Slip No.</label><input type="number" id="batchBillNo" value="${esc(m.jobWorkNo)}" onchange="syncBatchMeta()" /></div>
          <div style="grid-column:1 / -1;"><label>✨ Kya Kaam / Design Hoga?</label><input id="batchNote" list="jwWorkDetailList" value="${esc(m.note)}" placeholder="e.g. ${esc(jwState.jwType)} work" oninput="syncBatchMeta()" /><datalist id="jwWorkDetailList">${savedWorks.map((w) => `<option value="${esc(w)}">`).join('')}</datalist></div>
        </div>`;

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${isEdit ? '✏️ Edit Job Work' : esc(jwState.jwType)} → ${esc(jwState.worker.name)} ${isEdit ? '(#' + esc(m.jobWorkNo) + ')' : ''}</h2>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${isEdit && isSwar ? `<button class="btn btn-dark btn-sm" onclick="printJobWorkBill(${jwState.editId})">🖨️ Bill</button> <button class="btn btn-success btn-sm" onclick="printJobWorkPackingSlip(${jwState.editId})">📦 Slip</button>` : ''}
            ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="reverseLedgerEntry(${jwState.editId}, '${esc(jwState.returnTo || 'OUT_LIST')}')">🗑️ Delete</button>` : ''}
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        ${metaGridHtml}
      </div>

      <div class="card">
        <div class="card-head">
          <h2>📦 Batch Me Karigar / Bunkar Saree Jodein</h2>
          <span class="shortcut-hint">Enter = Add</span>
        </div>
        <div class="stx-subpanel">
          <div class="grid-2" style="align-items:start;">
            <div><label>Karigar / Bunkar Naam *</label><input id="batchBunkarInput" list="batchBunkarList" placeholder="e.g. KARAN, ROHAN, FARHAN" /><datalist id="batchBunkarList">${stocks.map((s) => `<option value="${esc(s.bunkarName)}">${esc(s.bunkarName === _JW_POOL ? 'JOB WORK POOL' : s.bunkarName)} (${s.qty} Pcs)</option>`).join('')}</datalist></div>
            <div><label>Quantity (Pcs) — Enter se Add hoga</label><input type="number" id="batchQtyInput" min="1" placeholder="e.g. 10" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); addBatchRow(); }" /></div>
          </div>
          <button type="button" class="btn btn-dark btn-sm" style="margin-top:10px;" onclick="addBatchRow()">+ Add Line</button>
        </div>

        <div style="overflow-x:auto;">
          <table><thead><tr><th>Sl No.</th><th>Karigar / Goods</th><th>Quantity</th><th>X</th></tr></thead>
            <tbody>${jwState.batchRows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.bunkarName === _JW_POOL ? 'JOB WORK POOL' : r.bunkarName)}</b></td><td><b>${r.qty}</b></td><td><button type="button" class="btn btn-danger btn-sm" onclick="removeBatchRow(${i})">X</button></td></tr>`).join('') || '<tr><td colspan="4" style="color:#64748b;">Abhi batch khali hai... upar se add karein</td></tr>'}</tbody>
          </table>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-top:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="font-size:18px; font-weight:800;">TOTAL: <span style="color:#2563eb;">${totalBatch} Pcs</span></div>
          <button type="button" class="btn btn-success primary-save-btn" onclick="saveBatchOutward()">
            ${isEdit ? '✅ Update Batch & Sync Stock (Ctrl+S)' : (isSwar ? '✅ Save Batch & Print Bill / Slip (Ctrl+S)' : '✅ Save Job Work Outward (Ctrl+S)')}
          </button>
        </div>
      </div>`;
    setTimeout(() => document.getElementById(isSwar ? 'batchNote' : 'batchBunkarInput')?.focus(), 50);
  }
}

function syncBatchMeta() {
  if (!jwState.meta) jwState.meta = {};
  const firmEl = document.getElementById('batchFirmId');
  const transEl = document.getElementById('batchTransport');
  const destEl = document.getElementById('batchDestination');
  const gstEl = document.getElementById('batchWorkerGstin');
  if (firmEl) jwState.meta.firmId = firmEl.value || '';
  jwState.meta.jobWorkNo = document.getElementById('batchBillNo')?.value || '';
  jwState.meta.date = document.getElementById('batchDate')?.value || todayISO();
  if (transEl) jwState.meta.transport = transEl.value.trim();
  if (destEl) jwState.meta.destination = destEl.value.trim().toUpperCase();
  if (gstEl) jwState.meta.workerGstin = gstEl.value.trim().toUpperCase();
  jwState.meta.note = document.getElementById('batchNote')?.value.trim().toUpperCase() || '';
}

function pickOutJWType(name) { jwState.jwType = name; jwState.step = 'WORKER'; resetPager('jwWorkerPager'); renderJWOutward(); }
async function pickOutWorker(id) {
  jwState.worker = await dbGet('jobWorkers', id);
  jwState.batchRows = []; jwState.meta = null; jwState.autoJobWorkNo = null; jwState.editId = null; jwState.origCreatedAt = null; jwState.origQtyMap = {}; jwState.returnTo = '';
  jwState.step = 'BATCH'; renderJWOutward();
}
async function openWorkerPassbook(id) {
  jwState.worker = await dbGet('jobWorkers', id); jwState.step = 'PASSBOOK'; resetPager('jwPassbookPager'); renderJWOutward();
}

async function editLedgerOut(id, returnTo) {
  const entry = await dbGet('jobWorkLedger', id);
  if (!entry) return;
  const allWorkers = await dbGetAll('jobWorkers');
  const w = allWorkers.find((x) => x.name.toUpperCase() === entry.workerName) || {
    name: entry.workerName, phone: entry.workerPhone || '', address: entry.workerAddress || '',
    city: entry.destination || '', transport: entry.transport || '', gstin: entry.workerGstin || ''
  };
  const origMap = {};
  (entry.batchItems || []).forEach((r) => { origMap[r.bunkarName] = (origMap[r.bunkarName] || 0) + (Number(r.qty) || 0); });
  jwState.jwType = entry.jobWorkType;
  jwState.worker = w;
  jwState.editId = entry.id;
  jwState.origCreatedAt = entry.createdAt;
  jwState.origQtyMap = origMap;
  jwState.autoJobWorkNo = null;
  jwState.returnTo = returnTo || 'PASSBOOK';
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
  switchTabSectionOnly('tab-jobwork');
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
    const jwType = mode === 'out' ? jwState.jwType : inState.jwType;
    const isSwar = isSwarovskiType(jwType);
    const city = isSwar ? (document.getElementById('newWCity' + pfx)?.value || '').trim().toUpperCase() : '';
    const transport = isSwar ? (document.getElementById('newWTrans' + pfx)?.value || '').trim() : '';
    const gstin = isSwar ? (document.getElementById('newWGst' + pfx)?.value || '').trim().toUpperCase() : '';

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
        <label>Kaam ka naam likhein (e.g. Cutting, Calender, Swarovski)</label>
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
      firmId: m.firmId || '',
      jobWorkNo: m.jobWorkNo,
      transport: isSwar ? (m.transport || '') : '',
      destination: isSwar ? (m.destination || '') : '',
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
    const retTarget = jwState.returnTo || 'PASSBOOK';
    const savedNo = m.jobWorkNo;

    if (wasEdit) {
      jwState.step = retTarget; jwState.editId = null; jwState.origQtyMap = {}; jwState.meta = null; jwState.autoJobWorkNo = null; jwState.batchRows = []; jwState.returnTo = '';
    } else {
      jwState = {
        step: 'TYPE', jwType: '', worker: null, batchRows: [], meta: null, autoJobWorkNo: null,
        editId: null, origCreatedAt: null, origQtyMap: {}, fromDate: '', toDate: '', filterType: 'ALL', filterWorker: 'ALL', returnTo: ''
      };
    }
    await renderJWOutward();

    // Bill + Packing Slip SIRF Swarovski ke liye!
    if (isSwar && typeof window.stxOpenModal === 'function') {
      window.stxOpenModal({
        title: `💎 Swarovski #${savedNo} ${wasEdit ? 'Update' : 'Save'} Ho Gaya!`,
        bodyHtml: `<div style="font-size:14px;"><b>${esc(workerName)}</b> — <b>${totalQty} Pcs</b></div><p style="margin-top:6px;">Bill aur Packing Slip dono yahan se print kar sakte hain:</p>`,
        buttons: [
          { label: '🖨️ Print A5 Bill', className: 'btn btn-dark', onClick: () => { stxCloseModal(); printJobWorkBill(ledgerId); } },
          { label: '📦 Print Packing Slip', className: 'btn btn-success', onClick: () => { stxCloseModal(); printJobWorkPackingSlip(ledgerId); } },
          { label: 'Done', className: 'btn btn-light', onClick: () => stxCloseModal() }
        ]
      });
    } else {
      jwNotify(`✅ ${jwTypeUpper} (${workerName} — ${totalQty} Pcs) ${wasEdit ? 'Update' : 'Save'} ho gaya!`, 'success');
    }
  } catch (err) { jwNotify('Save Error: ' + err.message, 'error'); }
}

// === SWAROVSKI PRINT 1: A5 LANDSCAPE JOB WORK BILL ===
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
              ${l.workerGstin ? `<div>GSTIN: ${esc(l.workerGstin)}</div>` : ''}
            </div>
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

// === SWAROVSKI PRINT 2: A5 PORTRAIT PACKING SLIP ===
async function printJobWorkPackingSlip(ledgerId) {
  const l = await dbGet('jobWorkLedger', ledgerId);
  if (!l) return;
  ensureJWPrintSetup('@media print { @page { size: A5 portrait; margin: 6mm; } body { margin: 0; } }');
  const items = Array.isArray(l.batchItems) ? l.batchItems : [];
  document.getElementById('simplitexPrintRoot').innerHTML = `
    <div style="width:100%; min-height:185mm; border:3px solid #000; padding:12px; box-sizing:border-box; font-family:Arial,sans-serif; display:flex; flex-direction:column; justify-content:space-between; color:#000;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2.5px solid #000; padding-bottom:8px;">
          <div style="font-size:18px; font-weight:900; letter-spacing:0.8px;">JOB WORK PACKING SLIP</div>
          <div style="font-size:13px; font-weight:800;">Date: ${esc(formatDMY(l.date))}</div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; border-bottom:2px dashed #000; padding-bottom:8px; font-size:13px;">
          <div><b>JW No.:</b> #${esc(l.jobWorkNo || l.id)}</div>
          <div style="text-align:right;"><b>Kaam:</b> ${esc(l.jobWorkType)}</div>
          <div><b>Destination:</b> ${esc(l.destination || '-')}</div>
          <div style="text-align:right;"><b>Transport:</b> ${esc(l.transport || '-')}</div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="border:1.5px solid #000; padding:6px; width:12%; text-align:center;">Sl</th>
              <th style="border:1.5px solid #000; padding:6px; text-align:left;">Karigar / Goods</th>
              <th style="border:1.5px solid #000; padding:6px; width:22%; text-align:center;">Qty (Pcs)</th>
              <th style="border:1.5px solid #000; padding:6px; width:14%; text-align:center;">Check</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it, i) => `
              <tr>
                <td style="border:1px solid #000; padding:6px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #000; padding:6px; font-weight:800;">${esc(it.bunkarName === _JW_POOL ? 'JOB WORK POOL' : it.bunkarName)}</td>
                <td style="border:1px solid #000; padding:6px; text-align:center; font-weight:800;">${it.qty}</td>
                <td style="border:1px solid #000; padding:6px; text-align:center;">☐</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div>
        ${l.note ? `<div style="border:1.5px dashed #000; padding:8px; text-align:center; font-weight:900; font-size:14px; margin-bottom:10px;">WORK: ${esc(l.note)}</div>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:2.5px solid #000; padding-top:8px; font-size:18px; font-weight:900;">
          <div>TOTAL PCS: ${l.qty}</div>
          <div>ITEMS: ${items.length}</div>
        </div>
      </div>
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
        <div class="card-head">
          <h2>2. Stock Inward — Maal Kahan se Aaya?</h2>
          <button class="btn btn-primary btn-sm" onclick="inState.step='HISTORY'; resetPager('inwardHistPager'); renderStockInward();">📋 Aane Wali List (${inCount})</button>
        </div>
        <div class="list-menu kbd-list">
          <div class="list-row kbd-active" data-key="1" onclick="inState.step='DIRECT'; inState.editId=null; inState.editOrig=null; renderStockInward();"><span>1. Direct Baithak se Aayi (Karigar / Bunkar ke Naam se)</span><span class="badge">Key: 1</span></div>
          <div class="list-row" data-key="2" onclick="inState.step='JW_TYPE'; inState.editId=null; inState.editOrig=null; resetPager('inJWTypePager'); renderStockInward();"><span>2. Job Work se Wapas Aayi (Total Pcs Entry + Auto Karigar Wapsi)</span><span class="badge">Key: 2</span></div>
          <div class="list-row" data-key="3" onclick="inState.step='HISTORY'; resetPager('inwardHistPager'); renderStockInward();"><span>3. 📋 Inward / Job Work Wapsi List (Date Filter)</span><span class="badge">Key: 3</span></div>
        </div>
      </div>`;
    return;
  }

  if (inState.step === 'HISTORY') {
    const allInRaw = (typeof dbGetByIndex === 'function')
      ? await dbGetByIndex('jobWorkLedger', 'direction', 'IN')
      : (await dbGetAll('jobWorkLedger')).filter((l) => l.direction === 'IN');
    const allInSorted = allInRaw.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));

    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { inAllocMap: {} };
    const allocMap = analytics.inAllocMap || {};

    const filtered = allInSorted.filter((l) => {
      if (inState.fromDate && (l.date || '') < inState.fromDate) return false;
      if (inState.toDate && (l.date || '') > inState.toDate) return false;
      if (inState.filterSource === 'DIRECT' && l.jobWorkType !== 'DIRECT_BAITHAK') return false;
      if (inState.filterSource === 'JW' && l.jobWorkType === 'DIRECT_BAITHAK') return false;
      return true;
    });

    let sumOk = 0, sumDmg = 0;
    filtered.forEach((l) => { sumOk += Number(l.qty) || 0; sumDmg += Number(l.damageQty) || 0; });

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📋 Stock Inward & Job Work Wapsi List (${filtered.length})</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div class="stx-filter-bar">
          <div class="stx-f-item"><label>From Date</label><input type="date" value="${esc(inState.fromDate)}" onchange="inState.fromDate=this.value; resetPager('inwardHistPager'); renderStockInward();" /></div>
          <div class="stx-f-item"><label>To Date</label><input type="date" value="${esc(inState.toDate)}" onchange="inState.toDate=this.value; resetPager('inwardHistPager'); renderStockInward();" /></div>
          <div class="stx-f-item">
            <label>Source</label>
            <select onchange="inState.filterSource=this.value; resetPager('inwardHistPager'); renderStockInward();">
              <option value="ALL" ${inState.filterSource === 'ALL' ? 'selected' : ''}>Sabhi (Baithak + JW)</option>
              <option value="JW" ${inState.filterSource === 'JW' ? 'selected' : ''}>Sirf Job Work Wapsi</option>
              <option value="DIRECT" ${inState.filterSource === 'DIRECT' ? 'selected' : ''}>Sirf Direct Baithak</option>
            </select>
          </div>
          <button type="button" class="btn btn-light btn-sm" onclick="inState.fromDate=''; inState.toDate=''; inState.filterSource='ALL'; resetPager('inwardHistPager'); renderStockInward();">Reset</button>
        </div>

        <div class="stx-summary-strip">
          <div class="stx-summary-pill"><small>Entries</small><b>${filtered.length}</b></div>
          <div class="stx-summary-pill"><small>Total OK Wapas</small><b style="color:#16a34a;">+${sumOk} Pcs</b></div>
          <div class="stx-summary-pill"><small>Damage / Short</small><b style="color:#dc2626;">${sumDmg} Pcs</b></div>
        </div>

        <div style="font-size:12px; color:#475569; margin-bottom:8px; font-weight:600;">
          💡 Kisi bhi row par <b>click karne par uska Form</b> khul jayega (Edit / View ke liye).
        </div>
        <div id="inwardHistPager"></div>
      </div>`;

    mountPagedList({
      id: 'inwardHistPager', items: filtered, perPage: 15,
      placeholder: '🔍 Date, Karigar, Worker, Kaam ya Note search karein...',
      headHtml: '<tr><th>Date</th><th>Source</th><th>Worker / Kaam</th><th>Karigar Saree Detail</th><th>OK / Dmg</th><th>Note</th><th>Action</th></tr>',
      getSearchText: (l) => {
        const allocs = (allocMap[l.id] || []).map((a) => `${a.bunkarName} ${a.qty}`).join(' ');
        return `${l.date} ${l.jobWorkType} ${l.bunkarName || ''} ${l.workerName || ''} ${allocs} ${l.note || ''}`;
      },
      renderRow: (l) => {
        const isDirect = l.jobWorkType === 'DIRECT_BAITHAK';
        const allocs = !isDirect ? (allocMap[l.id] || []) : [];
        const karigarTxt = isDirect
          ? `<b>${esc(l.bunkarName)}</b> (${l.qty})`
          : (allocs.length ? allocs.map((a) => `<b>${esc(a.bunkarName === _JW_POOL ? 'POOL' : a.bunkarName)}</b> - ${a.qty} pcs`).join(', ') : '-');
        const dmg = Number(l.damageQty) || 0;
        return `
          <tr class="stx-row-click" onclick="editLedgerIn(${l.id}, 'INWARD_HIST')">
            <td style="white-space:nowrap;"><b>${esc(l.date)}</b></td>
            <td><b>${isDirect ? '🏠 Baithak' : '🧵 ' + esc(l.jobWorkType)}</b></td>
            <td><b>${esc(isDirect ? l.bunkarName : l.workerName)}</b></td>
            <td><small>${karigarTxt}</small></td>
            <td style="white-space:nowrap;"><b style="color:#16a34a;">+${l.qty} OK</b>${dmg > 0 ? `<br/><small style="color:#dc2626; font-weight:700;">Dmg: ${dmg}</small>` : ''}</td>
            <td><small>${esc(l.note || '-')}</small></td>
            <td style="white-space:nowrap;" onclick="event.stopPropagation()">
              <button class="btn btn-light btn-sm" title="Edit" onclick="editLedgerIn(${l.id}, 'INWARD_HIST')">✏️</button>
              <button class="btn btn-danger btn-sm" title="Delete" onclick="reverseLedgerEntry(${l.id}, 'INWARD_HIST')">🗑️</button>
            </td>
          </tr>`;
      },
      emptyHtml: '<tr><td colspan="7">Koi record nahi mila</td></tr>'
    });
    return;
  }

  if (inState.step === 'DIRECT') {
    const names = (await dbGetAll('bunkarStock')).filter((s) => s.bunkarName !== _JW_POOL);
    const orig = inState.editOrig, isEdit = !!inState.editId;
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${isEdit ? '✏️ Edit Direct Baithak Inward' : 'Direct Baithak se Stock Inward'}</h2>
          <div style="display:flex; gap:6px;">
            ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="reverseLedgerEntry(${inState.editId}, 'INWARD_HIST')">🗑️ Delete</button>` : ''}
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        <div class="grid-2" style="align-items:start;">
          <div><label>Date *</label><input type="date" id="dirDate" value="${esc(orig ? orig.date : todayISO())}" /></div>
          <div><label>Karigar / Bunkar Naam *</label><input id="dirBunkar" list="dirBunkarList" value="${esc(orig ? orig.bunkarName : '')}" placeholder="e.g. FARHAN, KARAN" /><datalist id="dirBunkarList">${names.map((n) => `<option value="${esc(n.bunkarName)}">`).join('')}</datalist></div>
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
        <div class="card-head">
          <h2>${esc(inState.jwType)} Wapsi — Worker Chunein</h2>
          <div><button class="btn btn-success btn-sm" onclick="showAddWorkerModal('in')">+ Naya Worker</button><button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button></div>
        </div>
        ${buildWorkerFormHtml('in', inState.jwType)}
        <div id="inWorkerPager"></div>
      </div>`;
    mountPagedList({
      id: 'inWorkerPager', mode: 'list', items: workers, perPage: 15, placeholder: '🔍 Worker search karein...',
      getSearchText: (w) => `${w.name} ${w.phone || ''} ${w.city || ''} ${w.address || ''}`,
      renderRow: (w, gIdx, pageIdx) => {
        const p = pendList.find((x) => x.id === `${w.name}__${inState.jwType.toUpperCase()}`);
        const pQty = p ? p.qty : 0;
        return `<div class="list-row ${pageIdx === 0 ? 'kbd-active' : ''}" data-key="${pageIdx + 1}" onclick="pickInWorker(${w.id})">
          <div><div>${gIdx + 1}. ${esc(w.name)}</div><small style="color:#64748b;">${esc(w.phone || '')} ${esc(w.address || w.city || '')}</small></div>
          <div style="display:flex; align-items:center; gap:6px;"><span class="badge" style="color:${pQty > 0 ? '#dc2626' : '#16a34a'};">Pending: ${pQty} Pcs</span><button type="button" class="btn btn-light btn-sm" onclick="event.stopPropagation(); editWorkerInline(${w.id}, 'in')">✏️</button></div>
        </div>`;
      },
      emptyHtml: '<p style="color:#64748b; font-size:13px;">Koi worker nahi mila.</p>'
    });
    return;
  }

  if (inState.step === 'JW_RETURN') {
    const jwUpper = inState.jwType.toUpperCase();
    const wName = inState.worker.name.toUpperCase();
    const pendId = `${wName}__${jwUpper}`;
    const orig = inState.editOrig, isEdit = !!inState.editId;

    let opening = null;
    try { opening = JSON.parse(localStorage.getItem('simplitex_opening_stock') || 'null'); } catch (_) {}
    const allLedger = await dbGetAll('jobWorkLedger');
    const baseLedger = isEdit ? allLedger.filter((x) => x.id !== inState.editId) : allLedger;
    const baseAnalytics = (typeof window.stxComputeJWAnalytics === 'function')
      ? window.stxComputeJWAnalytics(opening, baseLedger)
      : { pendingMap: {}, workerQueueMap: {}, outProgressMap: {} };

    const pendQty = Math.max(0, (baseAnalytics.pendingMap[pendId]?.qty || 0));
    const queue = (baseAnalytics.workerQueueMap[pendId] || []).filter((q) => q.remQty > 0);
    const openOutBatches = allLedger
      .filter((l) => l.direction === 'OUT' && l.workerName === wName && l.jobWorkType === jwUpper && baseAnalytics.outProgressMap[l.id] && baseAnalytics.outProgressMap[l.id].pendingQty > 0)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || 0) - (b.createdAt || 0));

    const queueSum = queue.reduce((s, q) => s + q.remQty, 0);
    _jwReturnSimCache = {
      queue: queue.map((q) => ({ bunkarName: q.bunkarName, remQty: q.remQty })),
      openingRem: Math.max(0, pendQty - queueSum),
      karigarMap: getKarigarMapSafe()
    };

    const batchesHtml = openOutBatches.length ? `
      <div class="stx-subpanel" style="margin-bottom:14px;">
        <div style="font-size:12px; font-weight:800; color:#1e3a8a; margin-bottom:6px;">📦 Open Outward Batches (FIFO — Purane pehle adjust honge):</div>
        <div style="overflow-x:auto;">
          <table style="font-size:12px;">
            <thead><tr><th>Date</th><th>Karigars</th><th>Progress</th></tr></thead>
            <tbody>
              ${openOutBatches.map((b) => {
                const p = baseAnalytics.outProgressMap[b.id];
                const kTxt = (p.items || []).filter((x) => x.pendingQty > 0).map((x) => `<b>${esc(x.bunkarName)}</b> (${x.pendingQty}/${x.sentQty})`).join(', ');
                return `<tr><td style="white-space:nowrap;">${esc(b.date)}</td><td><small>${kTxt}</small></td><td style="min-width:150px;">${buildProgressCell(p.totalQty, p.okQty, p.damageQty, p.pendingQty)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '';

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${isEdit ? '✏️ Edit Wapsi:' : ''} ${esc(inState.jwType)} → ${esc(inState.worker.name)} (Wapsi)</h2>
          <div style="display:flex; gap:6px;">
            ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="reverseLedgerEntry(${inState.editId}, '${esc(inState.returnTo || 'INWARD_HIST')}')">🗑️ Delete</button>` : ''}
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>

        <div style="background:#fef2f2; border:1px solid #fecaca; padding:12px 14px; border-radius:10px; margin-bottom:12px; font-size:15px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span>Is Karigar par Total Pending:</span>
          <b style="color:#dc2626; font-size:18px;">${pendQty} Pcs</b>
        </div>

        ${batchesHtml}

        <div class="grid-2" style="align-items:start;">
          <div><label>Date *</label><input type="date" id="jwRetDate" value="${esc(orig ? orig.date : todayISO())}" /></div>
          <div><label>OK Saree Wapas Aayi (Pcs) *</label><input type="number" id="jwRetQty" min="0" value="${isEdit && orig ? orig.qty : (pendQty > 0 ? pendQty : '')}" placeholder="e.g. 20" oninput="updateJWReturnPreview()" /></div>
          <div><label>Damage / Shortage (Pcs)</label><input type="number" id="jwRetDamage" min="0" value="${isEdit && orig ? (orig.damageQty || 0) : 0}" placeholder="0" oninput="updateJWReturnPreview()" /></div>
          <div><label>Note (Optional)</label><input id="jwRetNote" value="${esc(orig ? (orig.note || '') : '')}" placeholder="e.g. Ok checked" data-custom-enter="1" onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveJWReturnInward(); }" /></div>
        </div>

        <div id="jwRetPreviewBox" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:11px 13px; margin-top:12px; font-size:12.5px;"></div>

        <button class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%; height:44px;" onclick="saveJWReturnInward()">
          ${isEdit ? '✅ Update Wapsi & Sync Stock (Ctrl+S)' : '✅ Wapsi Save Karein (Auto Karigar Stock + Barcode)'}
        </button>
      </div>`;

    updateJWReturnPreview();
    setTimeout(() => { const el = document.getElementById('jwRetQty'); if (el) { el.focus(); el.select(); } }, 50);
  }
}

function updateJWReturnPreview() {
  const box = document.getElementById('jwRetPreviewBox');
  if (!box) return;
  const okQty = Math.max(0, parseInt(document.getElementById('jwRetQty')?.value, 10) || 0);
  const dmgQty = Math.max(0, parseInt(document.getElementById('jwRetDamage')?.value, 10) || 0);

  if (okQty + dmgQty <= 0) {
    box.innerHTML = `<span style="color:#64748b;">Upar <b>OK Wapsi Pcs</b> daalein — software khud dikhayega kis Karigar ki kitni saree wapas save hogi.</span>`;
    return;
  }

  let okLeft = okQty;
  if (_jwReturnSimCache.openingRem > 0 && okLeft > 0) {
    const usedOpen = Math.min(_jwReturnSimCache.openingRem, okLeft);
    okLeft -= usedOpen;
  }

  const allocs = [];
  for (const q of _jwReturnSimCache.queue) {
    if (okLeft <= 0) break;
    const take = Math.min(q.remQty, okLeft);
    if (take > 0) {
      okLeft -= take;
      const ex = allocs.find((a) => a.bunkarName === q.bunkarName);
      if (ex) ex.qty += take;
      else allocs.push({ bunkarName: q.bunkarName, qty: take });
    }
  }
  if (okLeft > 0) allocs.push({ bunkarName: _JW_POOL, qty: okLeft });

  const kMap = _jwReturnSimCache.karigarMap || {};
  const lines = allocs.map((a) => {
    const name = a.bunkarName === _JW_POOL ? 'POOL' : a.bunkarName;
    const mapped = a.bunkarName !== _JW_POOL ? kMap[a.bunkarName.toUpperCase()] : null;
    if (mapped && mapped.auto) {
      return `<div>✅ <b>${esc(name)}</b>: +${a.qty} Pcs &nbsp;→&nbsp; <span class="stx-pill stx-pill-info">⚡ Auto-Convert: ${esc(mapped.designName)}</span></div>`;
    }
    return `<div>✅ <b>${esc(name)}</b>: +${a.qty} Pcs &nbsp;→&nbsp; <span class="stx-pill stx-pill-warn">Karigar Stock me save hogi</span></div>`;
  }).join('');

  box.innerHTML = `
    <div style="font-weight:800; color:#1e3a8a; margin-bottom:4px;">📋 Wapsi Breakdown Preview:</div>
    <div style="display:flex; flex-direction:column; gap:4px;">${lines}</div>
    ${dmgQty > 0 ? `<div style="margin-top:5px; color:#dc2626; font-weight:700;">⚠️ Damage / Shortage: ${dmgQty} Pcs (Pending se kam hoga, stock me nahi judega)</div>` : ''}
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
  const allLogs = await dbGetAll('barcodingLogs');
  const linked = allLogs.filter((b) => Number(b.autoFromJwInId) === Number(jwInId));
  for (const log of linked) {
    await dbDelete('barcodingLogs', log.id);
  }
}

async function saveJWReturnInward() {
  try {
    const date = document.getElementById('jwRetDate').value || todayISO();
    const qty = Math.max(0, parseInt(document.getElementById('jwRetQty').value, 10) || 0);
    const damageQty = Math.max(0, parseInt(document.getElementById('jwRetDamage')?.value, 10) || 0);
    const note = document.getElementById('jwRetNote').value.trim();
    const jwUpper = inState.jwType.toUpperCase();
    const workerName = inState.worker.name.toUpperCase();

    if (qty + damageQty <= 0) return jwNotify('OK Pcs ya Damage Pcs me se kam se kam 1 daalein!', 'warn');

    const pend = await dbGet('jobWorkPending', `${workerName}__${jwUpper}`);
    const isEdit = !!inState.editId;
    const prevCleared = isEdit && inState.editOrig
      ? ((Number(inState.editOrig.qty) || 0) + (Number(inState.editOrig.damageQty) || 0))
      : 0;
    const pendQty = (pend ? pend.qty : 0) + prevCleared;

    if (qty + damageQty > pendQty && !confirm(`${workerName} par sirf ${pendQty} Pcs pending hai. Phir bhi ${qty} OK + ${damageQty} Dmg enter karna hai?`)) return;

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

    // Purane auto-convert logs saaf karke naye Karigar breakdown ke hisab se auto-convert banayein
    await deleteAutoConvertLogsForJwIn(savedId);

    const analytics = (typeof window.stxGetJWAnalytics === 'function')
      ? await window.stxGetJWAnalytics()
      : { inAllocMap: {} };
    const allocs = (analytics.inAllocMap && analytics.inAllocMap[savedId]) || [];
    const karigarMap = getKarigarMapSafe();

    const autoConvertedItems = [];
    const unmappedItems = [];

    for (const a of allocs) {
      if (!a || !a.qty || a.bunkarName === _JW_POOL) continue;
      const mapped = karigarMap[a.bunkarName.toUpperCase()];
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
      const autoHtml = autoConvertedItems.map((x) => `<li>⚡ <b>${esc(x.sourceName)}</b> (${x.qty} Pcs) → Auto-Convert <b>${esc(x.designName)}</b></li>`).join('');
      const unmapHtml = unmappedItems.map((x) => `<li>⏳ <b>${esc(x.sourceName)}</b> (${x.qty} Pcs) — New Karigar (1 baar Stock Convert karein)</li>`).join('');
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
      if (jwState.editId === id) { jwState.editId = null; jwState.meta = null; jwState.batchRows = []; jwState.step = returnTo === 'PASSBOOK' ? 'PASSBOOK' : 'OUT_LIST'; }
      if (inState.editId === id) { inState.editId = null; inState.editOrig = null; inState.step = 'HISTORY'; }
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
