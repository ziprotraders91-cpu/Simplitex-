// === SimpliTex Module 5 (Challan) & Module 6 (A5 Packing Slip - No Party Name) ===

let challanState = { view: 'FORM', items: [], linkedOrderNo: '' };

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
  if (typeof ensureOrderPrintSetup === 'function') ensureOrderPrintSetup();
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

  // === VIEW 1: SAVED CHALLANS LIST ===
  if (challanState.view === 'LIST') {
    const challans = (await dbGetAll('challans')).sort((a, b) => b.id - a.id);
    const firms = await dbGetAll('firms');

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 Saved Challans (${challans.length})</h2>
          <div>
            <button class="btn btn-dark btn-sm" onclick="challanState.view='FORM'; challanState.items=[]; renderChallanModule();">+ Naya Challan</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr><th>Challan #</th><th>Date</th><th>Firm</th><th>Party & City</th><th>Pcs / Amount</th><th>Print & Reverse</th></tr>
            </thead>
            <tbody>
              ${challans.map((c) => {
                const f = firms.find((x) => x.id === Number(c.firmId));
                return `
                  <tr>
                    <td><b>#${esc(c.challanNo)}</b></td>
                    <td>${esc(c.date)}</td>
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
              }).join('') || '<tr><td colspan="6">Abhi koi Challan nahi bana hai</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    return;
  }

  // === VIEW 2: NEW CHALLAN FORM ===
  const firms = await dbGetAll('firms');
  const parties = await dbGetAll('parties');
  const ready = await dbGetAll('readyStock');
  const allChallans = await dbGetAll('challans');
  const nextChNo = allChallans.length ? Math.max(...allChallans.map((c) => Number(c.challanNo) || 0)) + 1 : 1;

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>5. Challan (Parcel ke Andar) & A5 Packing Slip</h2>
        <button class="btn btn-light btn-sm" onclick="challanState.view='LIST'; renderChallanModule();">📜 Saved Challans (${allChallans.length})</button>
      </div>

      <div class="grid-2">
        <div>
          <label>Firm Chunein *</label>
          <select id="chFirmId">
            ${firms.map((f) => `<option value="${f.id}">${esc(f.name)} (${esc(f.shortCode)})</option>`).join('')}
          </select>
        </div>
        <div class="grid-2">
          <div><label>Challan No. *</label><input type="number" id="chNo" value="${nextChNo}" /></div>
          <div><label>Date *</label><input type="date" id="chDate" value="${todayISO()}" /></div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:10px;">
        <div>
          <label>Party Name * (Chunte hi Order Rate & Details aayegi)</label>
          <input id="chPartyName" list="chPartyList" placeholder="e.g. SHREE SHARDA SAREE" onchange="onChallanPartyChange()" />
          <datalist id="chPartyList">
            ${parties.map((p) => `<option value="${esc(p.name)}">`).join('')}
          </datalist>
        </div>
        <div>
          <label>Order Form Link (Rate Auto-Fetch ke liye)</label>
          <select id="chOrderSelect" onchange="challanState.linkedOrderNo=this.value;">
            <option value="">-- Latest Order Auto-Check --</option>
          </select>
        </div>
        <div><label>City *</label><input id="chPartyCity" placeholder="e.g. CHIPLOON, MUMBAI" /></div>
        <div><label>Full Address</label><input id="chPartyAddr" placeholder="Shop address..." /></div>
        <div><label>Marka</label><input id="chMarka" placeholder="e.g. SSS" /></div>
        <div><label>Transport</label><input id="chTransport" placeholder="e.g. VRL" /></div>
      </div>

      <!-- Fast Barcode Scan / Design Add Box -->
      <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:12px; border-radius:8px; margin:14px 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:700; color:#1e3a8a;">
            Barcode Scan Karein ya Saree Chunein (Rate Order Form se Auto-Fetch hoga):
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
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div><label>Qty (Pcs) *</label><input type="number" id="chItemQty" min="1" value="1" /></div>
            <div>
              <label>Rate (₹) * (Enter se Add)</label>
              <input type="number" id="chItemRate" min="0" placeholder="Auto / Edit" data-custom-enter="1"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); addChallanRow(); }" />
            </div>
          </div>
        </div>
        <div id="chScanHint" style="font-size:12px; color:#15803d; margin-top:6px;"></div>
        <button type="button" class="btn btn-dark btn-sm" style="margin-top:6px;" onclick="addChallanRow()">+ Add Saree</button>
      </div>

      <!-- Challan Items Table -->
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>S.No</th><th>Saree / Design</th><th>Firm</th><th>Pcs</th><th>Rate (₹)</th><th>Amount (₹)</th><th>X</th></tr></thead>
          <tbody id="challanItemsBody"></tbody>
        </table>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; flex-wrap:wrap; gap:10px;">
        <div style="font-size:16px; font-weight:800;">
          Total Pcs: <span id="chTotalPcs" style="color:#1d4ed8;">0</span> &nbsp;|&nbsp;
          Total Amount: <span id="chTotalAmt" style="color:#15803d;">₹0</span>
        </div>
        <div style="flex:1; min-width:200px;">
          <input id="chRemarks" placeholder="Remarks (Optional)..." />
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

// Party select karne par Address/Marka/Transport & uske Order Forms load karna
async function onChallanPartyChange() {
  const partyName = document.getElementById('chPartyName').value.trim().toUpperCase();
  if (!partyName) return;

  const parties = await dbGetAll('parties');
  const p = parties.find((x) => x.name.toUpperCase() === partyName);
  if (p) {
    document.getElementById('chPartyCity').value = p.city || '';
    document.getElementById('chPartyAddr').value = p.address || p.city || '';
    document.getElementById('chMarka').value = p.marka || '';
    document.getElementById('chTransport').value = p.transport || '';
  }

  const orders = (await dbGetAll('orders'))
    .filter((o) => o.partyName.toUpperCase() === partyName)
    .sort((a, b) => b.id - a.id);

  const ordSel = document.getElementById('chOrderSelect');
  ordSel.innerHTML = '<option value="">-- Latest Order Auto-Check --</option>' +
    orders.map((o) => `<option value="${o.orderNo}">Order #${o.orderNo} (${o.date}) — ${o.items.length} Items</option>`).join('');
  if (orders.length) {
    ordSel.value = String(orders[0].orderNo);
    challanState.linkedOrderNo = String(orders[0].orderNo);
  }
}

// Order Form se Rate Fetch karne ka Helper
async function findRateFromOrder(partyName, designName) {
  const orders = (await dbGetAll('orders'))
    .filter((o) => o.partyName.toUpperCase() === partyName.toUpperCase())
    .sort((a, b) => b.id - a.id);

  const linkedNo = document.getElementById('chOrderSelect')?.value;
  if (linkedNo) {
    const exactOrder = orders.find((o) => String(o.orderNo) === String(linkedNo));
    if (exactOrder) {
      const hit = exactOrder.items.find((it) => it.name.toUpperCase() === designName.toUpperCase());
      if (hit) return { rate: hit.rate, orderNo: exactOrder.orderNo };
    }
  }
  for (const ord of orders) {
    const hit = ord.items.find((it) => it.name.toUpperCase() === designName.toUpperCase());
    if (hit) return { rate: hit.rate, orderNo: ord.orderNo };
  }
  return null;
}

// Scan / Enter Par Barcode Lookup + Auto Rate Fetch
async function handleChallanScan() {
  const scanEl = document.getElementById('chScanInput');
  const raw = scanEl.value.trim().toUpperCase();
  if (!raw) return;

  const readyAll = await dbGetAll('readyStock');
  // Match "RASHMIKA KT" or just "RASHMIKA"
  let matched = readyAll.find((r) => r.barcodeVal.toUpperCase() === raw);
  if (!matched) matched = readyAll.find((r) => r.designName.toUpperCase() === raw);

  const firms = await dbGetAll('firms');
  const activeFirm = firms.find((f) => f.id === Number(document.getElementById('chFirmId').value));
  const designName = matched ? matched.designName : raw.split(' ')[0];
  const firmCode = matched ? matched.firmCode : (raw.split(' ')[1] || (activeFirm ? activeFirm.shortCode : 'KT'));
  const availQty = matched ? matched.qty : 0;

  const partyName = document.getElementById('chPartyName').value.trim().toUpperCase();
  const rateInfo = partyName ? await findRateFromOrder(partyName, designName) : null;

  const hint = document.getElementById('chScanHint');
  if (rateInfo) {
    document.getElementById('chItemRate').value = rateInfo.rate;
    hint.textContent = `✓ ${designName} (${firmCode}) | Ready Stock: ${availQty} Pcs | Order #${rateInfo.orderNo} se Rate: ₹${rateInfo.rate}`;
  } else {
    hint.textContent = `✓ ${designName} (${firmCode}) | Ready Stock: ${availQty} Pcs | Order me rate nahi mila (khud daalein)`;
  }

  // Agar "Auto-Add 1 Pc on Scan" ON hai aur rate mil gaya
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

  // Agar wahi design & rate pehle se table me hai toh qty merge kar do
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

    // Ready Stock Check & Minus (-)
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

    const choice = prompt(
      `✅ Challan #${challanNo} Save ho gaya!\n` +
      `1 likhein -> Challan Print/PDF (Parcel ke Andar)\n` +
      `2 likhein -> A5 Packing Slip Print (Parcel ke Bahar)\n` +
      `(Cancel dabakar baad me Saved Challans se print karein)`,
      '1'
    );
    challanState.items = [];
    await renderChallanModule();

    if (choice === '1') await printChallanById(chId);
    else if (choice === '2') await printA5PackingSlipById(chId);
  } catch (err) { alert('Challan Save Error: ' + err.message); }
}

// === PRINT 1: CHALLAN (Parcel ke Andar — Full Party + Rate Details) ===
async function printChallanById(id) {
  const c = await dbGet('challans', id);
  if (!c) return;
  const firm = (await dbGet('firms', Number(c.firmId))) || { name: 'SimpliTex Firm', address: '', phone: '', gstin: '' };

  setPrintPageStyle('@media print { @page { size: A4; margin: 10mm; } }');

  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = `
    <div style="font-family:Arial,sans-serif; padding:18px; border:2px solid #000; max-width:780px; margin:auto;">
      <div style="display:flex; justify-content:space-between; border-bottom:2px solid #000; padding-bottom:10px;">
        <div>
          <div style="font-size:22px; font-weight:800;">${esc(firm.name)}</div>
          <div style="font-size:12px;">${esc(firm.address || '')}</div>
          ${firm.phone ? `<div style="font-size:12px;">Ph: ${esc(firm.phone)}</div>` : ''}
        </div>
        <div style="text-align:center; border:1px solid #000; padding:4px 12px; height:fit-content; font-weight:800;">DELIVERY CHALLAN</div>
        <div style="text-align:right; font-size:13px;">
          <div><b>Challan No.:</b> #${esc(c.challanNo)}</div>
          <div><b>Date:</b> ${esc(c.date)}</div>
          ${c.orderNo ? `<div><b>Order Ref:</b> #${esc(c.orderNo)}</div>` : ''}
        </div>
      </div>

      <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px; padding:10px 0; border-bottom:1px solid #000; font-size:13px;">
        <div>
          <div><b>M/s.:</b> ${esc(c.partyName)}</div>
          <div><b>Address:</b> ${esc(c.partyAddress || c.partyCity)}</div>
        </div>
        <div>
          <div><b>Marka:</b> ${esc(c.marka || '-')}</div>
          <div><b>Transport:</b> ${esc(c.transport || '-')}</div>
        </div>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-top:10px; font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="border:1px solid #000; padding:6px;">S.No</th>
            <th style="border:1px solid #000; padding:6px;">Saree / Design</th>
            <th style="border:1px solid #000; padding:6px;">Qty (Pcs)</th>
            <th style="border:1px solid #000; padding:6px;">Rate (₹)</th>
            <th style="border:1px solid #000; padding:6px;">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${c.items.map((it, i) => `
            <tr>
              <td style="border:1px solid #000; padding:6px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #000; padding:6px;"><b>${esc(it.designName)}</b> <small>(${esc(it.firmCode)})</small></td>
              <td style="border:1px solid #000; padding:6px; text-align:center;"><b>${it.qty}</b></td>
              <td style="border:1px solid #000; padding:6px; text-align:right;">₹${it.rate}</td>
              <td style="border:1px solid #000; padding:6px; text-align:right;"><b>₹${it.amount.toLocaleString('en-IN')}</b></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f3f4f6; font-weight:800;">
            <td colspan="2" style="border:1px solid #000; padding:8px; text-align:right;">TOTAL</td>
            <td style="border:1px solid #000; padding:8px; text-align:center;">${c.totalPcs} Pcs</td>
            <td style="border:1px solid #000; padding:8px;"></td>
            <td style="border:1px solid #000; padding:8px; text-align:right;">₹${Number(c.totalAmount || 0).toLocaleString('en-IN')}</td>
          </tr>
        </tfoot>
      </table>

      ${c.remarks ? `<div style="margin-top:8px; font-size:12px;"><b>Remarks:</b> ${esc(c.remarks)}</div>` : ''}
      <div style="display:flex; justify-content:space-between; margin-top:28px; font-size:12px;">
        <div>Receiver Sign</div>
        <div><b>For: ${esc(firm.name)}</b></div>
      </div>
    </div>
  `;
  setTimeout(() => window.print(), 150);
}

// === PRINT 2: A5 PACKING SLIP (Parcel ke Bahar Chipkegi — NO PARTY NAME!) ===
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

// === GALTI SUDHAR: CHALLAN DELETE & STOCK WAPAS ===
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
