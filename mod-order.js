// === SimpliTex Module 3 v6: Pro Order Form ===
// Features: Exact 6 Party Fields (Name, Mob, GSTIN, Address, City, Agent),
// Fold Size Removed (Only Bottom Fold), Date Filter on Saved Orders,
// Clickable Order Rows -> Open Form + Multi-Dispatch Progress + Force Close + Accidental Delete Guard.

let orderState = {
  view: 'FORM', // 'FORM' | 'LIST'
  items: [],
  filter: 'ALL',
  fromDate: '',
  toDate: '',
  editId: null,
  origCreatedAt: null,
  forceClosed: false,
  draft: null,
  autoOrderNo: null
};

function ordNotify(msg, type = 'info') {
  if (typeof window.stxToast === 'function') window.stxToast(msg, type);
  else alert(msg);
}

window.stxComputeOrderStatus = function (order, allChallans) {
  const ordNo = String(order.orderNo);
  const ordParty = String(order.partyName || '').trim().toUpperCase();
  const linkedChallans = (allChallans || []).filter(
    (c) => String(c.orderNo || '') === ordNo &&
           (!c.partyName || String(c.partyName).trim().toUpperCase() === ordParty)
  );

  const sentMap = {};
  linkedChallans.forEach((c) => {
    (c.items || []).forEach((it) => {
      const key = String(it.designName || '').trim().toUpperCase();
      sentMap[key] = (sentMap[key] || 0) + (Number(it.qty) || 0);
    });
  });

  const remainingPool = { ...sentMap };
  let totalOrdered = 0;
  let totalSent = 0;
  let totalPending = 0;

  const itemBreakdown = (order.items || []).map((it) => {
    const key = String(it.name || '').trim().toUpperCase();
    const ordQty = Number(it.qty) || 0;
    const availSent = remainingPool[key] || 0;
    const usedSent = Math.min(ordQty, availSent);
    remainingPool[key] = Math.max(0, availSent - usedSent);

    const pendingQty = Math.max(0, ordQty - usedSent);
    totalOrdered += ordQty;
    totalSent += usedSent;
    totalPending += pendingQty;

    return {
      name: it.name,
      unit: it.unit || 'Pcs',
      rate: it.rate,
      orderedQty: ordQty,
      sentQty: usedSent,
      pendingQty
    };
  });

  const isForceClosed = !!order.forceClosed;
  const isComplete = isForceClosed || ((order.items || []).length > 0 && totalPending === 0);

  return {
    orderNo: order.orderNo,
    totalOrdered,
    totalSent,
    totalPending: isForceClosed ? 0 : totalPending,
    rawPending: totalPending,
    isForceClosed,
    isComplete,
    linkedChallansCount: linkedChallans.length,
    linkedChallans,
    items: itemBreakdown
  };
};

function ensureOrderPrintSetup(pageCss) {
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
  if (pageCss) {
    let pageSt = document.getElementById('simplitexDynamicPageCSS');
    if (!pageSt) {
      pageSt = document.createElement('style');
      pageSt.id = 'simplitexDynamicPageCSS';
      document.head.appendChild(pageSt);
    }
    pageSt.textContent = pageCss;
  }
}

const _prevTabHookOrder = window.onTabChanged;
window.onTabChanged = function (tabId) {
  if (_prevTabHookOrder) _prevTabHookOrder(tabId);
  if (tabId === 'tab-order') {
    orderState.view = 'FORM';
    orderState.editId = null;
    orderState.origCreatedAt = null;
    orderState.forceClosed = false;
    orderState.draft = null;
    orderState.autoOrderNo = null;
    orderState.items = [];
    renderOrderModule();
  }
};

const _prevEscHookOrder = window.handleModuleEscape;
window.handleModuleEscape = function () {
  if (_prevEscHookOrder && _prevEscHookOrder()) return true;
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (sec && sec.id === 'tab-order') {
    if (orderState.editId) {
      orderState.editId = null;
      orderState.origCreatedAt = null;
      orderState.forceClosed = false;
      orderState.draft = null;
      orderState.autoOrderNo = null;
      orderState.items = [];
      orderState.view = 'LIST';
      renderOrderModule();
      return true;
    }
    if (orderState.view === 'LIST') {
      orderState.view = 'FORM';
      renderOrderModule();
      return true;
    }
  }
  return false;
};

function setOrderListFilter(mode) {
  orderState.filter = mode;
  if (window._stxPagerState && window._stxPagerState['ordersListPager']) {
    window._stxPagerState['ordersListPager'].page = 1;
  }
  renderOrderModule();
}

