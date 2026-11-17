// === SimpliTex Module 5 & 6 v2: Challan & A5 Packing Slip (Fast Indexed + Pending Order Tracker + Auto-Hide) ===

let challanState = {
  view: 'FORM',
  items: [],
  linkedOrderNo: '',
  loadedParty: '',
  partyOrders: [],
  allChallans: []
};

if (!window.stxComputeOrderStatus) {
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
    let totalOrdered = 0, totalSent = 0, totalPending = 0;
    const items = (order.items || []).map((it) => {
      const key = String(it.name || '').trim().toUpperCase();
      const ordQty = Number(it.qty) || 0;
      const usedSent = Math.min(ordQty, remainingPool[key] || 0);
      remainingPool[key] = Math.max(0, (remainingPool[key] || 0) - usedSent);
      const pendingQty = Math.max(0, ordQty - usedSent);
      totalOrdered += ordQty;
      totalSent += usedSent;
      totalPending += pendingQty;
      return { name: it.name, unit: it.unit || 'Pcs', rate: it.rate, orderedQty: ordQty, sentQty: usedSent, pendingQty };
    });
    return { orderNo: order.orderNo, totalOrdered, totalSent, totalPending, isComplete: (order.items || []).length > 0 && totalPending === 0, linkedChallansCount: linkedChallans.length, items };
  };
}

const _prevTabHookCh = window.onTabChanged;
window.onTabChanged = function (tabId) {
  if (_prevTabHookCh) _prevTabHookCh(tabId);
  if (tabId === 'tab-challan') {
    challanState.view = 'FORM';
    renderChallanModule();
  }
};

const _prevEscHookCh = window.handleModuleEscape;
window.handleModuleEscape = function () {
  if (_prevEscHookCh && _prevEscHookCh()) return true;
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (sec && sec.id === 'tab-challan' && challanState.view !== 'FORM') {
    challanState.view = 'FORM';
    renderChallanModule();
    return true;
  }
  return false;
};

function setPrintPageStyle(cssText) {
  if (typeof ensureOrderPrintSetup === 'function') ensureOrderPrintSetup(cssText);
  let pageSt = document.getElementById('simplitexDynamicPageCSS');
  if (!pageSt) {
    pageSt = document.createElement('style');
    pageSt.id = 'simplitexDynamicPageCSS';
    document.head.appendChild(pageSt);
  }
  pageSt.textContent = cssText;
}

