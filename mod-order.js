// === SimpliTex Module 3: Order Form (Photo Format + Dynamic Firm + Fold Mishri) ===

let orderState = { view: 'FORM', items: [], editId: null };

// Print CSS & Print Container ek baar inject karna
function ensureOrderPrintSetup() {
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
}

// Chained Hooks (taaki Module 1 & 2 ka hook kharab na ho)
const _prevTabHookOrder = window.onTabChanged;
window.onTabChanged = function (tabId) {
  if (_prevTabHookOrder) _prevTabHookOrder(tabId);
  if (tabId === 'tab-order') {
    orderState.view = 'FORM';
    renderOrderModule();
  }
};

const _prevEscHookOrder = window.handleModuleEscape;
window.handleModuleEscape = function () {
  if (_prevEscHookOrder && _prevEscHookOrder()) return true;
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (sec && sec.id === 'tab-order' && orderState.view === 'LIST') {
    orderState.view = 'FORM';
    renderOrderModule();
    return true;
  }
  return false;
};

async function renderOrderModule() {
  await openDB();
  ensureOrderPrintSetup();
  const box = document.getElementById('tab-order');

  if (orderState.view === 'LIST') {
    const orders = (await dbGetAll('orders')).sort((a, b) => b.id - a.id);
    const firms = await dbGetAll('firms');

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>Saved Order Forms (${orders.length})</h2>
          <div>
            <button class="btn btn-dark btn-sm" onclick="orderState.view='FORM'; orderState.items=[]; orderState.editId=null; renderOrderModule();">+ Naya Order</button>
            <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Order #</th><th>Date</th><th>Firm</th><th>Party & City</th>
                <th>Items</th><th>Pack / Fold</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${orders.map((o) => {
                const f = firms.find((x) => x.id === Number(o.firmId));
                return `
                  <tr>
                    <td><b>#${esc(o.orderNo)}</b></td>
                    <td>${esc(o.date)}</td>
                    <td><b>${esc(f ? f.shortCode : '-')}</b></td>
                    <td><b>${esc(o.partyName)}</b><br/><small>${esc(o.partyCity || '')}</small></td>
                    <td>${o.items.length} Designs</td>
                    <td>${esc(o.packingType || '')} / <b>${esc(o.folderName || '')}</b></td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-dark btn-sm" onclick="printOrderById(${o.id})">🖨️ Print/PDF</button>
                      <button class="btn btn-danger btn-sm" onclick="deleteOrderById(${o.id})">X</button>
                    </td>
                  </tr>
                `;
              }).join('') || '<tr><td colspan="7">Abhi koi Order save nahi hai</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    return;
  }

  // === ORDER FORM VIEW ===
  const firms = await dbGetAll('firms');
  const parties = await dbGetAll('parties');
  const folders = await dbGetAll('folders');
  const designs = await dbGetAll('designs');
  const allOrders = await dbGetAll('orders');
  const nextOrderNo = allOrders.length ? Math.max(...allOrders.map((o) => Number(o.orderNo) || 0)) + 1 : 1;

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>3. Order Form (Rate Fix & Order Entry)</h2>
        <div>
          <button class="btn btn-light btn-sm" onclick="orderState.view='LIST'; renderOrderModule();">📋 Saved Orders (${allOrders.length})</button>
        </div>
      </div>

      ${!firms.length ? `<div style="background:#fef2f2; color:#b91c1c; padding:10px; border-radius:8px; margin-bottom:10px; font-size:13px;">
        ⚠️ Pehle <b>⚙️ Settings</b> me apni Firm (Kamran Traders / Indian Fabrics) add karein!
      </div>` : ''}

      <!-- Firm, Order No, Date -->
      <div class="grid-2">
        <div>
          <label>Firm Chunein *</label>
          <select id="ordFirmId">
            ${firms.map((f) => `<option value="${f.id}">${esc(f.name)} (${esc(f.shortCode)})</option>`).join('')}
          </select>
        </div>
        <div class="grid-2">
          <div><label>Order No. *</label><input type="number" id="ordNo" value="${nextOrderNo}" /></div>
          <div><label>Date *</label><input type="date" id="ordDate" value="${todayISO()}" /></div>
        </div>
      </div>

      <!-- Party M/s. & City -->
      <div class="grid-2" style="margin-top:10px;">
        <div>
          <label>M/s. (Party Name) *</label>
          <input id="ordPartyName" list="ordPartyList" placeholder="e.g. SHREE SHARDA SAREE" onchange="autoFillPartyInOrder()" />
          <datalist id="ordPartyList">
            ${parties.map((p) => `<option value="${esc(p.name)}">`).join('')}
          </datalist>
        </div>
        <div>
          <label>City / Address *</label>
          <input id="ordPartyCity" placeholder="e.g. CHIPLOON" />
        </div>
      </div>

      <!-- Fast Keyboard Item Entry Box -->
      <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:12px; border-radius:8px; margin:14px 0;">
        <div style="font-size:12px; font-weight:700; color:#1e3a8a; margin-bottom:8px;">
          Saree Add Karein (Har box me Enter dabate jayein — Rate yahin fix hoga):
        </div>
        <div class="grid-2">
          <div>
            <label>Particulars (Saree / Design Name) *</label>
            <input id="ordItemName" list="ordDesignList" placeholder="e.g. RASHMIKA, 6350, CHANDERI" />
            <datalist id="ordDesignList">
              ${designs.map((d) => `<option value="${esc(d.designName)}">`).join('')}
            </datalist>
          </div>
          <div style="display:grid; grid-template-columns:1fr 90px 1fr; gap:6px;">
            <div><label>Qty *</label><input type="number" id="ordItemQty" min="1" placeholder="32" /></div>
            <div>
              <label>Unit</label>
              <select id="ordItemUnit">
                <option value="Pcs">Pcs</option>
                <option value="Set">Set</option>
              </select>
            </div>
            <div><label>Rate (₹) *</label><input type="number" id="ordItemRate" min="1" placeholder="750" /></div>
          </div>
          <div><label>Fold Size (Optional)</label><input id="ordItemFoldSize" placeholder="e.g. HANGER" /></div>
          <div>
            <label>Cancelled Colour (Optional — Enter se Add)</label>
            <input id="ordItemCancel" placeholder="e.g. B.Green Gold" data-custom-enter="1"
                   onkeydown="if(event.key==='Enter'){ event.preventDefault(); addOrderItem(); }" />
          </div>
        </div>
        <button type="button" class="btn btn-dark btn-sm" style="margin-top:8px;" onclick="addOrderItem()">+ Add Saree Row</button>
      </div>

      <!-- Items Table -->
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr><th>S.No</th><th>Particulars</th><th>Qty</th><th>Rate</th><th>Fold Size</th><th>Cancelled Colour</th><th>X</th></tr>
          </thead>
          <tbody id="orderItemsBody"></tbody>
        </table>
      </div>

      <!-- Bottom Section (Marka, Transport, Box/Paper/No Box, Folder, Remarks) -->
      <div style="background:#f9fafb; border:1px solid #d1d5db; padding:12px; border-radius:8px; margin-top:14px;">
        <div class="grid-2">
          <div><label>Marka / Through</label><input id="ordMarka" placeholder="e.g. SSS" /></div>
          <div><label>Transport</label><input id="ordTransport" placeholder="e.g. VRL" /></div>
          <div>
            <label>Packing Type *</label>
            <select id="ordPacking">
              <option value="Box">Box</option>
              <option value="Paper">Paper</option>
              <option value="No Box">No Box</option>
            </select>
          </div>
          <div>
            <label>Folder / Fold * (e.g. Mishri)</label>
            <div style="display:flex; gap:6px;">
              <select id="ordFolder">
                ${folders.map((f) => `<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-dark btn-sm" onclick="addNewFolderOption()">+ Add</button>
            </div>
          </div>
        </div>
        <div style="margin-top:10px;">
          <label>Remarks</label>
          <input id="ordRemarks" placeholder="Koi special instruction..." data-custom-enter="1"
                 onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveOrderForm(); }" />
        </div>
      </div>

      <button type="button" class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%;" onclick="saveOrderForm()">
        ✅ Save Order Form (Ctrl+S)
      </button>
    </div>
  `;

  renderOrderItemsTable();
  setTimeout(() => document.getElementById('ordPartyName')?.focus(), 50);
}

async function autoFillPartyInOrder() {
  const name = document.getElementById('ordPartyName').value.trim().toUpperCase();
  if (!name) return;
  const parties = await dbGetAll('parties');
  const p = parties.find((x) => x.name.toUpperCase() === name);
  if (p) {
    document.getElementById('ordPartyCity').value = p.city || '';
    if (p.marka) document.getElementById('ordMarka').value = p.marka;
    if (p.transport) document.getElementById('ordTransport').value = p.transport;
  }
}

async function addNewFolderOption() {
  const name = prompt('Naye Folder / Fold ka naam likhein (e.g. Mishri, Book Fold):');
  if (!name || !name.trim()) return;
  const clean = name.trim();
  await dbPut('folders', { name: clean });
  const sel = document.getElementById('ordFolder');
  const opt = document.createElement('option');
  opt.value = clean;
  opt.textContent = clean;
  sel.appendChild(opt);
  sel.value = clean;
}

function addOrderItem() {
  const nameEl = document.getElementById('ordItemName');
  const qtyEl = document.getElementById('ordItemQty');
  const rateEl = document.getElementById('ordItemRate');
  const name = nameEl.value.trim().toUpperCase();
  const qty = parseInt(qtyEl.value, 10);
  const unit = document.getElementById('ordItemUnit').value;
  const rate = parseFloat(rateEl.value);
  const foldSize = document.getElementById('ordItemFoldSize').value.trim().toUpperCase();
  const cancelColor = document.getElementById('ordItemCancel').value.trim();

  if (!name) { nameEl.focus(); return alert('Saree / Design ka naam daalein!'); }
  if (!qty || qty <= 0) { qtyEl.focus(); return alert('Sahi Qty daalein!'); }
  if (!rate || rate <= 0) { rateEl.focus(); return alert('Sahi Rate daalein!'); }

  orderState.items.push({ name, qty, unit, rate, foldSize, cancelColor });
  nameEl.value = '';
  qtyEl.value = '';
  rateEl.value = '';
  document.getElementById('ordItemFoldSize').value = '';
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
      <td>${esc(it.foldSize || '-')}</td>
      <td>${esc(it.cancelColor || '-')}</td>
      <td><button type="button" class="btn btn-danger btn-sm" onclick="removeOrderItem(${i})">X</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="color:#6b7280;">Abhi koi saree add nahi hui hai</td></tr>';
}

async function saveOrderForm() {
  const firmId = Number(document.getElementById('ordFirmId').value);
  const orderNo = parseInt(document.getElementById('ordNo').value, 10);
  const date = document.getElementById('ordDate').value || todayISO();
  const partyName = document.getElementById('ordPartyName').value.trim().toUpperCase();
  const partyCity = document.getElementById('ordPartyCity').value.trim().toUpperCase();
  const marka = document.getElementById('ordMarka').value.trim().toUpperCase();
  const transport = document.getElementById('ordTransport').value.trim().toUpperCase();
  const packingType = document.getElementById('ordPacking').value;
  const folderName = document.getElementById('ordFolder').value;
  const remarks = document.getElementById('ordRemarks').value.trim();

  if (!firmId) return alert('Pehle Settings me Firm add karein!');
  if (!partyName) return alert('Party Name (M/s.) daalna zaroori hai!');
  if (!orderState.items.length) return alert('Kam se kam 1 Saree add karein!');

  // Party Master me auto-save / update
  const parties = await dbGetAll('parties');
  const exParty = parties.find((p) => p.name.toUpperCase() === partyName);
  const partyObj = exParty
    ? { ...exParty, name: partyName, city: partyCity || exParty.city, marka: marka || exParty.marka, transport: transport || exParty.transport }
    : { name: partyName, city: partyCity, address: partyCity, phone: '', marka, transport };
  const savedPartyId = await dbPut('parties', partyObj);

  const orderId = await dbPut('orders', {
    orderNo, date, firmId, partyId: savedPartyId, partyName, partyCity,
    items: orderState.items, marka, transport, packingType, folderName, remarks,
    createdAt: Date.now()
  });

  if (confirm(`✅ Order #${orderNo} Save ho gaya! Kya abhi Print / PDF nikalna hai?`)) {
    await printOrderById(orderId);
  }
  orderState.items = [];
  renderOrderModule();
}

async function deleteOrderById(id) {
  if (!confirm('Kya ye Order delete karna hai?')) return;
  await dbDelete('orders', id);
  renderOrderModule();
}

// === PRINT / PDF ORDER FORM (Photo Format) ===
async function printOrderById(id) {
  ensureOrderPrintSetup();
  const o = await dbGet('orders', id);
  if (!o) return;
  const firm = (await dbGet('firms', Number(o.firmId))) || { name: 'SimpliTex Firm', address: '', phone: '', gstin: '' };

  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = `
    <div style="font-family:Arial,sans-serif; padding:18px; border:2px solid #000; max-width:780px; margin:auto;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:10px;">
        <div>
          <div style="font-size:22px; font-weight:800; text-transform:uppercase;">${esc(firm.name)}</div>
          <div style="font-size:12px;">${esc(firm.address || '')}</div>
          ${firm.gstin ? `<div style="font-size:12px; font-weight:700;">GSTIN: ${esc(firm.gstin)}</div>` : ''}
        </div>
        <div style="text-align:center; border:1px solid #000; padding:4px 12px; font-weight:800;">ORDER FORM</div>
        <div style="text-align:right; font-size:13px;">
          <div><b>Order No.:</b> ${esc(o.orderNo)}</div>
          <div><b>Date:</b> ${esc(o.date)}</div>
          ${firm.phone ? `<div><b>Ph:</b> ${esc(firm.phone)}</div>` : ''}
        </div>
      </div>

      <div style="padding:10px 0; border-bottom:1px solid #000; font-size:14px;">
        <b>M/s.:</b> ${esc(o.partyName)} &nbsp;&nbsp;|&nbsp;&nbsp; <b>City:</b> ${esc(o.partyCity || '')}
      </div>

      <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:13px;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="border:1px solid #000; padding:6px;">S.No</th>
            <th style="border:1px solid #000; padding:6px;">Particulars</th>
            <th style="border:1px solid #000; padding:6px;">Qty</th>
            <th style="border:1px solid #000; padding:6px;">Rate</th>
            <th style="border:1px solid #000; padding:6px;">Fold Size</th>
            <th style="border:1px solid #000; padding:6px;">Cancelled Colour</th>
          </tr>
        </thead>
        <tbody>
          ${o.items.map((it, i) => `
            <tr>
              <td style="border:1px solid #000; padding:6px; text-align:center;">${i + 1}</td>
              <td style="border:1px solid #000; padding:6px;"><b>${esc(it.name)}</b></td>
              <td style="border:1px solid #000; padding:6px;">${it.qty} ${esc(it.unit)}</td>
              <td style="border:1px solid #000; padding:6px;">₹${it.rate}</td>
              <td style="border:1px solid #000; padding:6px;">${esc(it.foldSize || '')}</td>
              <td style="border:1px solid #000; padding:6px;">${esc(it.cancelColor || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; font-size:13px; border:1px solid #000; padding:10px;">
        <div><b>Marka / Through:</b> ${esc(o.marka || '-')}</div>
        <div><b>Transport:</b> ${esc(o.transport || '-')}</div>
        <div><b>Packing:</b> ${esc(o.packingType)}</div>
        <div><b>Folder / Fold:</b> ${esc(o.folderName)}</div>
        <div style="grid-column:span 2;"><b>Remarks:</b> ${esc(o.remarks || '-')}</div>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:26px; font-size:12px;">
        <div>Subject to Mau Jurisdiction</div>
        <div><b>For: ${esc(firm.name)}</b></div>
      </div>
    </div>
  `;
  setTimeout(() => window.print(), 150);
}
