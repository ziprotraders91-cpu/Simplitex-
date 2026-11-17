// === SimpliTex Module 4: Barcoding, Design Master & Sticker Print ===

const _BC_POOL = (typeof JW_POOL_KEY !== 'undefined') ? JW_POOL_KEY : '__JW_POOL__';
let bcState = { view: 'FORM', search: '', designsCache: [], readyCache: [] };

function ensureJsBarcodeLoaded() {
  if (typeof window.JsBarcode === 'function') return Promise.resolve(true);
  return new Promise((resolve) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.12.3/JsBarcode.all.min.js';
    sc.onload = () => resolve(true);
    sc.onerror = () => resolve(false);
    document.head.appendChild(sc);
  });
}

// Chained Tab & Esc Hooks
const _prevTabHookBC = window.onTabChanged;
window.onTabChanged = function (tabId) {
  if (_prevTabHookBC) _prevTabHookBC(tabId);
  if (tabId === 'tab-barcode') {
    bcState.view = 'FORM';
    ensureJsBarcodeLoaded();
    renderBarcodeModule();
  }
};

const _prevEscHookBC = window.handleModuleEscape;
window.handleModuleEscape = function () {
  if (_prevEscHookBC && _prevEscHookBC()) return true;
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (sec && sec.id === 'tab-barcode' && bcState.view !== 'FORM') {
    bcState.view = 'FORM';
    renderBarcodeModule();
    return true;
  }
  return false;
};