async function renderChallanModule() {
  await openDB();
  if (typeof ensureOrderPrintSetup === 'function') ensureOrderPrintSetup();
  const box = document.getElementById('tab-challan');

  // === VIEW 1: SAVED CHALLANS LIST (Universal Search + 15-Row Pager) ===
  if (challanState.view === 'LIST') {
    const challans = (await dbGetAll('challans')).sort((a, b) => b.id - a.id);
    const firms = await dbGetAll('firms');

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 Saved Challans (${challans.length})</h2>
          <div>
            <button class="btn btn-dark btn-sm" onclick="challanState.view='FORM'; challanState.items=[]; challanState.linkedOrderNo=''; challanState.loadedParty=''; renderChallanModule();">+ Naya Challan</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        <div id="challanListPager"></div>
      </div>
    `;

    mountPagedList({
      id: 'challanListPager',
      items: challans,
      perPage: 15,
      placeholder: '🔍 Challan No., Party, City, Transport, Marka ya Saree search karein...',
      headHtml: '<tr><th>Challan #</th><th>Date</th><th>Firm</th><th>Party & City</th><th>Pcs / Amount</th><th>Print & Reverse</th></tr>',
      getSearchText: (c) => {
        const f = firms.find((x) => x.id === Number(c.firmId));
        const itemTxt = (c.items || []).map((it) => it.designName).join(' ');
        return `${c.challanNo} ${c.date} ${f ? f.shortCode : ''} ${c.partyName} ${c.partyCity} ${c.marka || ''} ${c.transport || ''} ${itemTxt}`;
      },
      renderRow: (c) => {
        const f = firms.find((x) => x.id === Number(c.firmId));
        return `
          <tr>
            <td><b>#${esc(c.challanNo)}</b>${c.orderNo ? `<br/><small style="color:#6b7280;">Ord #${esc(c.orderNo)}</small>` : ''}</td>
            <td style="white-space:nowrap;">${esc(c.date)}</td>
            <td><b>${esc(f ? f.shortCode : '-')}</b></td>
            <td><b>${esc(c.partyName)}</b><br/><small>${esc(c.partyCity || '')} | ${esc(c.transport || '')}</small></td>
            <td><b>${c.totalPcs} Pcs</b><br/><small>₹${Number(c.totalAmount || 0).toLocaleString('en-IN')}</small></td>
            <td style="white-space:nowrap;">
              <button class="btn btn-dark btn-sm" onclick="printChallanById(${c.id})">🖨️ Challan</button>
              <button class="btn btn-success btn-sm" onclick="printA5PackingSlipById(${c.id})">🏷️ A5 Slip</button>
              <button class="btn btn-danger btn-sm" onclick="reverseChallanById(${c.id})">↩️ Del</button>
            </td>
          </tr>
        `;
      },
      emptyHtml: '<tr><td colspan="6">Abhi koi Challan nahi bana hai</td></tr>'
    });
    return;
  }

  // === VIEW 2: NEW CHALLAN FORM (Fast Count & Next Challan No) ===
  challanState.loadedParty = '';
  challanState.partyOrders = [];
  challanState.allChallans = [];
  challanState.linkedOrderNo = '';

  const firms = await dbGetAll('firms');
  const parties = await dbGetAll('parties');
  const ready = await dbGetAll('readyStock');

  let totalChallansCount = 0;
  let nextChNo = 1;
  if (typeof dbCount === 'function' && typeof dbGetMaxField === 'function') {
    totalChallansCount = await dbCount('challans');
    nextChNo = (await dbGetMaxField('challans', 'challanNo')) + 1;
  } else {
    const allChallans = await dbGetAll('challans');
    totalChallansCount = allChallans.length;
    nextChNo = allChallans.length ? Math.max(...allChallans.map((c) => Number(c.challanNo) || 0)) + 1 : 1;
  }

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>5. Challan (Parcel ke Andar) & A5 Packing Slip</h2>
        <button class="btn btn-light btn-sm" onclick="if(window._stxPagerState) delete window._stxPagerState['challanListPager']; challanState.view='LIST'; renderChallanModule();">
          📜 Saved Challans (${totalChallansCount})
        </button>
      </div>

      <div class="grid-2">
        <div>
          <label>Firm Chunein *</label>
          <select id="chFirmId">
            ${firms.map((f) => `<option value="${f.id}">${esc(f.name)} (${esc(f.shortCode)})</option>`).join('')}
          </select>
        </div>
        <div><label>Challan No. *</label><input type="number" id="chNo" value="${nextChNo}" /></div>
        <div><label>Date *</label><input type="date" id="chDate" value="${todayISO()}" /></div>
        <div>
          <label>Party Name * (Pending Order Auto-Load)</label>
          <input id="chPartyName" list="chPartyList" placeholder="e.g. SHREE SHARDA SAREE" onchange="onChallanPartyChange()" />
          <datalist id="chPartyList">
            ${parties.map((p) => `<option value="${esc(p.name)}">`).join('')}
          </datalist>
        </div>
        <div>
          <label>Pending Order Link (Sirf Adhure Orders)</label>
          <select id="chOrderSelect" onchange="onChallanOrderSelectChange()">
            <option value="">-- Pehle Party Chunein --</option>
          </select>
        </div>
        <div><label>City *</label><input id="chPartyCity" placeholder="e.g. CHIPLOON, MUMBAI" /></div>
        <div><label>Full Address</label><input id="chPartyAddr" placeholder="Shop address..." /></div>
        <div><label>Marka</label><input id="chMarka" placeholder="e.g. SSS" /></div>
        <div><label>Transport</label><input id="chTransport" placeholder="e.g. VRL" /></div>
      </div>

      <!-- Live Pending Order Tracker Box -->
      <div id="chOrderTracker" style="margin-top:12px;"></div>

      <!-- Fast Barcode Scan Box -->
      <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:12px; border-radius:8px; margin:14px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:700; color:#1e3a8a;">
            Barcode Scan Karein ya Saree Chunein (Enter = Aage | Khali me Backspace = Piche):
          </span>
          <label style="margin:0; font-size:12px; color:#1e3a8a; display:flex; align-items:center; gap:4px; cursor:pointer;">
            <input type="checkbox" id="chAutoScan1" style="width:auto;" /> Scan pe 1 Pcs Auto-Add
          </label>
        </div>

        <div class="grid-2">
          <div>
            <label>Barcode Scan / Saree Name *</label>
            <input id="chScanInput" list="chReadyList" placeholder="Scan e.g. RASHMIKA KT" data-custom-enter="1"
                   onkeydown="if(event.key==='Enter'){ event.preventDefault(); handleChallanScan(); }" />
            <datalist id="chReadyList">
              ${ready.map((r) => `<option value="${esc(r.barcodeVal)}">${esc(r.designName)} (${esc(r.firmCode)}) - Stock: ${r.qty}</option>`).join('')}
            </datalist>
          </div>
          <div><label>Qty (Pcs) *</label><input type="number" id="chItemQty" min="1" value="1" /></div>
          <div>
            <label>Rate (₹) * (Enter se Add)</label>
            <input type="number" id="chItemRate" min="0" placeholder="Auto / Edit" data-custom-enter="1"
                   onkeydown="if(event.key==='Enter'){ event.preventDefault(); addChallanRow(); }" />
          </div>
          <div>
            <button type="button" class="btn btn-dark" style="height:40px;" onclick="addChallanRow()">+ Add Saree</button>
          </div>
        </div>
        <div id="chScanHint" style="font-size:12px; color:#15803d; margin-top:6px;"></div>
      </div>

      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>S.No</th><th>Saree / Design</th><th>Firm</th><th>Pcs</th><th>Rate (₹)</th><th>Amount (₹)</th><th>X</th></tr></thead>
          <tbody id="challanItemsBody"></tbody>
        </table>
      </div>

      <div class="grid-2" style="margin-top:12px;">
        <div style="font-size:16px; font-weight:800; padding:8px 0;">
          Total Pcs: <span id="chTotalPcs" style="color:#1d4ed8;">0</span> &nbsp;|&nbsp;
          Amount: <span id="chTotalAmt" style="color:#15803d;">₹0</span>
        </div>
        <div>
          <label>Remarks (Optional)</label>
          <input id="chRemarks" placeholder="Remarks..." />
        </div>
      </div>

      <button type="button" class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%;" onclick="saveChallanForm()">
        ✅ Save Challan & Print / A5 Packing Slip (Ctrl+S)
      </button>
    </div>
  `;

  renderChallanItemsTable();
  setTimeout(() => document.getElementById('chPartyName')?.focus(), 50);
}

async function onChallanPartyChange() {
  const partyName = document.getElementById('chPartyName').value.trim().toUpperCase();
  if (!partyName) return;

  challanState.loadedParty = partyName;
  const parties = await dbGetAll('parties');
  const p = parties.find((x) => x.name.toUpperCase() === partyName);
  if (p) {
    document.getElementById('chPartyCity').value = p.city || '';
    document.getElementById('chPartyAddr').value = p.address || p.city || '';
    document.getElementById('chMarka').value = p.marka || '';
    document.getElementById('chTransport').value = p.transport || '';
  }

  // Fast Indexed Query: Sirf is party ke orders aur challans load honge
  const partyOrdersRaw = (typeof dbGetByIndex === 'function')
    ? await dbGetByIndex('orders', 'partyName', partyName)
    : (await dbGetAll('orders')).filter((o) => o.partyName.toUpperCase() === partyName);

  const partyChallansRaw = (typeof dbGetByIndex === 'function')
    ? await dbGetByIndex('challans', 'partyName', partyName)
    : (await dbGetAll('challans')).filter((c) => (c.partyName || '').toUpperCase() === partyName);

  const partyOrders = partyOrdersRaw.sort((a, b) => b.id - a.id);
  challanState.partyOrders = partyOrders;
  challanState.allChallans = partyChallansRaw;

  // Sirf PENDING orders hi dropdown me rakhein (Complete orders dropdown se hata diye jayenge)
  const pendingOrders = [];
  partyOrders.forEach((o) => {
    const st = window.stxComputeOrderStatus(o, partyChallansRaw);
    if (!st.isComplete) pendingOrders.push({ order: o, status: st });
  });

  const ordSel = document.getElementById('chOrderSelect');
  if (pendingOrders.length) {
    ordSel.innerHTML = '<option value="">-- Bina Order Link --</option>' +
      pendingOrders.map(({ order: o, status: st }) =>
        `<option value="${o.orderNo}">Order #${o.orderNo} (${o.date}) — ${st.totalPending} Pcs Baki</option>`
      ).join('');
    ordSel.value = String(pendingOrders[0].order.orderNo);
    challanState.linkedOrderNo = String(pendingOrders[0].order.orderNo);
  } else if (partyOrders.length) {
    ordSel.innerHTML = '<option value="">-- Saare Orders Complete Ho Chuke Hain ✅ --</option>';
    challanState.linkedOrderNo = '';
  } else {
    ordSel.innerHTML = '<option value="">-- Is Party ka Koi Order Nahi --</option>';
    challanState.linkedOrderNo = '';
  }

  renderChallanOrderTracker();
}

function onChallanOrderSelectChange() {
  const ordSel = document.getElementById('chOrderSelect');
  challanState.linkedOrderNo = ordSel ? ordSel.value : '';
  renderChallanOrderTracker();
}

function getLinkedOrderLiveProgress() {
  const linkedNo = document.getElementById('chOrderSelect')?.value || challanState.linkedOrderNo;
  if (!linkedNo) return null;
  const order = (challanState.partyOrders || []).find((o) => String(o.orderNo) === String(linkedNo));
  if (!order) return null;

  const baseStatus = window.stxComputeOrderStatus(order, challanState.allChallans);
  const cartMap = {};
  (challanState.items || []).forEach((it) => {
    const key = String(it.designName || '').trim().toUpperCase();
    cartMap[key] = (cartMap[key] || 0) + (Number(it.qty) || 0);
  });

  const cartPool = { ...cartMap };
  let liveRemainingTotal = 0;
  const liveItems = baseStatus.items.map((it) => {
    const key = String(it.name || '').trim().toUpperCase();
    const inCart = Math.min(it.pendingQty, cartPool[key] || 0);
    cartPool[key] = Math.max(0, (cartPool[key] || 0) - inCart);
    const livePending = Math.max(0, it.pendingQty - inCart);
    liveRemainingTotal += livePending;
    return { ...it, inCartQty: inCart, livePendingQty: livePending };
  });

  return {
    order,
    baseStatus,
    liveItems,
    liveRemainingTotal,
    willCompleteNow: baseStatus.totalPending > 0 && liveRemainingTotal === 0
  };
}

function renderChallanOrderTracker() {
  const host = document.getElementById('chOrderTracker');
  if (!host) return;

  const partyName = document.getElementById('chPartyName')?.value.trim().toUpperCase();
  if (!partyName) { host.innerHTML = ''; return; }

  const progress = getLinkedOrderLiveProgress();
  if (!progress) {
    if ((challanState.partyOrders || []).length > 0) {
      host.innerHTML = `
        <div style="background:#f0fdf4; border:1px solid #86efac; color:#15803d; padding:10px 12px; border-radius:8px; font-size:12.5px; font-weight:700;">
          ✅ Is party ke saare (${challanState.partyOrders.length}) Order pure ho chuke hain! (Complete orders dropdown se hata diye gaye hain)
        </div>
      `;
    } else {
      host.innerHTML = '';
    }
    return;
  }

  const banner = progress.willCompleteNow
    ? `<div style="background:#dcfce7; border:1px solid #4ade80; color:#15803d; padding:8px 10px; border-radius:6px; font-weight:800; font-size:12.5px; margin-bottom:8px;">
         🎉 Is Challan ko Save karte hi Order #${esc(progress.order.orderNo)} PURA HO JAYEGA!
       </div>`
    : `<div style="font-size:12.5px; font-weight:700; color:#92400e; margin-bottom:6px;">
         ⏳ Order #${esc(progress.order.orderNo)} Pending Hisab — Abhi Total <b>${progress.liveRemainingTotal} Pcs</b> Aur Bhejna Hai:
       </div>`;

  host.innerHTML = `
    <div style="background:#fffbeb; border:1px solid #fcd34d; padding:10px 12px; border-radius:8px;">
      ${banner}
      <div style="overflow-x:auto;">
        <table style="font-size:12px; margin-top:4px;">
          <thead>
            <tr><th>Saree</th><th>Order</th><th>Pehle Bheja</th><th>Is Challan Me</th><th>Abhi Baki</th></tr>
          </thead>
          <tbody>
            ${progress.liveItems.map((it) => `
              <tr>
                <td><b>${esc(it.name)}</b></td>
                <td>${it.orderedQty}</td>
                <td>${it.sentQty}</td>
                <td>${it.inCartQty}</td>
                <td>${it.livePendingQty === 0
                  ? '<b style="color:#15803d;">0 (Pura ✅)</b>'
                  : `<b style="color:#b45309;">${it.livePendingQty} Pcs</b>`}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function findRateFromOrder(partyName, designName) {
  const pUpper = partyName.toUpperCase();
  let orders;
  if (challanState.loadedParty === pUpper && Array.isArray(challanState.partyOrders)) {
    orders = challanState.partyOrders;
  } else {
    const raw = (typeof dbGetByIndex === 'function')
      ? await dbGetByIndex('orders', 'partyName', pUpper)
      : (await dbGetAll('orders')).filter((o) => o.partyName.toUpperCase() === pUpper);
    orders = raw.sort((a, b) => b.id - a.id);
  }

  const linkedNo = document.getElementById('chOrderSelect')?.value;
  if (linkedNo) {
    const exactOrder = orders.find((o) => String(o.orderNo) === String(linkedNo));
    if (exactOrder) {
      const hit = exactOrder.items.find((it) => it.name.toUpperCase() === designName.toUpperCase());
      if (hit) return { rate: hit.rate, orderNo: exactOrder.orderNo, fromLinked: true };
    }
  }
  for (const ord of orders) {
    const hit = ord.items.find((it) => it.name.toUpperCase() === designName.toUpperCase());
    if (hit) return { rate: hit.rate, orderNo: ord.orderNo, fromLinked: false };
  }
  return null;
}

async function handleChallanScan() {
  const partyName = document.getElementById('chPartyName').value.trim().toUpperCase();
  if (partyName && challanState.loadedParty !== partyName) {
    await onChallanPartyChange();
  }

  const scanEl = document.getElementById('chScanInput');
  const raw = scanEl.value.trim().toUpperCase();
  if (!raw) return;

  const readyAll = await dbGetAll('readyStock');
  let matched = readyAll.find((r) => r.barcodeVal.toUpperCase() === raw);
  if (!matched) matched = readyAll.find((r) => r.designName.toUpperCase() === raw);

  const firms = await dbGetAll('firms');
  const activeFirm = firms.find((f) => f.id === Number(document.getElementById('chFirmId').value));
  const designName = matched ? matched.designName : raw.split(' ')[0];
  const firmCode = matched ? matched.firmCode : (raw.split(' ')[1] || (activeFirm ? activeFirm.shortCode : 'KT'));
  const availQty = matched ? matched.qty : 0;

  const rateInfo = partyName ? await findRateFromOrder(partyName, designName) : null;
  const progress = getLinkedOrderLiveProgress();
  const orderItem = progress
    ? progress.liveItems.find((it) => it.name.toUpperCase() === designName.toUpperCase())
    : null;

  const hint = document.getElementById('chScanHint');
  if (rateInfo) document.getElementById('chItemRate').value = rateInfo.rate;

  if (orderItem && orderItem.livePendingQty <= 0) {
    hint.style.color = '#b91c1c';
    hint.textContent = `⚠️ WARNING: "${designName}" ka Order #${progress.order.orderNo} poora ho chuka hai! (${orderItem.orderedQty}/${orderItem.orderedQty} bhej chuke ho) | Ready Stock: ${availQty} Pcs`;
  } else if (orderItem) {
    hint.style.color = '#15803d';
    hint.textContent = `✓ ${designName} (${firmCode}) | Ready Stock: ${availQty} Pcs | Order #${progress.order.orderNo} Rate: ₹${rateInfo ? rateInfo.rate : orderItem.rate} | Baki: ${orderItem.livePendingQty} Pcs`;
  } else if (rateInfo) {
    hint.style.color = '#15803d';
    hint.textContent = `✓ ${designName} (${firmCode}) | Ready Stock: ${availQty} Pcs | Purane Order #${rateInfo.orderNo} se Rate: ₹${rateInfo.rate}`;
  } else {
    hint.style.color = '#b45309';
    hint.textContent = `✓ ${designName} (${firmCode}) | Ready Stock: ${availQty} Pcs | Order me rate nahi mila (khud daalein)`;
  }

  if (document.getElementById('chAutoScan1').checked && rateInfo) {
    document.getElementById('chItemQty').value = 1;
    await addChallanRow();
    return;
  }

  const qEl = document.getElementById('chItemQty');
  qEl.focus();
  qEl.select();
}

async function addChallanRow() {
  const partyName = document.getElementById('chPartyName').value.trim().toUpperCase();
  if (partyName && challanState.loadedParty !== partyName) {
    await onChallanPartyChange();
  }

  const scanEl = document.getElementById('chScanInput');
  const qtyEl = document.getElementById('chItemQty');
  const rateEl = document.getElementById('chItemRate');
  const raw = scanEl.value.trim().toUpperCase();
  const qty = parseInt(qtyEl.value, 10);
  const rate = parseFloat(rateEl.value);

  if (!raw) { scanEl.focus(); return alert('Barcode scan karein ya Design naam daalein!'); }
  if (!qty || qty <= 0) { qtyEl.focus(); return alert('Sahi Qty daalein!'); }
  if (isNaN(rate) || rate < 0) { rateEl.focus(); return alert('Sahi Rate daalein!'); }

  const readyAll = await dbGetAll('readyStock');
  let matched = readyAll.find((r) => r.barcodeVal.toUpperCase() === raw) || readyAll.find((r) => r.designName.toUpperCase() === raw);

  const firms = await dbGetAll('firms');
  const activeFirm = firms.find((f) => f.id === Number(document.getElementById('chFirmId').value));
  const designName = matched ? matched.designName : raw.split(' ')[0];
  const firmCode = matched ? matched.firmCode : (raw.split(' ')[1] || (activeFirm ? activeFirm.shortCode : 'KT'));
  const skuKey = `${designName}__${firmCode}`;

  const progress = getLinkedOrderLiveProgress();
  if (progress) {
    const orderItem = progress.liveItems.find((it) => it.name.toUpperCase() === designName.toUpperCase());
    if (orderItem) {
      if (orderItem.livePendingQty <= 0) {
        if (!confirm(`⚠️ WARNING: "${designName}" ka Order #${progress.order.orderNo} pehle hi poora ho chuka hai (0 Pcs baki)!\nPhir bhi is Challan me ${qty} Pcs add karein?`)) {
          return;
        }
      } else if (qty > orderItem.livePendingQty) {
        if (!confirm(`⚠️ WARNING: "${designName}" ke sirf ${orderItem.livePendingQty} Pcs bhejna baki hai (Order: ${orderItem.orderedQty}).\nAap ${qty} Pcs add kar rahe ho—phir bhi add karein?`)) {
          return;
        }
      }
    }
  }

  const existing = challanState.items.find((it) => it.skuKey === skuKey && it.rate === rate);
  if (existing) {
    existing.qty += qty;
    existing.amount = existing.qty * existing.rate;
  } else {
    challanState.items.push({ skuKey, designName, firmCode, qty, rate, amount: qty * rate });
  }

  scanEl.value = '';
  qtyEl.value = '1';
  rateEl.value = '';
  document.getElementById('chScanHint').textContent = '';
  renderChallanItemsTable();
  scanEl.focus();
}

function removeChallanRow(idx) {
  challanState.items.splice(idx, 1);
  renderChallanItemsTable();
}

function renderChallanItemsTable() {
  const tbody = document.getElementById('challanItemsBody');
  if (!tbody) return;
  let totalPcs = 0, totalAmt = 0;

  tbody.innerHTML = challanState.items.map((it, i) => {
    totalPcs += it.qty;
    totalAmt += it.amount;
    return `
      <tr>
        <td>${i + 1}</td>
        <td><b>${esc(it.designName)}</b></td>
        <td>${esc(it.firmCode)}</td>
        <td><b>${it.qty}</b></td>
        <td>₹${it.rate}</td>
        <td><b>₹${it.amount.toLocaleString('en-IN')}</b></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="removeChallanRow(${i})">X</button></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" style="color:#6b7280;">Scan karke saree add karein...</td></tr>';

  document.getElementById('chTotalPcs').textContent = totalPcs;
  document.getElementById('chTotalAmt').textContent = '₹' + totalAmt.toLocaleString('en-IN');
  renderChallanOrderTracker();
}

async function saveChallanForm() {
  try {
    const firmId = Number(document.getElementById('chFirmId').value);
    const challanNo = parseInt(document.getElementById('chNo').value, 10);
    const date = document.getElementById('chDate').value || todayISO();
    const partyName = document.getElementById('chPartyName').value.trim().toUpperCase();
    const partyCity = document.getElementById('chPartyCity').value.trim().toUpperCase();
    const partyAddress = document.getElementById('chPartyAddr').value.trim().toUpperCase();
    const marka = document.getElementById('chMarka').value.trim().toUpperCase();
    const transport = document.getElementById('chTransport').value.trim().toUpperCase();
    const orderNo = document.getElementById('chOrderSelect').value || '';
    const remarks = document.getElementById('chRemarks').value.trim();

    if (!firmId) return alert('Pehle Settings me Firm add karein!');
    if (!partyName || !partyCity) return alert('Party Name aur City zaroori hai!');
    if (!challanState.items.length) return alert('Kam se kam 1 Saree add karein!');

    for (const it of challanState.items) {
      const r = await dbGet('readyStock', it.skuKey);
      const avail = r ? r.qty : 0;
      if (it.qty > avail) {
        if (!confirm(`"${it.designName} (${it.firmCode})" ka Ready Stock sirf ${avail} Pcs hai, aur aap ${it.qty} Pcs bhej rahe ho. Phir bhi save karein?`)) return;
      }
    }
    for (const it of challanState.items) {
      const r = await dbGet('readyStock', it.skuKey);
      if (r) {
        await dbPut('readyStock', { ...r, qty: Math.max(0, r.qty - it.qty), updatedAt: new Date().toISOString() });
      }
    }

    const totalPcs = challanState.items.reduce((s, x) => s + x.qty, 0);
    const totalAmount = challanState.items.reduce((s, x) => s + x.amount, 0);

    const chId = await dbPut('challans', {
      challanNo, date, firmId, orderNo, partyName, partyCity, partyAddress,
      marka, transport, items: challanState.items, totalPcs, totalAmount, remarks,
      createdAt: Date.now()
    });

    if (typeof refreshDashboard === 'function') await refreshDashboard();

    // Check Order Completion Status after saving (Fast Indexed Query)
    let orderMsg = '';
    if (orderNo) {
      const partyOrders = (typeof dbGetByIndex === 'function')
        ? await dbGetByIndex('orders', 'partyName', partyName)
        : (await dbGetAll('orders')).filter((o) => o.partyName.toUpperCase() === partyName);
      const partyChallans = (typeof dbGetByIndex === 'function')
        ? await dbGetByIndex('challans', 'partyName', partyName)
        : (await dbGetAll('challans')).filter((c) => (c.partyName || '').toUpperCase() === partyName);

      const linkedOrd = partyOrders.find((o) => String(o.orderNo) === String(orderNo));
      if (linkedOrd) {
        const st = window.stxComputeOrderStatus(linkedOrd, partyChallans);
        if (st.isComplete) {
          orderMsg = `\n🎉 Order #${orderNo} ab PURA HO CHUKA HAI! (Dropdown se hata diya gaya)\n`;
        } else {
          orderMsg = `\n⏳ Order #${orderNo} me abhi ${st.totalPending} Pcs bhejna baki hai.\n`;
        }
      }
    }

    const choice = prompt(
      `✅ Challan #${challanNo} Save ho gaya!` +
      orderMsg +
      `\n1 likhein -> Challan Print (Half-A4)\n` +
      `2 likhein -> A5 Packing Slip Print\n` +
      `(Cancel dabakar baad me Saved Challans se print karein)`,
      '1'
    );
    challanState.items = [];
    challanState.linkedOrderNo = '';
    challanState.loadedParty = '';
    await renderChallanModule();

    if (choice === '1') await printChallanById(chId);
    else if (choice === '2') await printA5PackingSlipById(chId);
  } catch (err) { alert('Challan Save Error: ' + err.message); }
}