async function renderOrderModule() {
  await openDB();
  ensureOrderPrintSetup();
  const box = document.getElementById('tab-order');

  // === VIEW 1: SAVED ORDERS LIST ===
  if (orderState.view === 'LIST') {
    const orders = (await dbGetAll('orders')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
    const allChallans = await dbGetAll('challans');
    const firms = await dbGetAll('firms');

    const challansByOrdNo = {};
    allChallans.forEach((c) => {
      if (!c.orderNo) return;
      const k = String(c.orderNo);
      if (!challansByOrdNo[k]) challansByOrdNo[k] = [];
      challansByOrdNo[k].push(c);
    });

    const dateFiltered = orders.filter((o) => {
      if (orderState.fromDate && (o.date || '') < orderState.fromDate) return false;
      if (orderState.toDate && (o.date || '') > orderState.toDate) return false;
      return true;
    });

    const enriched = dateFiltered.map((o) => ({
      order: o,
      status: window.stxComputeOrderStatus(o, challansByOrdNo[String(o.orderNo)] || [])
    }));

    const pendingCount = enriched.filter((x) => !x.status.isComplete).length;
    const completeCount = enriched.filter((x) => x.status.isComplete).length;

    const filteredRows = enriched.filter((x) => {
      if (orderState.filter === 'PENDING') return !x.status.isComplete;
      if (orderState.filter === 'COMPLETE') return x.status.isComplete;
      return true;
    });

    let sumOrd = 0, sumSent = 0, sumPend = 0;
    filteredRows.forEach((r) => {
      sumOrd += r.status.totalOrdered;
      sumSent += r.status.totalSent;
      sumPend += r.status.totalPending;
    });

    const fBtn = (mode) => orderState.filter === mode
      ? 'background:#0f172a; color:#fff; border:1px solid #0f172a;'
      : 'background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1;';

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📋 Saved Order Forms (${filteredRows.length})</h2>
          <div>
            <button class="btn btn-dark btn-sm" onclick="orderState.view='FORM'; orderState.items=[]; orderState.editId=null; orderState.forceClosed=false; orderState.draft=null; orderState.autoOrderNo=null; renderOrderModule();">+ Naya Order</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>

        <div class="stx-filter-bar">
          <div class="stx-f-item">
            <label>From Date</label>
            <input type="date" value="${esc(orderState.fromDate)}" onchange="orderState.fromDate=this.value; if(window._stxPagerState) delete window._stxPagerState['ordersListPager']; renderOrderModule();" />
          </div>
          <div class="stx-f-item">
            <label>To Date</label>
            <input type="date" value="${esc(orderState.toDate)}" onchange="orderState.toDate=this.value; if(window._stxPagerState) delete window._stxPagerState['ordersListPager']; renderOrderModule();" />
          </div>
          <button type="button" class="btn btn-light btn-sm" onclick="orderState.fromDate=''; orderState.toDate=''; orderState.filter='ALL'; if(window._stxPagerState) delete window._stxPagerState['ordersListPager']; renderOrderModule();">Reset</button>
        </div>

        <div class="stx-summary-strip">
          <div class="stx-summary-pill"><small>Orders</small><b>${filteredRows.length}</b></div>
          <div class="stx-summary-pill"><small>Total Ordered</small><b style="color:#2563eb;">${sumOrd} Pcs</b></div>
          <div class="stx-summary-pill"><small>Dispatched (Sent)</small><b style="color:#16a34a;">${sumSent} Pcs</b></div>
          <div class="stx-summary-pill"><small>Baki Pending</small><b style="color:#d97706;">${sumPend} Pcs</b></div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          <button type="button" class="btn btn-sm" style="${fBtn('ALL')}" onclick="setOrderListFilter('ALL')">Sabhi (${enriched.length})</button>
          <button type="button" class="btn btn-sm" style="${fBtn('PENDING')}" onclick="setOrderListFilter('PENDING')">⏳ Pending (${pendingCount})</button>
          <button type="button" class="btn btn-sm" style="${fBtn('COMPLETE')}" onclick="setOrderListFilter('COMPLETE')">✅ Complete (${completeCount})</button>
        </div>

        <div style="font-size:12px; color:#475569; margin-bottom:8px; font-weight:600;">
          💡 Kisi bhi Order par <b>click karne par uska poora Form</b> (Edit / Delete / Dispatch Hisab) khul jayega.
        </div>

        <div id="ordersListPager"></div>
      </div>
    `;

    mountPagedList({
      id: 'ordersListPager',
      items: filteredRows,
      perPage: 15,
      placeholder: '🔍 Order No., Party, Mob, GSTIN, City, Agent, Transport ya Saree search karein...',
      headHtml: '<tr><th>Order #</th><th>Date</th><th>Party & Agent</th><th>Items & Baki Maal</th><th>Status</th><th>Action</th></tr>',
      getSearchText: (row) => {
        const o = row.order;
        const f = firms.find((x) => x.id === Number(o.firmId));
        const itemNames = (o.items || []).map((it) => it.name).join(' ');
        const stTxt = row.status.isComplete ? 'COMPLETE PURA' : 'PENDING BAKI';
        return `${o.orderNo} ${o.date} ${f ? f.shortCode : ''} ${o.partyName} ${o.partyPhone || ''} ${o.partyGstin || ''} ${o.partyCity || ''} ${o.agent || ''} ${o.transport || ''} ${o.folderName || ''} ${itemNames} ${stTxt}`;
      },
      renderRow: (row) => {
        const o = row.order;
        const st = row.status;
        const f = firms.find((x) => x.id === Number(o.firmId));

        const itemLines = st.items.map((it) => {
          if (it.pendingQty === 0) {
            return `<span style="color:#16a34a;">${esc(it.name)} (✅ ${it.orderedQty})</span>`;
          }
          return `<span style="color:#b45309;"><b>${esc(it.name)}: ${it.pendingQty}/${it.orderedQty} baki</b></span>`;
        }).join(', ');

        const pct = st.totalOrdered > 0 ? Math.min(100, Math.round((st.totalSent / st.totalOrdered) * 100)) : 0;
        const statusBadge = st.isForceClosed
          ? `<span class="stx-pill stx-pill-ok">🔒 Short-Closed</span>`
          : (st.isComplete
            ? `<span class="stx-pill stx-pill-ok">✅ Pura (${st.linkedChallansCount} Ch.)</span>`
            : `<div>
                 <span class="stx-pill stx-pill-warn">⏳ ${st.totalPending}/${st.totalOrdered} Baki</span>
                 <div class="stx-prog-wrap"><div class="stx-prog-fill ${st.totalSent > 0 ? 'warn' : ''}" style="width:${pct}%;"></div></div>
               </div>`);

        return `
          <tr class="stx-row-click" onclick="editOrderById(${o.id})">
            <td><b>#${esc(o.orderNo)}</b><br/><small style="color:#64748b;">${esc(f ? f.shortCode : '-')}</small></td>
            <td style="white-space:nowrap;">${esc(o.date)}</td>
            <td><b>${esc(o.partyName)}</b><br/><small style="color:#64748b;">${esc(o.partyCity || '')}${o.agent ? ' | Ag: ' + esc(o.agent) : ''}</small></td>
            <td><small>${itemLines}</small><br/><small style="color:#64748b;">${esc(o.packingType || '')} / ${esc(o.folderName || '')}</small></td>
            <td style="min-width:130px;">${statusBadge}</td>
            <td style="white-space:nowrap;" onclick="event.stopPropagation()">
              <button class="btn btn-dark btn-sm" title="Print" onclick="printOrderById(${o.id})">🖨️</button>
              <button class="btn btn-light btn-sm" title="Edit" onclick="editOrderById(${o.id})">✏️</button>
              <button class="btn btn-danger btn-sm" title="Delete" onclick="deleteOrderById(${o.id})">🗑️</button>
            </td>
          </tr>
        `;
      },
      emptyHtml: '<tr><td colspan="6">Koi Order nahi mila</td></tr>'
    });
    return;
  }

  // === VIEW 2: ORDER FORM ===
  const firms = await dbGetAll('firms');
  const parties = await dbGetAll('parties');
  const folders = await dbGetAll('folders');
  const designs = await dbGetAll('designs');

  let totalOrdersCount = 0;
  let nextOrderNo = 1;
  if (typeof dbCount === 'function' && typeof dbGetMaxField === 'function') {
    totalOrdersCount = await dbCount('orders');
    nextOrderNo = (await dbGetMaxField('orders', 'orderNo')) + 1;
  } else {
    const allOrders = await dbGetAll('orders');
    totalOrdersCount = allOrders.length;
    nextOrderNo = allOrders.length ? Math.max(...allOrders.map((o) => Number(o.orderNo) || 0)) + 1 : 1;
  }

  const d = orderState.draft;
  const isEdit = !!orderState.editId;
  orderState.autoOrderNo = isEdit ? null : nextOrderNo;

  const agentSet = new Set();
  parties.forEach((p) => { if (p.agent) agentSet.add(p.agent.toUpperCase()); });

  let editDispatchHtml = '';
  if (isEdit && d) {
    const allCh = (await dbGetByIndex('challans', 'partyName', String(d.partyName || '').toUpperCase()));
    const st = window.stxComputeOrderStatus({ orderNo: d.orderNo, partyName: d.partyName, items: orderState.items, forceClosed: orderState.forceClosed }, allCh);
    const chLinks = (st.linkedChallans || []).map((c) => `<b>#${esc(c.challanNo)}</b> (${esc(c.date)}: ${c.totalPcs} Pcs)`).join(', ');
    editDispatchHtml = `
      <div class="stx-subpanel" style="background:#eff6ff; border-color:#bfdbfe; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="font-size:13px; color:#1e3a8a;">
            <b>📊 Dispatch Status:</b> Ordered <b>${st.totalOrdered}</b> | Sent <b style="color:#16a34a;">${st.totalSent}</b> | Baki <b style="color:#d97706;">${st.totalPending} Pcs</b>
            ${chLinks ? `<div style="font-size:12px; margin-top:3px;">🚚 Challans: ${chLinks}</div>` : ''}
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${!st.isComplete ? `<button type="button" class="btn btn-dark btn-sm" onclick="toggleOrderForceClose(true)">🔒 Short-Close Order</button>` : (st.isForceClosed ? `<button type="button" class="btn btn-light btn-sm" onclick="toggleOrderForceClose(false)">🔓 Re-Open Order</button>` : '')}
            <button type="button" class="btn btn-dark btn-sm" onclick="printOrderById(${orderState.editId})">🖨️ Print</button>
            <button type="button" class="btn btn-danger btn-sm" onclick="deleteOrderById(${orderState.editId})">🗑️ Delete</button>
          </div>
        </div>
      </div>
    `;
  }

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>${isEdit ? `✏️ Edit Order Form (#${esc(d.orderNo)})` : '3. Order Form (Rate Fix & Order Entry)'}</h2>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${isEdit ? `<button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back to List</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="if(window._stxPagerState) delete window._stxPagerState['ordersListPager']; orderState.filter='ALL'; orderState.view='LIST'; renderOrderModule();">
            📋 Saved Orders (${totalOrdersCount})
          </button>
        </div>
      </div>

      ${editDispatchHtml}

      ${!firms.length ? `<div style="background:#fef2f2; color:#b91c1c; padding:10px; border-radius:8px; margin-bottom:10px; font-size:13px; font-weight:600;">
        ⚠️ Pehle <b>⚙️ Settings</b> me apni Firm add karein!
      </div>` : ''}

      <div class="grid-2" style="align-items:start;">
        <div>
          <label>Firm Chunein *</label>
          <select id="ordFirmId">
            ${firms.map((f) => `<option value="${f.id}" ${d && Number(d.firmId) === f.id ? 'selected' : ''}>${esc(f.name)} (${esc(f.shortCode)})</option>`).join('')}
          </select>
        </div>
        <div><label>Order No. *</label><input type="number" id="ordNo" value="${d ? esc(d.orderNo) : nextOrderNo}" /></div>
        <div><label>Date *</label><input type="date" id="ordDate" value="${d ? esc(d.date) : todayISO()}" /></div>
        <div>
          <label>1. Party Name (M/s.) *</label>
          <input id="ordPartyName" list="ordPartyList" value="${d ? esc(d.partyName) : ''}" placeholder="e.g. SHREE SHARDA SAREE" onchange="autoFillPartyInOrder()" />
          <datalist id="ordPartyList">
            ${parties.map((p) => `<option value="${esc(p.name)}">`).join('')}
          </datalist>
        </div>
        <div><label>2. Mob. No.</label><input id="ordPartyPhone" type="tel" value="${d ? esc(d.partyPhone || '') : ''}" placeholder="98xxxxxxxx" /></div>
        <div><label>3. GSTIN</label><input id="ordPartyGstin" value="${d ? esc(d.partyGstin || '') : ''}" placeholder="e.g. 27AA..." /></div>
        <div><label>4. Address</label><input id="ordPartyAddr" value="${d ? esc(d.partyAddress || '') : ''}" placeholder="Shop / Market address..." /></div>
        <div><label>5. City *</label><input id="ordPartyCity" value="${d ? esc(d.partyCity) : ''}" placeholder="e.g. CHIPLOON" /></div>
        <div style="grid-column: 1 / -1;">
          <label>6. Agent Name (Broker / Dalal)</label>
          <input id="ordAgent" list="ordAgentList" value="${d ? esc(d.agent) : ''}" placeholder="e.g. RAJESH JI / SELF" />
          <datalist id="ordAgentList">
            ${Array.from(agentSet).map((a) => `<option value="${esc(a)}">`).join('')}
          </datalist>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>📦 Saree Design & Rate Add Karein</h2>
        <span class="shortcut-hint">Enter = Aage | Backspace = Piche</span>
      </div>

      <div class="stx-subpanel">
        <div class="grid-2" style="align-items:start;">
          <div>
            <label>Particulars (Saree / Design Name) *</label>
            <input id="ordItemName" list="ordDesignList" placeholder="e.g. 1050, 1070, RASHMIKA" />
            <datalist id="ordDesignList">
              ${designs.map((des) => `<option value="${esc(des.designName)}">`).join('')}
            </datalist>
          </div>
          <div><label>Qty *</label><input type="number" id="ordItemQty" min="1" placeholder="e.g. 1000" /></div>
          <div>
            <label>Unit</label>
            <select id="ordItemUnit">
              <option value="Pcs">Pcs</option>
              <option value="Set">Set</option>
            </select>
          </div>
          <div><label>Rate (₹) *</label><input type="number" id="ordItemRate" min="1" placeholder="e.g. 750" /></div>
          <div style="grid-column: 1 / -1;">
            <label>Cancelled Colour (Enter se Add)</label>
            <input id="ordItemCancel" placeholder="e.g. B.Green Gold" data-custom-enter="1"
                   onkeydown="if(event.key==='Enter'){ event.preventDefault(); addOrderItem(); }" />
          </div>
        </div>
        <button type="button" class="btn btn-dark btn-sm" style="margin-top:10px;" onclick="addOrderItem()">+ Add Saree Row</button>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr><th>S.No</th><th>Particulars</th><th>Qty</th><th>Rate</th><th>Cancelled Colour</th><th>X</th></tr>
          </thead>
          <tbody id="orderItemsBody"></tbody>
        </table>
      </div>

      <div class="stx-subpanel" style="margin-top:14px;">
        <div class="grid-2" style="align-items:start;">
          <div><label>Marka / Through</label><input id="ordMarka" value="${d ? esc(d.marka) : ''}" placeholder="e.g. SSS" /></div>
          <div><label>Transport</label><input id="ordTransport" value="${d ? esc(d.transport) : ''}" placeholder="e.g. VRL" /></div>
          <div>
            <label>Packing Type *</label>
            <select id="ordPacking">
              <option value="Box" ${d && d.packingType === 'Box' ? 'selected' : ''}>Box</option>
              <option value="Paper" ${d && d.packingType === 'Paper' ? 'selected' : ''}>Paper</option>
              <option value="No Box" ${d && d.packingType === 'No Box' ? 'selected' : ''}>No Box</option>
            </select>
          </div>
          <div>
            <label>Fold / Folder *</label>
            <input id="ordFolder" list="ordFolderList" value="${d ? esc(d.folderName) : ''}" placeholder="e.g. Mishri, Book Fold" />
            <datalist id="ordFolderList">
              ${folders.map((f) => `<option value="${esc(f.name)}">`).join('')}
            </datalist>
          </div>
          <div style="grid-column: 1 / -1;">
            <label>Remarks</label>
            <input id="ordRemarks" value="${d ? esc(d.remarks) : ''}" placeholder="Koi special instruction..." data-custom-enter="1"
                   onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveOrderForm(); }" />
          </div>
        </div>

        <button type="button" class="btn btn-success primary-save-btn" style="margin-top:12px; width:100%; height:44px; font-size:14px;" onclick="saveOrderForm()">
          ${isEdit ? '✅ Update Order Form (Ctrl+S)' : '✅ Save Order Form (Ctrl+S)'}
        </button>
      </div>
    </div>
  `;

  renderOrderItemsTable();
  setTimeout(() => document.getElementById('ordPartyName')?.focus(), 50);
}

async function editOrderById(id) {
  const o = await dbGet('orders', id);
  if (!o) return;
  orderState.editId = o.id;
  orderState.origCreatedAt = o.createdAt || Date.now();
  orderState.forceClosed = !!o.forceClosed;
  orderState.autoOrderNo = null;
  orderState.items = (o.items || []).map((it) => ({ ...it }));
  orderState.draft = {
    firmId: o.firmId,
    orderNo: o.orderNo,
    date: o.date,
    partyName: o.partyName || '',
    partyPhone: o.partyPhone || '',
    partyGstin: o.partyGstin || '',
    partyAddress: o.partyAddress || o.partyCity || '',
    partyCity: o.partyCity || '',
    agent: o.agent || '',
    marka: o.marka || '',
    transport: o.transport || '',
    packingType: o.packingType || 'Box',
    folderName: o.folderName || '',
    remarks: o.remarks || ''
  };
  orderState.view = 'FORM';
  renderOrderModule();
}

async function toggleOrderForceClose(closed) {
  if (!orderState.editId) return;
  const o = await dbGet('orders', orderState.editId);
  if (!o) return;
  await dbPut('orders', { ...o, forceClosed: !!closed });
  orderState.forceClosed = !!closed;
  if (typeof refreshDashboard === 'function') await refreshDashboard();
  ordNotify(closed ? '🔒 Order Short-Close (Complete) mark ho gaya!' : '🔓 Order dobara Pending mein aa gaya', 'success');
  renderOrderModule();
}

async function autoFillPartyInOrder() {
  const name = document.getElementById('ordPartyName').value.trim().toUpperCase();
  if (!name) return;
  const parties = await dbGetAll('parties');
  const p = parties.find((x) => x.name.toUpperCase() === name);
  if (p) {
    if (document.getElementById('ordPartyPhone')) document.getElementById('ordPartyPhone').value = p.phone || '';
    if (document.getElementById('ordPartyGstin')) document.getElementById('ordPartyGstin').value = p.gstin || '';
    if (document.getElementById('ordPartyAddr')) document.getElementById('ordPartyAddr').value = p.address || p.city || '';
    document.getElementById('ordPartyCity').value = p.city || '';
    if (p.agent) document.getElementById('ordAgent').value = p.agent;
    if (p.marka) document.getElementById('ordMarka').value = p.marka;
    if (p.transport) document.getElementById('ordTransport').value = p.transport;
  }
}

function addOrderItem() {
  const nameEl = document.getElementById('ordItemName');
  const qtyEl = document.getElementById('ordItemQty');
  const rateEl = document.getElementById('ordItemRate');
  const name = nameEl.value.trim().toUpperCase();
  const qty = parseInt(qtyEl.value, 10);
  const unit = document.getElementById('ordItemUnit').value;
  const rate = parseFloat(rateEl.value);
  const cancelColor = document.getElementById('ordItemCancel').value.trim();

  if (!name) { nameEl.focus(); return ordNotify('Saree / Design ka naam daalein!', 'warn'); }
  if (!qty || qty <= 0) { qtyEl.focus(); return ordNotify('Sahi Qty daalein!', 'warn'); }
  if (!rate || rate <= 0) { rateEl.focus(); return ordNotify('Sahi Rate daalein!', 'warn'); }

  orderState.items.push({ name, qty, unit, rate, cancelColor });
  nameEl.value = '';
  qtyEl.value = '';
  rateEl.value = '';
  document.getElementById('ordItemCancel').value = '';
  renderOrderItemsTable();
  nameEl.focus();
}

function removeOrderItem(idx) {
  orderState.items.splice(idx, 1);
  renderOrderItemsTable();
}

function renderOrderItemsTable() {
  const tbody = document.getElementById('orderItemsBody');
  if (!tbody) return;
  tbody.innerHTML = orderState.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><b>${esc(it.name)}</b></td>
      <td>${it.qty} ${esc(it.unit)}</td>
      <td><b>₹${it.rate}</b></td>
      <td>${esc(it.cancelColor || '-')}</td>
      <td><button type="button" class="btn btn-danger btn-sm" onclick="removeOrderItem(${i})">X</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="color:#64748b;">Abhi koi saree add nahi hui hai</td></tr>';
}

async function saveOrderForm() {
  try {
    const firmId = Number(document.getElementById('ordFirmId').value);
    let orderNo = parseInt(document.getElementById('ordNo').value, 10);
    const date = document.getElementById('ordDate').value || todayISO();
    const partyName = document.getElementById('ordPartyName').value.trim().toUpperCase();
    const partyPhone = (document.getElementById('ordPartyPhone')?.value || '').trim();
    const partyGstin = (document.getElementById('ordPartyGstin')?.value || '').trim().toUpperCase();
    const partyAddress = (document.getElementById('ordPartyAddr')?.value || '').trim().toUpperCase();
    const partyCity = document.getElementById('ordPartyCity').value.trim().toUpperCase();
    const agent = document.getElementById('ordAgent').value.trim().toUpperCase();
    const marka = document.getElementById('ordMarka').value.trim().toUpperCase();
    const transport = document.getElementById('ordTransport').value.trim().toUpperCase();
    const packingType = document.getElementById('ordPacking').value;
    const folderName = document.getElementById('ordFolder').value.trim().toUpperCase();
    const remarks = document.getElementById('ordRemarks').value.trim();

    if (!firmId) return ordNotify('Pehle Settings me Firm add karein!', 'warn');
    if (!partyName) return ordNotify('Party Name (M/s.) daalna zaroori hai!', 'warn');
    if (!folderName) return ordNotify('Fold / Folder likhna zaroori hai (e.g. MISHRI)!', 'warn');
    if (!orderState.items.length) return ordNotify('Kam se kam 1 Saree add karein!', 'warn');

    const wasEdit = !!orderState.editId;

    if (!wasEdit && orderState.autoOrderNo !== null && orderNo === orderState.autoOrderNo) {
      const existingSame = await dbGetByIndex('orders', 'orderNo', orderNo);
      if (existingSame && existingSame.length > 0) {
        orderNo = (await dbGetMaxField('orders', 'orderNo')) + 1;
      }
    }

    await dbPut('folders', { name: folderName });

    const parties = await dbGetAll('parties');
    const exParty = parties.find((p) => p.name.toUpperCase() === partyName);
    const partyObj = exParty
      ? {
          ...exParty,
          name: partyName,
          phone: partyPhone || exParty.phone || '',
          gstin: partyGstin || exParty.gstin || '',
          address: partyAddress || exParty.address || partyCity || exParty.city || '',
          city: partyCity || exParty.city || '',
          agent: agent || exParty.agent || '',
          marka: marka || exParty.marka || '',
          transport: transport || exParty.transport || ''
        }
      : {
          name: partyName,
          phone: partyPhone,
          gstin: partyGstin,
          address: partyAddress || partyCity,
          city: partyCity,
          agent,
          marka,
          transport
        };
    const savedPartyId = await dbPut('parties', partyObj);

    const totalPcs = orderState.items.reduce((s, x) => s + (Number(x.qty) || 0), 0);
    const orderPayload = {
      orderNo, date, firmId, partyId: savedPartyId,
      partyName, partyPhone, partyGstin, partyAddress: partyAddress || partyCity, partyCity, agent,
      items: orderState.items, marka, transport, packingType, folderName, remarks,
      forceClosed: wasEdit ? !!orderState.forceClosed : false,
      createdAt: orderState.origCreatedAt || Date.now()
    };
    if (orderState.editId) orderPayload.id = orderState.editId;

    const orderId = await dbPut('orders', orderPayload);
    if (typeof refreshDashboard === 'function') await refreshDashboard();

    orderState.items = [];
    orderState.editId = null;
    orderState.origCreatedAt = null;
    orderState.forceClosed = false;
    orderState.draft = null;
    orderState.autoOrderNo = null;
    if (wasEdit) orderState.view = 'LIST';
    await renderOrderModule();

    if (typeof window.stxOpenModal === 'function') {
      window.stxOpenModal({
        title: `✅ Order #${orderNo} ${wasEdit ? 'Update' : 'Save'} Ho Gaya!`,
        bodyHtml: `
          <div style="font-size:14px;"><b>${esc(partyName)}</b> (${esc(partyCity || '-')})</div>
          <div style="margin-top:4px; font-weight:700; color:#0f172a;">Total: ${totalPcs} Pcs &nbsp;|&nbsp; ${esc(packingType)} / ${esc(folderName)}</div>
        `,
        buttons: [
          { label: '🖨️ Order Print / PDF', className: 'btn btn-dark', onClick: () => { stxCloseModal(); printOrderById(orderId); } },
          { label: 'Done', className: 'btn btn-success', onClick: () => stxCloseModal() }
        ]
      });
    } else {
      ordNotify(`Order #${orderNo} save ho gaya!`, 'success');
    }
  } catch (err) { ordNotify('Order Save Error: ' + err.message, 'error'); }
}

async function deleteOrderById(id) {
  const o = await dbGet('orders', id);
  if (!o) return;
  const doDelete = async () => {
    await dbDelete('orders', id);
    if (orderState.editId === id) {
      orderState.editId = null;
      orderState.draft = null;
      orderState.items = [];
      orderState.view = 'LIST';
    }
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    ordNotify(`Order #${o.orderNo} delete ho gaya`, 'info');
    renderOrderModule();
  };

  const totalPcs = (o.items || []).reduce((s, x) => s + (Number(x.qty) || 0), 0);
  if (typeof window.stxConfirmDelete === 'function') {
    window.stxConfirmDelete({
      title: '⚠️ Order Form Delete Karein?',
      detailsHtml: `<b>Order #:</b> ${esc(o.orderNo)}<br/><b>Party:</b> ${esc(o.partyName)} (${esc(o.partyCity || '-')})<br/><b>Date:</b> ${esc(o.date)} &nbsp;|&nbsp; <b>Total:</b> ${totalPcs} Pcs`,
      onConfirm: doDelete
    });
  } else if (confirm(`Kya Order #${o.orderNo} delete karna hai?`)) {
    await doDelete();
  }
}

// === PRINT ORDER FORM (Half-A4 / A5 Landscape) ===
async function printOrderById(id) {
  ensureOrderPrintSetup('@media print { @page { size: A5 landscape; margin: 6mm; } body { margin: 0; } }');
  const o = await dbGet('orders', id);
  if (!o) return;
  const firm = (await dbGet('firms', Number(o.firmId))) || { name: 'SimpliTex Firm', address: '', phone: '', gstin: '' };

  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = `
    <div style="font-family:Arial,sans-serif; padding:10px; border:1.5px solid #000; max-width:196mm; margin:auto; font-size:11.5px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1.5px solid #000; padding-bottom:6px;">
        <div>
          <div style="font-size:17px; font-weight:800; text-transform:uppercase;">${esc(firm.name)}</div>
          <div style="font-size:11px;">${esc(firm.address || '')}</div>
          ${firm.gstin ? `<div style="font-size:11px; font-weight:700;">GSTIN: ${esc(firm.gstin)}</div>` : ''}
        </div>
        <div style="text-align:center; border:1px solid #000; padding:3px 10px; font-weight:800;">ORDER FORM</div>
        <div style="text-align:right; font-size:11.5px;">
          <div><b>Order No.:</b> ${esc(o.orderNo)}</div>
          <div><b>Date:</b> ${esc(o.date)}</div>
          ${firm.phone ? `<div><b>Ph:</b> ${esc(firm.phone)}</div>` : ''}
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:6px 0; border-bottom:1px solid #000; font-size:12px;">
        <div>
          <div><b>M/s.:</b> ${esc(o.partyName)} ${o.partyPhone ? `| <b>Mob:</b> ${esc(o.partyPhone)}` : ''}</div>
          <div><b>Address:</b> ${esc(o.partyAddress || o.partyCity || '')} ${o.partyCity ? `| <b>City:</b> ${esc(o.partyCity)}` : ''}</div>
        </div>
        <div style="text-align:right;">
          ${o.partyGstin ? `<div><b>GSTIN:</b> ${esc(o.partyGstin)}</div>` : ''}
          ${o.agent ? `<div><b>Agent:</b> ${esc(o.agent)}</div>` : ''}
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11.5px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="border:1px solid #000; padding:4px;">S.No</th>
            <th style="border:1px solid #000; padding:4px;">Particulars</th>
            <th style="border:1px solid #000; padding:4px;">Qty</th>
            <th style="border:1px solid #000; padding:4px;">Rate</th>
            <th style="border:1px solid #000; padding:4px;">Cancelled Colour</th>
          </tr>
        </thead>
        <tbody>
          ${o.items.map((it, i) => `
            <tr>
              <td style="border:1px solid #000; padding:4px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #000; padding:4px;"><b>${esc(it.name)}</b></td>
              <td style="border:1px solid #000; padding:4px;">${it.qty} ${esc(it.unit)}</td>
              <td style="border:1px solid #000; padding:4px;">₹${it.rate}</td>
              <td style="border:1px solid #000; padding:4px;">${esc(it.cancelColor || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; font-size:11.5px; border:1px solid #000; padding:6px;">
        <div><b>Marka / Through:</b> ${esc(o.marka || '-')}</div>
        <div><b>Transport:</b> ${esc(o.transport || '-')}</div>
        <div><b>Packing:</b> ${esc(o.packingType)}</div>
        <div><b>Fold / Folder:</b> ${esc(o.folderName)}</div>
        <div style="grid-column:span 2;"><b>Remarks:</b> ${esc(o.remarks || '-')}</div>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:16px; font-size:11px;">
        <div>Subject to Mau Jurisdiction</div>
        <div><b>For: ${esc(firm.name)}</b></div>
      </div>
    </div>
  `;
  setTimeout(() => window.print(), 150);
}