function buildDesignRowsHTML(queryStr) {
  const q = (queryStr || '').trim().toUpperCase();
  const filtered = q
    ? bcState.designsCache.filter((d) =>
        d.designName.includes(q) || (d.specLine || '').toUpperCase().includes(q)
      )
    : bcState.designsCache;

  return filtered.slice(0, 150).map((d) => {
    const stList = bcState.readyCache.filter((r) => r.designName === d.designName && r.qty > 0);
    const stockTxt = stList.length ? stList.map((r) => `${r.firmCode}: ${r.qty}`).join(', ') : '0';
    return `
      <tr>
        <td><b>${esc(d.designName)}</b></td>
        <td><small>${esc(d.specLine || '-')}</small></td>
        <td><b>${esc(stockTxt)}</b></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-dark btn-sm" onclick="quickReprintPrompt('${esc(d.designName)}','${esc(d.specLine || '')}')">🖨️ Sticker</button>
          <button class="btn btn-danger btn-sm" onclick="deleteDesign('${esc(d.designName)}')">X</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="4">Koi Design nahi mila</td></tr>';
}

function filterDesignsLive(val) {
  bcState.search = val;
  const tbody = document.getElementById('bcDesignTableBody');
  if (tbody) tbody.innerHTML = buildDesignRowsHTML(val);
}

async function renderBarcodeModule() {
  await openDB();
  if (typeof ensureOrderPrintSetup === 'function') ensureOrderPrintSetup();
  const box = document.getElementById('tab-barcode');

  // === VIEW 1: DESIGN MASTER & READY STOCK ===
  if (bcState.view === 'DESIGNS') {
    bcState.designsCache = await dbGetAll('designs');
    bcState.readyCache = await dbGetAll('readyStock');

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>🎨 Design Master (${bcState.designsCache.length} Designs)</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>

        <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
          <input id="bcSearchInput" placeholder="Design search karein (e.g. RASHMIKA, 6350)..."
                 value="${esc(bcState.search)}" data-custom-enter="1"
                 oninput="filterDesignsLive(this.value)" style="flex:1; min-width:200px;" />
          <button class="btn btn-dark btn-sm" onclick="addNewDesignPrompt()">+ Naya Design</button>
        </div>

        <div style="overflow-x:auto;">
          <table>
            <thead><tr><th>Design Name</th><th>Quality / Spec Line</th><th>Ready Stock</th><th>Action</th></tr></thead>
            <tbody id="bcDesignTableBody">${buildDesignRowsHTML(bcState.search)}</tbody>
          </table>
        </div>
      </div>
    `;
    setTimeout(() => document.getElementById('bcSearchInput')?.focus(), 40);
    return;
  }

  // === VIEW 2: BARCODING RECORD / HISTORY ===
  if (bcState.view === 'HISTORY') {
    const logs = (await dbGetAll('barcodingLogs')).sort((a, b) => b.createdAt - a.createdAt);
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 Barcoding Record (${logs.length})</h2>
          <button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Back (Esc)</button>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead><tr><th>Date</th><th>Kahan se (Source)</th><th>Design & Firm</th><th>Pcs</th><th>Action</th></tr></thead>
            <tbody>
              ${logs.map((l) => `
                <tr>
                  <td style="white-space:nowrap;">${esc(l.date)}</td>
                  <td>${esc(l.sourceName === _BC_POOL ? 'Job Work Pool' : l.sourceName)}</td>
                  <td><b>${esc(l.designName)} ${esc(l.firmCode)}</b><br/><small>${esc(l.specLine || '')}</small></td>
                  <td><b>${l.qty}</b></td>
                  <td style="white-space:nowrap;">
                    <button class="btn btn-dark btn-sm" onclick="printBarcodeStickers('${esc(l.specLine || '')}','${esc(l.designName)}','${esc(l.firmCode)}',${l.qty},'THERMAL')">🖨️</button>
                    <button class="btn btn-danger btn-sm" onclick="reverseBarcodingLog(${l.id})">↩️ Delete</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5">Abhi koi Barcoding entry nahi hui</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
    return;
  }

  // === VIEW 3: MAIN BARCODING FORM ===
  const stocks = (await dbGetAll('bunkarStock')).filter((s) => s.qty > 0);
  const firms = await dbGetAll('firms');
  const designs = await dbGetAll('designs');

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>4. Barcoding (Stock Convert & Sticker Print)</h2>
        <div>
          <button class="btn btn-light btn-sm" onclick="bcState.view='DESIGNS'; renderBarcodeModule();">🎨 Designs (${designs.length})</button>
          <button class="btn btn-dark btn-sm" onclick="bcState.view='HISTORY'; renderBarcodeModule();">📜 Record</button>
        </div>
      </div>

      ${!firms.length ? `<div style="background:#fef2f2; color:#b91c1c; padding:10px; border-radius:8px; margin-bottom:10px; font-size:13px;">
        ⚠️ Pehle <b>⚙️ Settings</b> me Firm Code (KT / IF) add karein!
      </div>` : ''}

      <div class="grid-2">
        <div><label>Date</label><input type="date" id="bcDate" value="${todayISO()}" /></div>
        <div>
          <label>Kahan se Saree Leni Hai (Bunkar / JW Pool) *</label>
          <select id="bcSource">
            ${stocks.length ? stocks.map((s) => `
              <option value="${esc(s.bunkarName)}">
                ${esc(s.bunkarName === _BC_POOL ? 'JOB WORK WAPAS POOL' : s.bunkarName)} (Available: ${s.qty} Pcs)
              </option>
            `).join('') : '<option value="">-- Koi Unbarcoded Stock nahi hai --</option>'}
          </select>
        </div>

        <div>
          <label>Design / Saree Name * (e.g. RASHMIKA, 1020)</label>
          <input id="bcDesignName" list="bcDesignList" placeholder="e.g. RASHMIKA" oninput="onBCDesignInput()" />
          <datalist id="bcDesignList">
            ${designs.map((d) => `<option value="${esc(d.designName)}">`).join('')}
          </datalist>
        </div>

        <div>
          <label>Quality / Top Line (Sticker ke upar)</label>
          <input id="bcSpecLine" placeholder="e.g. 3.60 CM EMB JHALAR" oninput="updateStickerPreview()" />
        </div>

        <div>
          <label>Firm Short Code * (KT / IF)</label>
          <select id="bcFirmCode" onchange="updateStickerPreview()">
            ${firms.map((f) => `<option value="${esc(f.shortCode)}">${esc(f.name)} (${esc(f.shortCode)})</option>`).join('')}
          </select>
        </div>

        <div>
          <label>Quantity (Pcs & Stickers) *</label>
          <input type="number" id="bcQty" min="1" placeholder="e.g. 20" />
        </div>
      </div>

      <div class="grid-2" style="margin-top:10px;">
        <div>
          <label>Sticker Print Size</label>
          <select id="bcPrintMode">
            <option value="THERMAL">Thermal Roll (50mm x 25mm — 1 per label)</option>
            <option value="A4_GRID">A4 Sticker Sheet (Grid)</option>
          </select>
        </div>
        <div style="display:flex; align-items:flex-end;">
          <div id="bcLivePreview" style="border:1px solid #9ca3af; border-radius:8px; padding:8px 12px; width:100%; text-align:center; background:#fff;">
            <div style="font-size:10px; font-weight:700;" id="prevSpec">3.60 CM EMB JHALAR</div>
            <div style="font-size:16px; font-weight:800; letter-spacing:0.5px;" id="prevDesign">RASHMIKA</div>
            <svg id="prevBarcodeSvg" style="max-width:100%; height:34px;"></svg>
            <div style="font-size:11px; font-weight:700;" id="prevBottom">RASHMIKA KT</div>
          </div>
        </div>
      </div>

      <button type="button" class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%;" onclick="saveAndPrintBarcoding()">
        🏷️ Save Stock Convert & Print Stickers (Ctrl+S)
      </button>
    </div>
  `;

  setTimeout(() => {
    updateStickerPreview();
    document.getElementById('bcDesignName')?.focus();
  }, 80);
}

async function onBCDesignInput() {
  const name = document.getElementById('bcDesignName').value.trim().toUpperCase();
  const d = name ? await dbGet('designs', name) : null;
  if (d && d.specLine && !document.getElementById('bcSpecLine').value.trim()) {
    document.getElementById('bcSpecLine').value = d.specLine;
  }
  updateStickerPreview();
}

async function updateStickerPreview() {
  const spec = (document.getElementById('bcSpecLine')?.value || '3.60 CM EMB JHALAR').trim().toUpperCase();
  const design = (document.getElementById('bcDesignName')?.value || 'RASHMIKA').trim().toUpperCase();
  const firm = (document.getElementById('bcFirmCode')?.value || 'KT').trim().toUpperCase();
  const codeVal = `${design} ${firm}`;

  const pSpec = document.getElementById('prevSpec');
  const pDes = document.getElementById('prevDesign');
  const pBot = document.getElementById('prevBottom');
  if (!pSpec) return;

  pSpec.textContent = spec;
  pDes.textContent = design;
  pBot.textContent = codeVal;

  await ensureJsBarcodeLoaded();
  if (typeof window.JsBarcode === 'function') {
    try {
      window.JsBarcode('#prevBarcodeSvg', codeVal, {
        format: 'CODE128', width: 1.5, height: 32, displayValue: false, margin: 0
      });
    } catch (_) {}
  }
}

async function saveAndPrintBarcoding() {
  try {
    const date = document.getElementById('bcDate').value || todayISO();
    const sourceName = document.getElementById('bcSource').value;
    const designName = document.getElementById('bcDesignName').value.trim().toUpperCase();
    const specLine = document.getElementById('bcSpecLine').value.trim().toUpperCase();
    const firmCode = document.getElementById('bcFirmCode').value.trim().toUpperCase();
    const qty = parseInt(document.getElementById('bcQty').value, 10);
    const printMode = document.getElementById('bcPrintMode').value;

    if (!sourceName) return alert('Source me unbarcoded stock nahi hai!');
    if (!designName) return alert('Design Name daalein!');
    if (!firmCode) return alert('Settings me Firm Code add karein!');
    if (!qty || qty <= 0) return alert('Sahi Quantity daalein!');

    const src = await dbGet('bunkarStock', sourceName);
    const avail = src ? src.qty : 0;
    if (qty > avail) return alert(`Is source me sirf ${avail} Pcs bache hain!`);

    const barcodeVal = `${designName} ${firmCode}`;
    const skuKey = `${designName}__${firmCode}`;

    await dbPut('bunkarStock', { bunkarName: sourceName, qty: avail - qty, updatedAt: new Date().toISOString() });

    const exDes = await dbGet('designs', designName);
    await dbPut('designs', {
      designName,
      specLine: specLine || (exDes ? exDes.specLine : ''),
      createdAt: exDes ? exDes.createdAt : Date.now()
    });

    const curReady = await dbGet('readyStock', skuKey);
    await dbPut('readyStock', {
      skuKey, designName, firmCode, specLine, barcodeVal,
      qty: (curReady ? curReady.qty : 0) + qty,
      updatedAt: new Date().toISOString()
    });

    await dbPut('barcodingLogs', {
      date, sourceName, designName, firmCode, specLine, barcodeVal, qty, createdAt: Date.now()
    });

    if (typeof refreshDashboard === 'function') await refreshDashboard();

    if (confirm(`✅ ${qty} Pcs "${barcodeVal}" Ready Stock me jud gayi!\nKya abhi ${qty} Stickers Print karne hain?`)) {
      await printBarcodeStickers(specLine, designName, firmCode, qty, printMode);
    }
    renderBarcodeModule();
  } catch (err) { alert('Barcoding Error: ' + err.message); }
}

async function printBarcodeStickers(specLine, designName, firmCode, count, mode) {
  await ensureJsBarcodeLoaded();
  if (typeof ensureOrderPrintSetup === 'function') ensureOrderPrintSetup();

  const codeVal = `${designName} ${firmCode}`;
  const isThermal = mode !== 'A4_GRID';

  let pageSt = document.getElementById('simplitexDynamicPageCSS');
  if (!pageSt) {
    pageSt = document.createElement('style');
    pageSt.id = 'simplitexDynamicPageCSS';
    document.head.appendChild(pageSt);
  }
  pageSt.textContent = isThermal
    ? `@media print { @page { size: 50mm 25mm; margin: 0; } body { margin: 0; } }`
    : `@media print { @page { size: A4; margin: 8mm; } }`;

  let labelsHtml = '';
  for (let i = 0; i < count; i++) {
    labelsHtml += `
      <div style="${isThermal
        ? 'width:50mm; height:25mm; padding:1.5mm 2mm; page-break-after:always;'
        : 'width:48mm; height:25mm; padding:2mm; border:1px dashed #ccc; display:inline-block; margin:1mm;'
      } box-sizing:border-box; text-align:center; font-family:Arial,sans-serif; overflow:hidden;">
        <div style="font-size:8px; font-weight:700; white-space:nowrap; overflow:hidden;">${esc(specLine || '')}</div>
        <div style="font-size:13px; font-weight:900; line-height:1.1; margin:1px 0;">${esc(designName)}</div>
        <svg class="stx-bc-svg" style="width:92%; height:9mm; display:block; margin:1px auto;"></svg>
        <div style="font-size:9px; font-weight:800; line-height:1;">${esc(codeVal)}</div>
      </div>
    `;
  }

  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = `<div style="${isThermal ? '' : 'text-align:left;'}">${labelsHtml}</div>`;

  if (typeof window.JsBarcode === 'function') {
    root.querySelectorAll('.stx-bc-svg').forEach((svg) => {
      window.JsBarcode(svg, codeVal, { format: 'CODE128', width: 1.4, height: 28, displayValue: false, margin: 0 });
    });
  }

  setTimeout(() => window.print(), 200);
}

async function addNewDesignPrompt() {
  const name = prompt('Design ka naam / number likhein (e.g. RASHMIKA, 1020):');
  if (!name || !name.trim()) return;
  const spec = prompt('Quality / Top Line (e.g. 3.60 CM EMB JHALAR):') || '';
  await dbPut('designs', { designName: name.trim().toUpperCase(), specLine: spec.trim().toUpperCase(), createdAt: Date.now() });
  renderBarcodeModule();
}

async function quickReprintPrompt(designName, specLine) {
  const firms = await dbGetAll('firms');
  const defaultCode = firms.length ? firms[0].shortCode : 'KT';
  const firmCode = prompt('Firm Code likhein (e.g. KT ya IF):', defaultCode);
  if (!firmCode) return;
  const qty = parseInt(prompt('Kitne Stickers print karne hain?', '10'), 10);
  if (!qty || qty <= 0) return;
  await printBarcodeStickers(specLine, designName, firmCode.trim().toUpperCase(), qty, 'THERMAL');
}

async function deleteDesign(designName) {
  if (!confirm(`"${designName}" Design Master se hatana hai?`)) return;
  await dbDelete('designs', designName);
  renderBarcodeModule();
}

async function reverseBarcodingLog(id) {
  try {
    const l = await dbGet('barcodingLogs', id);
    if (!l) return;
    if (!confirm(`Kya "${l.designName} ${l.firmCode}" (${l.qty} Pcs) ki Barcoding delete karke wapas source stock me dalna hai?`)) return;

    const skuKey = `${l.designName}__${l.firmCode}`;
    const ready = await dbGet('readyStock', skuKey);
    if (ready) {
      await dbPut('readyStock', { ...ready, qty: Math.max(0, ready.qty - l.qty), updatedAt: new Date().toISOString() });
    }
    const src = await dbGet('bunkarStock', l.sourceName);
    await dbPut('bunkarStock', { bunkarName: l.sourceName, qty: (src ? src.qty : 0) + l.qty, updatedAt: new Date().toISOString() });

    await dbDelete('barcodingLogs', id);
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    renderBarcodeModule();
  } catch (err) { alert('Reverse Error: ' + err.message); }
}