// === PRINT 1: CHALLAN (Half-A4 / A5 Landscape) ===
async function printChallanById(id) {
  const c = await dbGet('challans', id);
  if (!c) return;
  const firm = (await dbGet('firms', Number(c.firmId))) || { name: 'SimpliTex Firm', address: '', phone: '', gstin: '' };

  setPrintPageStyle('@media print { @page { size: A5 landscape; margin: 6mm; } body { margin: 0; } }');

  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = `
    <div style="font-family:Arial,sans-serif; padding:10px; border:1.5px solid #000; max-width:196mm; margin:auto; font-size:11.5px;">
      <div style="display:flex; justify-content:space-between; border-bottom:1.5px solid #000; padding-bottom:6px;">
        <div>
          <div style="font-size:17px; font-weight:800;">${esc(firm.name)}</div>
          <div style="font-size:11px;">${esc(firm.address || '')}</div>
          ${firm.phone ? `<div style="font-size:11px;">Ph: ${esc(firm.phone)}</div>` : ''}
        </div>
        <div style="text-align:center; border:1px solid #000; padding:3px 10px; height:fit-content; font-weight:800;">DELIVERY CHALLAN</div>
        <div style="text-align:right; font-size:11.5px;">
          <div><b>Challan No.:</b> #${esc(c.challanNo)}</div>
          <div><b>Date:</b> ${esc(c.date)}</div>
          ${c.orderNo ? `<div><b>Order Ref:</b> #${esc(c.orderNo)}</div>` : ''}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:2fr 1fr; gap:8px; padding:6px 0; border-bottom:1px solid #000; font-size:11.5px;">
        <div>
          <div><b>M/s.:</b> ${esc(c.partyName)}</div>
          <div><b>Address:</b> ${esc(c.partyAddress || c.partyCity)}</div>
        </div>
        <div>
          <div><b>Marka:</b> ${esc(c.marka || '-')}</div>
          <div><b>Transport:</b> ${esc(c.transport || '-')}</div>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11.5px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="border:1px solid #000; padding:4px;">S.No</th>
            <th style="border:1px solid #000; padding:4px;">Saree / Design</th>
            <th style="border:1px solid #000; padding:4px;">Qty (Pcs)</th>
            <th style="border:1px solid #000; padding:4px;">Rate (₹)</th>
            <th style="border:1px solid #000; padding:4px;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${c.items.map((it, i) => `
            <tr>
              <td style="border:1px solid #000; padding:4px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #000; padding:4px;"><b>${esc(it.designName)}</b> <small>(${esc(it.firmCode)})</small></td>
              <td style="border:1px solid #000; padding:4px; text-align:center;"><b>${it.qty}</b></td>
              <td style="border:1px solid #000; padding:4px; text-align:right;">₹${it.rate}</td>
              <td style="border:1px solid #000; padding:4px; text-align:right;"><b>₹${it.amount.toLocaleString('en-IN')}</b></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f3f4f6; font-weight:800;">
            <td colspan="2" style="border:1px solid #000; padding:5px; text-align:right;">TOTAL</td>
            <td style="border:1px solid #000; padding:5px; text-align:center;">${c.totalPcs} Pcs</td>
            <td style="border:1px solid #000; padding:5px;"></td>
            <td style="border:1px solid #000; padding:5px; text-align:right;">₹${Number(c.totalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
        </tfoot>
      </table>

      ${c.remarks ? `<div style="margin-top:6px; font-size:11px;"><b>Remarks:</b> ${esc(c.remarks)}</div>` : ''}
      <div style="display:flex; justify-content:space-between; margin-top:16px; font-size:11px;">
        <div>Receiver Sign</div>
        <div><b>For: ${esc(firm.name)}</b></div>
      </div>
    </div>
  `;
  setTimeout(() => window.print(), 150);
}

// === PRINT 2: A5 PACKING SLIP (NO PARTY NAME!) ===
async function printA5PackingSlipById(id) {
  const c = await dbGet('challans', id);
  if (!c) return;

  const nagCount = parseInt(prompt('Is Challan ke kitne Parcel / Nag bane hain? (e.g. 1 ya 2)', '1'), 10);
  if (!nagCount || nagCount <= 0) return;

  setPrintPageStyle('@media print { @page { size: A5 portrait; margin: 6mm; } body { margin: 0; } }');

  let slipsHtml = '';
  for (let n = 1; n <= nagCount; n++) {
    slipsHtml += `
      <div style="width:100%; height:190mm; border:4px solid #000; padding:14px; box-sizing:border-box;
                  font-family:Arial,sans-serif; display:flex; flex-direction:column; justify-content:space-between;
                  page-break-after:always;">
        <div style="display:flex; justify-content:space-between; border-bottom:3px solid #000; padding-bottom:8px;">
          <div style="font-size:20px; font-weight:900; letter-spacing:1px;">PACKING SLIP</div>
          <div style="font-size:15px; font-weight:700;">Date: ${esc(c.date)}</div>
        </div>

        <div style="text-align:center; padding:14px 0; border-bottom:2px dashed #000;">
          <div style="font-size:14px; font-weight:700; color:#444;">DESTINATION / CITY</div>
          <div style="font-size:44px; font-weight:900; letter-spacing:1px; margin-top:4px;">${esc(c.partyCity)}</div>
        </div>

        <div style="text-align:center; padding:14px 0; border-bottom:2px dashed #000;">
          <div style="font-size:14px; font-weight:700; color:#444;">TRANSPORT</div>
          <div style="font-size:36px; font-weight:900; margin-top:4px;">${esc(c.transport || 'BY HAND')}</div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; text-align:center; padding:12px 0;">
          <div style="border:2px solid #000; padding:10px;">
            <div style="font-size:12px; font-weight:700;">CHALLAN NO.</div>
            <div style="font-size:30px; font-weight:900;">#${esc(c.challanNo)}</div>
          </div>
          <div style="border:2px solid #000; padding:10px;">
            <div style="font-size:12px; font-weight:700;">MARKA</div>
            <div style="font-size:28px; font-weight:900;">${esc(c.marka || '-')}</div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:3px solid #000; padding-top:10px; font-size:20px; font-weight:900;">
          <div>TOTAL PCS: ${c.totalPcs}</div>
          <div>PARCEL: ${n} / ${nagCount}</div>
        </div>
      </div>
    `;
  }

  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = slipsHtml;
  setTimeout(() => window.print(), 150);
}

async function reverseChallanById(id) {
  try {
    const c = await dbGet('challans', id);
    if (!c) return;
    if (!confirm(`Challan #${c.challanNo} Delete karke ${c.totalPcs} Pcs wapas Ready Stock me daalna hai?`)) return;

    for (const it of (c.items || [])) {
      const r = await dbGet('readyStock', it.skuKey);
      if (r) {
        await dbPut('readyStock', { ...r, qty: r.qty + it.qty, updatedAt: new Date().toISOString() });
      }
    }
    await dbDelete('challans', id);
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    renderChallanModule();
  } catch (err) { alert('Delete Error: ' + err.message); }
}
