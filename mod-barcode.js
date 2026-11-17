// === SimpliTex Module 4 v7: Pro 2-Stage Barcoding (Toast/Modal + Offline JsBarcode + Type-to-Filter Picker) ===

const _BC_POOL = (typeof JW_POOL_KEY !== 'undefined') ? JW_POOL_KEY : '__JW_POOL__';
let bcState = { view: 'CONVERT', convertRows: [], editId: null, origLog: null };
let bcSourceListCache = [];
let bcPickerIndex = { bc: 0, sc: 0 };
let _jsBarcodeLoadPromise = null;

function bcNotify(msg, type = 'info') {
  if (typeof window.stxToast === 'function') window.stxToast(msg, type);
  else alert(msg);
}

function ensureJsBarcodeLoaded() {
  if (typeof window.JsBarcode === 'function') return Promise.resolve(true);
  if (_jsBarcodeLoadPromise) return _jsBarcodeLoadPromise;

  _jsBarcodeLoadPromise = new Promise((resolve) => {
    const loadFromCdn = () => {
      const cdn = document.createElement('script');
      cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.12.3/JsBarcode.all.min.js';
      cdn.onload = () => resolve(typeof window.JsBarcode === 'function');
      cdn.onerror = () => resolve(false);
      document.head.appendChild(cdn);
    };

    const local = document.createElement('script');
    local.src = './JsBarcode.all.min.js';
    local.onload = () => {
      if (typeof window.JsBarcode === 'function') resolve(true);
      else loadFromCdn();
    };
    local.onerror = () => loadFromCdn();
    document.head.appendChild(local);
  });

  return _jsBarcodeLoadPromise;
}

function getKarigarDesignMap() {
  try { return JSON.parse(localStorage.getItem('simplitex_karigar_design_map') || '{}'); } catch (_) { return {}; }
}

function saveKarigarDesignMap(sourceName, designName) {
  if (!sourceName || sourceName === _BC_POOL || !designName) return;
  const map = getKarigarDesignMap();
  map[sourceName.toUpperCase()] = designName.toUpperCase();
  localStorage.setItem('simplitex_karigar_design_map', JSON.stringify(map));
}

// Chained Tab & Esc Hooks
const _prevTabHookBC = window.onTabChanged;
window.onTabChanged = function (tabId) {
  if (_prevTabHookBC) _prevTabHookBC(tabId);
  if (tabId === 'tab-barcode') {
    bcState.editId = null;
    bcState.origLog = null;
    if (bcState.view !== 'FORM' && bcState.view !== 'CONVERT') bcState.view = 'CONVERT';
    ensureJsBarcodeLoaded();
    renderBarcodeModule();
  }
};

const _prevEscHookBC = window.handleModuleEscape;
window.handleModuleEscape = function () {
  if (_prevEscHookBC && _prevEscHookBC()) return true;
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  if (sec && sec.id === 'tab-barcode') {
    if (bcState.editId) {
      bcState.editId = null;
      bcState.origLog = null;
      bcState.view = 'HISTORY';
      renderBarcodeModule();
      return true;
    }
    if (bcState.view === 'DESIGNS' || bcState.view === 'HISTORY') {
      bcState.view = 'CONVERT';
      renderBarcodeModule();
      return true;
    }
  }
  return false;
};

function getBarcodeTopNavHtml(designCount) {
  const mStyle = (v) => bcState.view === v
    ? 'background:#0f172a; color:#fff; border:1px solid #0f172a;'
    : 'background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1;';

  return `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
      <button type="button" class="btn btn-sm" style="${mStyle('CONVERT')}" onclick="bcState.editId=null; bcState.origLog=null; bcState.view='CONVERT'; renderBarcodeModule();">
        🔄 1. Stock Convert (Dukan / Order)
      </button>
      <button type="button" class="btn btn-sm" style="${mStyle('FORM')}" onclick="bcState.editId=null; bcState.origLog=null; bcState.view='FORM'; renderBarcodeModule();">
        🏷️ 2. Manual Barcoding (Challan)
      </button>
      <button type="button" class="btn btn-sm" style="${mStyle('DESIGNS')}" onclick="if(window._stxPagerState) delete window._stxPagerState['bcDesignPager']; bcState.editId=null; bcState.view='DESIGNS'; renderBarcodeModule();">
        🎨 Designs (${designCount})
      </button>
      <button type="button" class="btn btn-sm" style="${mStyle('HISTORY')}" onclick="if(window._stxPagerState) delete window._stxPagerState['bcHistoryPager']; bcState.editId=null; bcState.view='HISTORY'; renderBarcodeModule();">
        📜 Record
      </button>
    </div>
  `;
}

// === TYPE-TO-FILTER SOURCE PICKER ===
function buildSourcePickerHtml(prefix, labelText, placeholderEmpty) {
  const hasStock = bcSourceListCache.length > 0;
  const ph = hasStock
    ? (prefix === 'sc' ? 'Karigar naam type karein (e.g. FA)...' : 'Converted Design type karein (e.g. 1070)...')
    : placeholderEmpty;
  return `
    <div>
      <label>${labelText}</label>
      <input type="hidden" id="${prefix}Source" value="" />
      <div style="position:relative;">
        <input id="${prefix}SourceSearch"
               autocomplete="off"
               data-custom-enter="1"
               data-no-back="1"
               placeholder="${ph}"
               onfocus="openSourcePicker('${prefix}')"
               oninput="onSourceSearchInput('${prefix}')"
               onkeydown="handleSourcePickerKey('${prefix}', event)"
               onblur="setTimeout(() => closeSourcePicker('${prefix}'), 180)" />
        <div id="${prefix}SourceDrop"
             style="display:none; position:absolute; left:0; right:0; top:100%; margin-top:2px; z-index:60; background:#fff; border:1px solid #94a3b8; border-radius:8px; max-height:220px; overflow-y:auto; box-shadow:0 10px 24px rgba(0,0,0,0.16);">
        </div>
      </div>
      <div id="${prefix}SourceAvlHint" style="font-size:11.5px; color:#16a34a; font-weight:700; margin-top:3px; min-height:15px;"></div>
    </div>
  `;
}

function getFilteredSourceItems(prefix, query) {
  const q = String(query || '').trim().toUpperCase();
  const usedInConvert = (prefix === 'sc' && !bcState.editId)
    ? bcState.convertRows.reduce((m, r) => { m[r.sourceName] = (m[r.sourceName] || 0) + r.qty; return m; }, {})
    : {};

  const list = bcSourceListCache
    .map((s) => ({ ...s, remQty: Math.max(0, s.qty - (usedInConvert[s.value] || 0)) }))
    .filter((s) => s.remQty > 0);

  if (!q) return list;
  const starts = list.filter((s) => s.label.toUpperCase().startsWith(q));
  const contains = list.filter((s) => !s.label.toUpperCase().startsWith(q) && s.label.toUpperCase().includes(q));
  return [...starts, ...contains];
}

function openSourcePicker(prefix) {
  bcPickerIndex[prefix] = 0;
  const searchEl = document.getElementById(prefix + 'SourceSearch');
  renderSourcePickerDropdown(prefix, searchEl ? searchEl.value : '');
}

function closeSourcePicker(prefix) {
  const drop = document.getElementById(prefix + 'SourceDrop');
  if (drop) drop.style.display = 'none';
}

function onSourceSearchInput(prefix) {
  const searchEl = document.getElementById(prefix + 'SourceSearch');
  const hiddenEl = document.getElementById(prefix + 'Source');
  const hintEl = document.getElementById(prefix + 'SourceAvlHint');
  const q = (searchEl ? searchEl.value : '').trim().toUpperCase();

  if (hiddenEl) hiddenEl.value = '';
  if (hintEl) hintEl.textContent = '';
  bcPickerIndex[prefix] = 0;

  const exact = bcSourceListCache.find((s) => s.label.toUpperCase() === q || s.value.toUpperCase() === q);
  if (exact && hiddenEl) hiddenEl.value = exact.value;

  renderSourcePickerDropdown(prefix, q);
}

function renderSourcePickerDropdown(prefix, query) {
  const drop = document.getElementById(prefix + 'SourceDrop');
  if (!drop) return;

  const matches = getFilteredSourceItems(prefix, query);
  if (bcPickerIndex[prefix] >= matches.length) bcPickerIndex[prefix] = 0;

  if (!matches.length) {
    drop.innerHTML = `<div style="padding:10px 12px; font-size:12.5px; color:#64748b;">"${esc(query)}" ka koi stock nahi mila</div>`;
    drop.style.display = 'block';
    return;
  }

  drop.innerHTML = matches.map((m, idx) => {
    const active = idx === bcPickerIndex[prefix];
    return `
      <div class="bc-src-opt" data-idx="${idx}" data-val="${esc(m.value)}"
           onmousedown="event.preventDefault(); pickSourceItem('${prefix}', this.dataset.val)"
           style="padding:9px 12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f1f5f9; font-size:13px; background:${active ? '#eff6ff' : '#fff'};">
        <b style="color:#0f172a;">${esc(m.label)}</b>
        <span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:999px; font-size:11.5px; font-weight:700;">${m.remQty} Pcs</span>
      </div>
    `;
  }).join('');
  drop.style.display = 'block';
}

async function pickSourceItem(prefix, value) {
  const matches = getFilteredSourceItems(prefix, '');
  const found = matches.find((m) => m.value === value) || bcSourceListCache.find((m) => m.value === value);
  if (!found) return;

  const hiddenEl = document.getElementById(prefix + 'Source');
  const searchEl = document.getElementById(prefix + 'SourceSearch');
  const hintEl = document.getElementById(prefix + 'SourceAvlHint');
  if (hiddenEl) hiddenEl.value = found.value;
  if (searchEl) searchEl.value = found.label;
  if (hintEl) hintEl.textContent = `✓ Available Stock: ${found.remQty !== undefined ? found.remQty : found.qty} Pcs`;

  closeSourcePicker(prefix);

  if (prefix === 'sc') {
    await onSCSourceChange();
    const desEl = document.getElementById('scDesignName');
    if (desEl) { desEl.focus(); desEl.select(); }
  } else {
    const desEl = document.getElementById('bcDesignName');
    const specEl = document.getElementById('bcSpecLine');
    const qtyEl = document.getElementById('bcQty');
    if (desEl) desEl.value = found.value;
    if (specEl) {
      if (found.specLine) specEl.value = found.specLine;
      else await onBCDesignInput();
    }
    if (qtyEl) qtyEl.placeholder = `Max ${found.qty} Pcs`;
    updateStickerPreview();
    if (qtyEl) { qtyEl.focus(); qtyEl.select(); }
  }
}

function handleSourcePickerKey(prefix, e) {
  const drop = document.getElementById(prefix + 'SourceDrop');
  const searchEl = document.getElementById(prefix + 'SourceSearch');
  const matches = getFilteredSourceItems(prefix, searchEl ? searchEl.value : '');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!matches.length) return;
    bcPickerIndex[prefix] = (bcPickerIndex[prefix] + 1) % matches.length;
    renderSourcePickerDropdown(prefix, searchEl ? searchEl.value : '');
    const activeEl = drop?.querySelector(`.bc-src-opt[data-idx="${bcPickerIndex[prefix]}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!matches.length) return;
    bcPickerIndex[prefix] = (bcPickerIndex[prefix] - 1 + matches.length) % matches.length;
    renderSourcePickerDropdown(prefix, searchEl ? searchEl.value : '');
    const activeEl = drop?.querySelector(`.bc-src-opt[data-idx="${bcPickerIndex[prefix]}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (matches.length) pickSourceItem(prefix, (matches[bcPickerIndex[prefix]] || matches[0]).value);
    else closeSourcePicker(prefix);
    return;
  }
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeSourcePicker(prefix);
  }
}

async function renderBarcodeModule() {
  await openDB();
  if (typeof ensureOrderPrintSetup === 'function') ensureOrderPrintSetup();
  const box = document.getElementById('tab-barcode');
  const designs = await dbGetAll('designs');

  // === VIEW 1: DESIGN MASTER ===
  if (bcState.view === 'DESIGNS') {
    const ready = await dbGetAll('readyStock');
    const converted = await dbGetAll('convertedStock');
    const enriched = designs.map((d) => {
      const conv = converted.find((c) => c.designName === d.designName && c.qty > 0);
      const stList = ready.filter((r) => r.designName === d.designName && r.qty > 0);
      const readyTxt = stList.length ? stList.map((r) => `${r.firmCode}: ${r.qty}`).join(', ') : '0';
      return {
        ...d,
        convQty: conv ? conv.qty : 0,
        stockTxt: `Dukan: ${conv ? conv.qty : 0} | Challan: ${readyTxt}`
      };
    });

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>🎨 Design Master (${designs.length} Designs)</h2>
          <div>
            <button class="btn btn-dark btn-sm" onclick="addNewDesignPrompt()">+ Naya Design</button>
            <button class="btn btn-light btn-sm" onclick="bcState.view='CONVERT'; renderBarcodeModule();">← Back (Esc)</button>
          </div>
        </div>
        ${getBarcodeTopNavHtml(designs.length)}
        <div id="bcDesignPager"></div>
      </div>`;

    mountPagedList({
      id: 'bcDesignPager', items: enriched, perPage: 15,
      placeholder: '🔍 Design Name, Quality ya Firm Code search karein...',
      headHtml: '<tr><th>Design Name</th><th>Quality / Spec Line</th><th>Stock (Dukan / Challan)</th><th>Action</th></tr>',
      getSearchText: (d) => `${d.designName} ${d.specLine || ''} ${d.stockTxt}`,
      renderRow: (d) => `
        <tr>
          <td><b>${esc(d.designName)}</b></td>
          <td><small>${esc(d.specLine || '-')}</small></td>
          <td><small><b>${esc(d.stockTxt)}</b></small></td>
          <td style="white-space:nowrap;">
            <button class="btn btn-dark btn-sm" title="Print Stickers" onclick="quickReprintPrompt('${esc(d.designName)}','${esc(d.specLine || '')}')">🖨️</button>
            <button class="btn btn-light btn-sm" title="Edit" onclick="editDesignSpec('${esc(d.designName)}')">✏️</button>
            <button class="btn btn-danger btn-sm" title="Delete" onclick="deleteDesign('${esc(d.designName)}')">🗑️</button>
          </td>
        </tr>`,
      emptyHtml: '<tr><td colspan="4">Koi Design nahi mila</td></tr>'
    });
    return;
  }

  // === VIEW 2: BARCODING RECORD ===
  if (bcState.view === 'HISTORY') {
    const logs = (await dbGetAll('barcodingLogs')).sort((a, b) => b.createdAt - a.createdAt);
    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>📜 Stock Convert & Barcoding Record (${logs.length})</h2>
          <button class="btn btn-light btn-sm" onclick="bcState.view='CONVERT'; renderBarcodeModule();">← Back (Esc)</button>
        </div>
        ${getBarcodeTopNavHtml(designs.length)}
        <div id="bcHistoryPager"></div>
      </div>`;

    mountPagedList({
      id: 'bcHistoryPager', items: logs, perPage: 15,
      placeholder: '🔍 Date, Karigar, Design ya Firm search karein...',
      headHtml: '<tr><th>Date</th><th>Stage</th><th>Source</th><th>Design / Barcode</th><th>Pcs</th><th>Action</th></tr>',
      getSearchText: (l) => `${l.date} ${l.mode || ''} ${l.sourceName} ${l.designName} ${l.firmCode || ''} ${l.specLine || ''}`,
      renderRow: (l) => {
        const isConv = l.mode === 'STOCK_CONVERT';
        const codeTxt = isConv ? l.designName : `${l.designName} ${l.firmCode || ''}`.trim();
        return `
          <tr>
            <td style="white-space:nowrap;">${esc(l.date)}</td>
            <td><small>${isConv ? '🔄 Dukan Convert' : '🏷️ Challan Barcode'}</small></td>
            <td>${esc(l.sourceName === _BC_POOL ? 'Job Work Pool' : l.sourceName)}</td>
            <td><b>${esc(codeTxt)}</b><br/><small style="color:#64748b;">${esc(l.specLine || '')}</small></td>
            <td><b>${l.qty}</b></td>
            <td style="white-space:nowrap;">
              <button class="btn btn-dark btn-sm" title="Print Stickers" onclick="printBarcodeStickers('${esc(l.specLine || '')}','${esc(l.designName)}','${esc(l.firmCode || '')}',${l.qty},'THERMAL')">🖨️</button>
              <button class="btn btn-light btn-sm" title="Edit" onclick="editBarcodingLog(${l.id})">✏️</button>
              <button class="btn btn-danger btn-sm" title="Delete" onclick="reverseBarcodingLog(${l.id})">🗑️</button>
            </td>
          </tr>`;
      },
      emptyHtml: '<tr><td colspan="6">Abhi koi entry nahi hui</td></tr>'
    });
    return;
  }

  const firms = await dbGetAll('firms');
  const isEdit = !!(bcState.editId && bcState.origLog);
  const oLog = bcState.origLog;

  // === VIEW 3: STOCK CONVERT ===
  if (bcState.view === 'CONVERT') {
    const rawBunkar = await dbGetAll('bunkarStock');
    const bMap = {};
    rawBunkar.forEach((s) => { bMap[s.bunkarName] = s.qty; });
    if (isEdit && oLog.mode === 'STOCK_CONVERT') {
      bMap[oLog.sourceName] = (bMap[oLog.sourceName] || 0) + (Number(oLog.qty) || 0);
    }
    bcSourceListCache = Object.keys(bMap)
      .filter((k) => bMap[k] > 0)
      .map((k) => ({ value: k, label: k === _BC_POOL ? 'JOB WORK WAPAS POOL' : k, qty: bMap[k] }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const totalConvertPcs = bcState.convertRows.reduce((s, r) => s + r.qty, 0);

    box.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>${isEdit ? '✏️ Edit Stock Convert' : '🔄 1. Stock Convert (Karigar → Dukan Design & Order Form)'}</h2>
          ${isEdit ? `<button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Cancel Edit</button>` : ''}
        </div>
        ${getBarcodeTopNavHtml(designs.length)}

        <div class="grid-2" style="margin-bottom:12px; align-items:start;">
          <div><label>Date *</label><input type="date" id="scDate" value="${isEdit ? esc(oLog.date) : todayISO()}" /></div>
          <div>
            <label>Dukan Barcode Print Size</label>
            <select id="scPrintMode">
              <option value="THERMAL">Thermal Roll (50mm x 25mm — 1 per label)</option>
              <option value="A4_GRID">A4 Sticker Sheet (Grid)</option>
            </select>
          </div>
        </div>

        <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:12px; border-radius:10px; margin-bottom:12px;">
          <div style="font-size:12px; font-weight:700; color:#1e3a8a; margin-bottom:8px;">
            Karigar ka naam type karein (e.g. FA → FARHAN) aur Dukan Design Name (e.g. 1070) me convert karein:
          </div>
          <div class="grid-2" style="align-items:start;">
            ${buildSourcePickerHtml('sc', 'Karigar / Source Saree * (Type Karein)', '-- Koi Unconverted Karigar Stock nahi --')}
            <div>
              <label>Bikri / Design Name * (Order Form me yahi dikhega)</label>
              <input id="scDesignName" list="scDesignList" value="${isEdit ? esc(oLog.designName) : ''}" placeholder="e.g. 1070, RASHMIKA" oninput="onSCDesignInput()" />
              <datalist id="scDesignList">${designs.map((d) => `<option value="${esc(d.designName)}">`).join('')}</datalist>
            </div>
            <div><label>Qty (Pcs) *</label><input type="number" id="scQty" min="1" value="${isEdit ? oLog.qty : ''}" placeholder="e.g. 10" /></div>
            <div>
              <label>Quality / Top Line (Optional)</label>
              <input id="scSpecLine" value="${isEdit ? esc(oLog.specLine || '') : ''}" placeholder="e.g. 3.60 CM EMB JHALAR" data-custom-enter="1"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); ${isEdit ? 'saveStockConvertBatch()' : 'addStockConvertRow()'}; }" />
            </div>
          </div>
          ${!isEdit ? `<button type="button" class="btn btn-dark btn-sm" style="margin-top:10px;" onclick="addStockConvertRow()">+ Add to Convert List</button>` : ''}
        </div>

        ${!isEdit ? `
          <div style="overflow-x:auto;">
            <table>
              <thead><tr><th>S.No</th><th>Karigar Name</th><th>→</th><th>Dukan Design Name</th><th>Quality</th><th>Qty</th><th>X</th></tr></thead>
              <tbody id="scRowsBody"></tbody>
            </table>
          </div>
        ` : ''}

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; margin-top:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          ${!isEdit ? `<div style="font-size:17px; font-weight:800;">Total Convert: <span id="scTotalPcs" style="color:#16a34a;">${totalConvertPcs} Pcs</span></div>` : '<div></div>'}
          <button type="button" class="btn btn-success primary-save-btn" onclick="saveStockConvertBatch()">
            ${isEdit ? '✅ Update Convert & Sync Stock (Ctrl+S)' : '✅ Save Convert & Print Dukan Barcode (Ctrl+S)'}
          </button>
        </div>
      </div>`;

    if (isEdit) {
      const match = bcSourceListCache.find((s) => s.value === oLog.sourceName);
      document.getElementById('scSource').value = oLog.sourceName;
      document.getElementById('scSourceSearch').value = match ? match.label : (oLog.sourceName === _BC_POOL ? 'JOB WORK WAPAS POOL' : oLog.sourceName);
      document.getElementById('scSourceAvlHint').textContent = match ? `✓ Available (with edit): ${match.qty} Pcs` : '';
      setTimeout(() => document.getElementById('scQty')?.focus(), 60);
    } else {
      renderStockConvertRows();
      setTimeout(() => document.getElementById('scSourceSearch')?.focus(), 60);
    }
    return;
  }

  // === VIEW 4: MANUAL BARCODING ===
  const rawConv = await dbGetAll('convertedStock');
  const cMap = {};
  rawConv.forEach((c) => { cMap[c.designName] = { qty: c.qty, specLine: c.specLine || '' }; });
  if (isEdit && oLog.fromConverted) {
    const cur = cMap[oLog.sourceName] || { qty: 0, specLine: oLog.specLine || '' };
    cur.qty += (Number(oLog.qty) || 0);
    cMap[oLog.sourceName] = cur;
  }

  bcSourceListCache = Object.keys(cMap)
    .filter((k) => cMap[k].qty > 0)
    .map((k) => ({ value: k, label: k, qty: cMap[k].qty, specLine: cMap[k].specLine }))
    .sort((a, b) => a.label.localeCompare(b.label));

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>${isEdit ? '✏️ Edit Challan Barcoding' : '🏷️ 2. Manual Barcoding (Challan ke Liye)'}</h2>
        ${isEdit ? `<button class="btn btn-light btn-sm" onclick="window.handleModuleEscape()">← Cancel Edit</button>` : ''}
      </div>
      ${getBarcodeTopNavHtml(designs.length)}

      ${!firms.length ? `<div style="background:#fef2f2; color:#b91c1c; padding:10px; border-radius:8px; margin-bottom:10px; font-size:13px; font-weight:600;">
        ⚠️ Pehle <b>⚙️ Settings</b> me Firm Code (KT / IF) add karein!
      </div>` : ''}

      ${!bcSourceListCache.length ? `<div style="background:#fffbeb; border:1px solid #fcd34d; color:#92400e; padding:10px; border-radius:8px; margin-bottom:12px; font-size:12.5px; font-weight:700;">
        ℹ️ Abhi Converted Stock khali hai — Pehle <b>"🔄 1. Stock Convert"</b> me jaakar Karigar saree ko Design me convert karein!
      </div>` : ''}

      <div class="grid-2" style="align-items:start;">
        <div><label>Date</label><input type="date" id="bcDate" value="${isEdit ? esc(oLog.date) : todayISO()}" /></div>
        ${buildSourcePickerHtml('bc', 'Converted Stock Chunein * (Type Karein)', '-- Pehle Stock Convert karein --')}

        <div>
          <label>Design / Saree Name *</label>
          <input id="bcDesignName" list="bcDesignList" value="${isEdit ? esc(oLog.designName) : ''}" placeholder="e.g. 1070, RASHMIKA" oninput="onBCDesignInput()" />
          <datalist id="bcDesignList">${designs.map((d) => `<option value="${esc(d.designName)}">`).join('')}</datalist>
        </div>

        <div>
          <label>Quality / Top Line (Sticker ke upar)</label>
          <input id="bcSpecLine" value="${isEdit ? esc(oLog.specLine || '') : ''}" placeholder="e.g. 3.60 CM EMB JHALAR" oninput="updateStickerPreview()" />
        </div>

        <div>
          <label>Firm Short Code * (KT / IF)</label>
          <select id="bcFirmCode" onchange="updateStickerPreview()">
            ${firms.map((f) => `<option value="${esc(f.shortCode)}" ${isEdit && oLog.firmCode === f.shortCode ? 'selected' : ''}>${esc(f.name)} (${esc(f.shortCode)})</option>`).join('')}
          </select>
        </div>

        <div>
          <label>Quantity (Pcs & Stickers) *</label>
          <input type="number" id="bcQty" min="1" value="${isEdit ? oLog.qty : ''}" placeholder="e.g. 10" />
        </div>

        <div>
          <label>Sticker Print Size</label>
          <select id="bcPrintMode">
            <option value="THERMAL">Thermal Roll (50mm x 25mm — 1 per label)</option>
            <option value="A4_GRID">A4 Sticker Sheet (Grid)</option>
          </select>
        </div>

        <div>
          <label>Live Challan Sticker Preview</label>
          <div id="bcLivePreview" style="border:1px solid #94a3b8; border-radius:8px; padding:6px 10px; text-align:center; background:#fff;">
            <div style="font-size:10px; font-weight:700;" id="prevSpec">3.60 CM EMB JHALAR</div>
            <div style="font-size:15px; font-weight:800; letter-spacing:0.5px;" id="prevDesign">1070</div>
            <svg id="prevBarcodeSvg" style="max-width:100%; height:30px;"></svg>
            <div style="font-size:11px; font-weight:700;" id="prevBottom">1070 KT</div>
          </div>
        </div>
      </div>

      <button type="button" class="btn btn-success primary-save-btn" style="margin-top:14px; width:100%; height:44px; font-size:14px;" onclick="saveAndPrintBarcoding()">
        ${isEdit ? '✅ Update Challan Barcoding & Sync Stock (Ctrl+S)' : '🏷️ Save Challan Ready Stock & Print Stickers (Ctrl+S)'}
      </button>
    </div>`;

  if (isEdit) {
    const match = bcSourceListCache.find((s) => s.value === oLog.sourceName);
    document.getElementById('bcSource').value = oLog.sourceName;
    document.getElementById('bcSourceSearch').value = match ? match.label : oLog.sourceName;
    document.getElementById('bcSourceAvlHint').textContent = match ? `✓ Available (with edit): ${match.qty} Pcs` : '';
  }

  setTimeout(() => {
    updateStickerPreview();
    document.getElementById(isEdit ? 'bcQty' : 'bcSourceSearch')?.focus();
  }, 80);
}

// === STOCK CONVERT HELPERS ===
async function onSCSourceChange() {
  const sourceName = document.getElementById('scSource')?.value || '';
  if (!sourceName) return;
  const src = await dbGet('bunkarStock', sourceName);
  const avail = src ? src.qty : 0;
  const alreadyUsed = bcState.editId ? 0 : bcState.convertRows.filter((r) => r.sourceName === sourceName).reduce((s, r) => s + r.qty, 0);
  const rem = Math.max(0, avail - alreadyUsed);

  const qtyEl = document.getElementById('scQty');
  if (qtyEl && rem > 0 && !bcState.editId) qtyEl.value = rem;

  const map = getKarigarDesignMap();
  const mappedDesign = map[sourceName.toUpperCase()] || '';
  const desEl = document.getElementById('scDesignName');
  if (desEl && mappedDesign && !desEl.value.trim()) {
    desEl.value = mappedDesign;
    await onSCDesignInput();
  }
}

async function onSCDesignInput() {
  const name = document.getElementById('scDesignName')?.value.trim().toUpperCase();
  const d = name ? await dbGet('designs', name) : null;
  const specEl = document.getElementById('scSpecLine');
  if (d && d.specLine && specEl && !specEl.value.trim()) specEl.value = d.specLine;
}

async function addStockConvertRow() {
  const srcHiddenEl = document.getElementById('scSource');
  const srcSearchEl = document.getElementById('scSourceSearch');
  const desEl = document.getElementById('scDesignName');
  const qtyEl = document.getElementById('scQty');
  const specEl = document.getElementById('scSpecLine');

  let sourceName = srcHiddenEl ? srcHiddenEl.value : '';
  if (!sourceName && srcSearchEl && srcSearchEl.value.trim()) {
    const q = srcSearchEl.value.trim().toUpperCase();
    const hit = bcSourceListCache.find((s) => s.label.toUpperCase() === q || s.value.toUpperCase() === q);
    if (hit) sourceName = hit.value;
  }
  const designName = desEl.value.trim().toUpperCase();
  const qty = parseInt(qtyEl.value, 10);
  const specLine = specEl.value.trim().toUpperCase();

  if (!sourceName) { srcSearchEl?.focus(); return bcNotify('Pehle list me se Karigar chunein!', 'warn'); }
  if (!designName) { desEl.focus(); return bcNotify('Bikri / Design Name daalein (e.g. 1070)!', 'warn'); }
  if (!qty || qty <= 0) { qtyEl.focus(); return bcNotify('Sahi Qty daalein!', 'warn'); }

  const src = await dbGet('bunkarStock', sourceName);
  const avail = src ? src.qty : 0;
  const alreadyUsed = bcState.convertRows.filter((r) => r.sourceName === sourceName).reduce((s, r) => s + r.qty, 0);
  if (alreadyUsed + qty > avail) return bcNotify(`${sourceName} me sirf ${avail} Pcs bache hain!`, 'warn');

  bcState.convertRows.push({ sourceName, designName, firmCode: '', specLine, qty });
  saveKarigarDesignMap(sourceName, designName);

  if (srcHiddenEl) srcHiddenEl.value = '';
  if (srcSearchEl) srcSearchEl.value = '';
  const hintEl = document.getElementById('scSourceAvlHint');
  if (hintEl) hintEl.textContent = '';
  desEl.value = ''; qtyEl.value = ''; specEl.value = '';
  renderStockConvertRows();
  srcSearchEl?.focus();
}

function removeStockConvertRow(idx) {
  bcState.convertRows.splice(idx, 1);
  renderStockConvertRows();
}

function renderStockConvertRows() {
  const tbody = document.getElementById('scRowsBody');
  const totalEl = document.getElementById('scTotalPcs');
  if (!tbody) return;
  let total = 0;
  tbody.innerHTML = bcState.convertRows.map((r, i) => {
    total += r.qty;
    return `
      <tr>
        <td>${i + 1}</td>
        <td><b>${esc(r.sourceName === _BC_POOL ? 'JOB WORK POOL' : r.sourceName)}</b></td>
        <td>→</td>
        <td><b>${esc(r.designName)}</b></td>
        <td><small>${esc(r.specLine || '-')}</small></td>
        <td><b style="color:#16a34a;">${r.qty} Pcs</b></td>
        <td><button type="button" class="btn btn-danger btn-sm" onclick="removeStockConvertRow(${i})">X</button></td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" style="color:#64748b;">Upar se Karigar aur Design Name daal kar "+ Add" karein...</td></tr>';
  if (totalEl) totalEl.textContent = total + ' Pcs';
}

async function saveStockConvertBatch() {
  try {
    const date = document.getElementById('scDate')?.value || todayISO();
    const printMode = document.getElementById('scPrintMode')?.value || 'THERMAL';
    const isEdit = !!(bcState.editId && bcState.origLog);

    if (isEdit) {
      const srcSearchEl = document.getElementById('scSourceSearch');
      let sourceName = document.getElementById('scSource')?.value || '';
      if (!sourceName && srcSearchEl && srcSearchEl.value.trim()) {
        const q = srcSearchEl.value.trim().toUpperCase();
        const hit = bcSourceListCache.find((s) => s.label.toUpperCase() === q || s.value.toUpperCase() === q);
        if (hit) sourceName = hit.value;
      }
      const designName = document.getElementById('scDesignName').value.trim().toUpperCase();
      const qty = parseInt(document.getElementById('scQty').value, 10);
      const specLine = document.getElementById('scSpecLine').value.trim().toUpperCase();
      if (!sourceName || !designName || !qty || qty <= 0) return bcNotify('Sabhi zaroori details bharein!', 'warn');

      const src = await dbGet('bunkarStock', sourceName);
      const extra = bcState.origLog.sourceName === sourceName ? (Number(bcState.origLog.qty) || 0) : 0;
      const avail = (src ? src.qty : 0) + extra;
      if (qty > avail) return bcNotify(`${sourceName} me sirf ${avail} Pcs bache hain!`, 'warn');

      const exDes = await dbGet('designs', designName);
      await dbPut('designs', { designName, specLine: specLine || (exDes ? exDes.specLine : ''), createdAt: exDes ? exDes.createdAt : Date.now() });
      await dbPut('barcodingLogs', {
        id: bcState.editId, date, mode: 'STOCK_CONVERT', sourceName, designName, firmCode: '',
        specLine, barcodeVal: designName, qty, createdAt: bcState.origLog.createdAt
      });
      saveKarigarDesignMap(sourceName, designName);
      if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
      if (typeof refreshDashboard === 'function') await refreshDashboard();

      bcState.editId = null; bcState.origLog = null; bcState.view = 'HISTORY';
      await renderBarcodeModule();

      if (typeof window.stxOpenModal === 'function') {
        window.stxOpenModal({
          title: `✅ ${designName} (${qty} Pcs) Update Ho Gaya!`,
          bodyHtml: `<p>Dukan stock aur Order Form designs sync ho gaye hain.</p>`,
          buttons: [
            { label: '🖨️ Print Dukan Stickers', className: 'btn btn-dark', onClick: () => { stxCloseModal(); printBatchBarcodeStickers([{ specLine, designName, firmCode: '', qty }], printMode); } },
            { label: 'Done', className: 'btn btn-success', onClick: () => stxCloseModal() }
          ]
        });
      } else {
        bcNotify(`${designName} (${qty} Pcs) update ho gaya!`, 'success');
      }
      return;
    }

    if (!bcState.convertRows.length) {
      const desVal = document.getElementById('scDesignName')?.value.trim();
      const srcVal = document.getElementById('scSource')?.value || document.getElementById('scSourceSearch')?.value.trim();
      if (srcVal && desVal) await addStockConvertRow();
    }
    if (!bcState.convertRows.length) return bcNotify('Convert List khali hai! Kam se kam 1 entry add karein.', 'warn');

    const neededMap = {};
    bcState.convertRows.forEach((r) => { neededMap[r.sourceName] = (neededMap[r.sourceName] || 0) + r.qty; });
    for (const srcName of Object.keys(neededMap)) {
      const st = await dbGet('bunkarStock', srcName);
      const avail = st ? st.qty : 0;
      if (neededMap[srcName] > avail) return bcNotify(`${srcName} me sirf ${avail} Pcs bache hain!`, 'warn');
    }

    let totalQty = 0;
    const printItems = [];
    for (const r of bcState.convertRows) {
      const exDes = await dbGet('designs', r.designName);
      await dbPut('designs', { designName: r.designName, specLine: r.specLine || (exDes ? exDes.specLine : ''), createdAt: exDes ? exDes.createdAt : Date.now() });
      await dbPut('barcodingLogs', {
        date, mode: 'STOCK_CONVERT', sourceName: r.sourceName, designName: r.designName, firmCode: '',
        specLine: r.specLine, barcodeVal: r.designName, qty: r.qty, createdAt: Date.now()
      });
      saveKarigarDesignMap(r.sourceName, r.designName);
      totalQty += r.qty;
      printItems.push({ ...r });
    }

    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    bcState.convertRows = [];
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    await renderBarcodeModule();

    if (typeof window.stxOpenModal === 'function') {
      window.stxOpenModal({
        title: `✅ ${totalQty} Pcs Stock Convert Ho Gayi!`,
        bodyHtml: `<p>Ab ye Designs <b>Order Form</b> aur <b>Manual Barcoding</b> me dikhengi.</p>`,
        buttons: [
          { label: `🖨️ Print ${totalQty} Dukan Stickers`, className: 'btn btn-dark', onClick: () => { stxCloseModal(); printBatchBarcodeStickers(printItems, printMode); } },
          { label: 'Done', className: 'btn btn-success', onClick: () => stxCloseModal() }
        ]
      });
    } else {
      bcNotify(`${totalQty} Pcs convert ho gayi!`, 'success');
    }
  } catch (err) { bcNotify('Stock Convert Error: ' + err.message, 'error'); }
}

async function printBatchBarcodeStickers(items, mode) {
  await ensureJsBarcodeLoaded();
  if (typeof ensureOrderPrintSetup === 'function') ensureOrderPrintSetup();

  const isThermal = mode !== 'A4_GRID';
  let pageSt = document.getElementById('simplitexDynamicPageCSS');
  if (!pageSt) { pageSt = document.createElement('style'); pageSt.id = 'simplitexDynamicPageCSS'; document.head.appendChild(pageSt); }
  pageSt.textContent = isThermal
    ? `@media print { @page { size: 50mm 25mm; margin: 0; } body { margin: 0; } }`
    : `@media print { @page { size: A4; margin: 8mm; } }`;

  let labelsHtml = '';
  items.forEach((it) => {
    const codeVal = it.firmCode ? `${it.designName} ${it.firmCode}` : it.designName;
    for (let i = 0; i < it.qty; i++) {
      labelsHtml += `
        <div style="${isThermal
          ? 'width:50mm; height:25mm; padding:1.5mm 2mm; page-break-after:always;'
          : 'width:48mm; height:25mm; padding:2mm; border:1px dashed #ccc; display:inline-block; margin:1mm;'
        } box-sizing:border-box; text-align:center; font-family:Arial,sans-serif; overflow:hidden;">
          <div style="font-size:8px; font-weight:700; white-space:nowrap; overflow:hidden;">${esc(it.specLine || '')}</div>
          <div style="font-size:13px; font-weight:900; line-height:1.1; margin:1px 0;">${esc(it.designName)}</div>
          <svg class="stx-bc-svg" data-bc-val="${esc(codeVal)}" style="width:92%; height:9mm; display:block; margin:1px auto;"></svg>
          <div style="font-size:9px; font-weight:800; line-height:1;">${esc(codeVal)}</div>
        </div>`;
    }
  });

  const root = document.getElementById('simplitexPrintRoot');
  root.innerHTML = `<div style="${isThermal ? '' : 'text-align:left;'}">${labelsHtml}</div>`;

  if (typeof window.JsBarcode === 'function') {
    root.querySelectorAll('.stx-bc-svg').forEach((svg) => {
      window.JsBarcode(svg, svg.getAttribute('data-bc-val') || '', { format: 'CODE128', width: 1.4, height: 28, displayValue: false, margin: 0 });
    });
  }
  setTimeout(() => window.print(), 200);
}

// === MANUAL BARCODING HELPERS ===
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
  const design = (document.getElementById('bcDesignName')?.value || '1070').trim().toUpperCase();
  const firm = (document.getElementById('bcFirmCode')?.value || 'KT').trim().toUpperCase();
  const codeVal = firm ? `${design} ${firm}` : design;

  const pSpec = document.getElementById('prevSpec');
  const pDes = document.getElementById('prevDesign');
  const pBot = document.getElementById('prevBottom');
  if (!pSpec) return;

  pSpec.textContent = spec; pDes.textContent = design; pBot.textContent = codeVal;
  await ensureJsBarcodeLoaded();
  if (typeof window.JsBarcode === 'function') {
    try { window.JsBarcode('#prevBarcodeSvg', codeVal, { format: 'CODE128', width: 1.5, height: 28, displayValue: false, margin: 0 }); } catch (_) {}
  }
}

async function editBarcodingLog(id) {
  const l = await dbGet('barcodingLogs', id);
  if (!l) return;
  bcState.editId = l.id;
  bcState.origLog = l;
  bcState.view = l.mode === 'STOCK_CONVERT' ? 'CONVERT' : 'FORM';
  renderBarcodeModule();
}

async function saveAndPrintBarcoding() {
  try {
    const date = document.getElementById('bcDate').value || todayISO();
    const srcSearchEl = document.getElementById('bcSourceSearch');
    let sourceName = document.getElementById('bcSource')?.value || '';
    if (!sourceName && srcSearchEl && srcSearchEl.value.trim()) {
      const q = srcSearchEl.value.trim().toUpperCase();
      const hit = bcSourceListCache.find((s) => s.label.toUpperCase() === q || s.value.toUpperCase() === q);
      if (hit) sourceName = hit.value;
    }

    const designName = document.getElementById('bcDesignName').value.trim().toUpperCase();
    const specLine = document.getElementById('bcSpecLine').value.trim().toUpperCase();
    const firmCode = document.getElementById('bcFirmCode').value.trim().toUpperCase();
    const qty = parseInt(document.getElementById('bcQty').value, 10);
    const printMode = document.getElementById('bcPrintMode').value;

    if (!sourceName) { srcSearchEl?.focus(); return bcNotify('Pehle list me se Converted Design Stock chunein!', 'warn'); }
    if (!designName) return bcNotify('Design Name daalein!', 'warn');
    if (!firmCode) return bcNotify('Settings me Firm Code add karein!', 'warn');
    if (!qty || qty <= 0) return bcNotify('Sahi Quantity daalein!', 'warn');

    const isEdit = !!(bcState.editId && bcState.origLog);
    const useConv = isEdit ? !!bcState.origLog.fromConverted : true;
    const src = useConv ? await dbGet('convertedStock', sourceName) : await dbGet('bunkarStock', sourceName);
    const editExtra = (isEdit && bcState.origLog.sourceName === sourceName) ? (Number(bcState.origLog.qty) || 0) : 0;
    const avail = (src ? src.qty : 0) + editExtra;
    if (qty > avail) return bcNotify(`Converted Stock "${sourceName}" me sirf ${avail} Pcs bache hain!`, 'warn');

    const exDes = await dbGet('designs', designName);
    await dbPut('designs', { designName, specLine: specLine || (exDes ? exDes.specLine : ''), createdAt: exDes ? exDes.createdAt : Date.now() });

    const barcodeVal = `${designName} ${firmCode}`;
    const logPayload = {
      date, mode: 'MANUAL', fromConverted: useConv,
      sourceName, designName, firmCode, specLine, barcodeVal, qty,
      createdAt: isEdit ? bcState.origLog.createdAt : Date.now()
    };
    if (isEdit) logPayload.id = bcState.editId;

    await dbPut('barcodingLogs', logPayload);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();

    bcState.editId = null; bcState.origLog = null;
    if (isEdit) bcState.view = 'HISTORY';
    await renderBarcodeModule();

    if (typeof window.stxOpenModal === 'function') {
      window.stxOpenModal({
        title: `🏷️ ${qty} Pcs "${barcodeVal}" ${isEdit ? 'Update' : 'Save'} Ho Gayi!`,
        bodyHtml: `<p>Maal <b>Challan Ready Stock</b> me jud gaya hai.</p>`,
        buttons: [
          { label: `🖨️ Print ${qty} Stickers`, className: 'btn btn-dark', onClick: () => { stxCloseModal(); printBarcodeStickers(specLine, designName, firmCode, qty, printMode); } },
          { label: 'Done', className: 'btn btn-success', onClick: () => stxCloseModal() }
        ]
      });
    } else {
      bcNotify(`${qty} Pcs "${barcodeVal}" save ho gayi!`, 'success');
    }
  } catch (err) { bcNotify('Barcoding Error: ' + err.message, 'error'); }
}

async function printBarcodeStickers(specLine, designName, firmCode, count, mode) {
  return printBatchBarcodeStickers([{ specLine, designName, firmCode: firmCode || '', qty: count }], mode);
}

async function addNewDesignPrompt() {
  if (typeof window.stxOpenModal === 'function') {
    window.stxOpenModal({
      title: '+ Naya Design Add Karein',
      bodyHtml: `
        <div class="grid-2" style="align-items:start;">
          <div><label>Design Naam / Number *</label><input id="stxNewDesName" placeholder="e.g. RASHMIKA, 1020" /></div>
          <div><label>Quality / Top Line</label><input id="stxNewDesSpec" placeholder="e.g. 3.60 CM EMB JHALAR" /></div>
        </div>
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn-light', onClick: () => stxCloseModal() },
        {
          label: '✅ Save Design',
          className: 'btn btn-success',
          onClick: async () => {
            const name = document.getElementById('stxNewDesName')?.value.trim().toUpperCase();
            const spec = document.getElementById('stxNewDesSpec')?.value.trim().toUpperCase() || '';
            if (!name) return bcNotify('Design Naam zaroori hai!', 'warn');
            await dbPut('designs', { designName: name, specLine: spec, createdAt: Date.now() });
            stxCloseModal();
            bcNotify(`✅ Design "${name}" save ho gaya!`, 'success');
            renderBarcodeModule();
          }
        }
      ]
    });
    return;
  }
  const name = prompt('Design ka naam / number likhein:');
  if (!name || !name.trim()) return;
  const spec = prompt('Quality / Top Line:') || '';
  await dbPut('designs', { designName: name.trim().toUpperCase(), specLine: spec.trim().toUpperCase(), createdAt: Date.now() });
  renderBarcodeModule();
}

async function editDesignSpec(designName) {
  const d = await dbGet('designs', designName);
  if (!d) return;
  if (typeof window.stxOpenModal === 'function') {
    window.stxOpenModal({
      title: `✏️ Edit Design: ${designName}`,
      bodyHtml: `
        <label>Quality / Top Line</label>
        <input id="stxEditDesSpec" value="${esc(d.specLine || '')}" placeholder="e.g. 3.60 CM EMB JHALAR" />
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn-light', onClick: () => stxCloseModal() },
        {
          label: '✅ Update',
          className: 'btn btn-success',
          onClick: async () => {
            const newSpec = document.getElementById('stxEditDesSpec')?.value.trim().toUpperCase() || '';
            await dbPut('designs', { ...d, specLine: newSpec });
            stxCloseModal();
            bcNotify(`✅ "${designName}" update ho gaya!`, 'success');
            renderBarcodeModule();
          }
        }
      ]
    });
    return;
  }
  const newSpec = prompt(`"${designName}" ki Quality update karein:`, d.specLine || '');
  if (newSpec === null) return;
  await dbPut('designs', { ...d, specLine: newSpec.trim().toUpperCase() });
  renderBarcodeModule();
}

async function quickReprintPrompt(designName, specLine) {
  const firms = await dbGetAll('firms');
  const defaultCode = firms.length ? firms[0].shortCode : '';
  if (typeof window.stxOpenModal === 'function') {
    window.stxOpenModal({
      title: `🖨️ Sticker Print: ${designName}`,
      bodyHtml: `
        <div class="grid-2" style="align-items:start;">
          <div>
            <label>Firm Code (Dukan sticker ke liye khali chhodein)</label>
            <input id="stxRepFirm" value="${esc(defaultCode)}" placeholder="e.g. KT ya IF" />
          </div>
          <div>
            <label>Kitne Stickers?</label>
            <input type="number" id="stxRepQty" min="1" value="10" />
          </div>
          <div style="grid-column:1 / -1;">
            <label>Print Size</label>
            <select id="stxRepMode">
              <option value="THERMAL">Thermal Roll (50mm x 25mm)</option>
              <option value="A4_GRID">A4 Sticker Sheet (Grid)</option>
            </select>
          </div>
        </div>
      `,
      buttons: [
        { label: 'Cancel', className: 'btn btn-light', onClick: () => stxCloseModal() },
        {
          label: '🖨️ Print Now',
          className: 'btn btn-dark',
          onClick: async () => {
            const firmCode = document.getElementById('stxRepFirm')?.value.trim().toUpperCase() || '';
            const qty = parseInt(document.getElementById('stxRepQty')?.value, 10);
            const mode = document.getElementById('stxRepMode')?.value || 'THERMAL';
            if (!qty || qty <= 0) return bcNotify('Sahi Qty daalein!', 'warn');
            stxCloseModal();
            await printBarcodeStickers(specLine, designName, firmCode, qty, mode);
          }
        }
      ]
    });
    return;
  }
  const firmCode = prompt('Firm Code likhein (ya khali chhodein):', defaultCode);
  if (firmCode === null) return;
  const qty = parseInt(prompt('Kitne Stickers print karne hain?', '10'), 10);
  if (!qty || qty <= 0) return;
  await printBarcodeStickers(specLine, designName, firmCode.trim().toUpperCase(), qty, 'THERMAL');
}

async function deleteDesign(designName) {
  if (!confirm(`"${designName}" Design Master se hatana hai?`)) return;
  await dbDelete('designs', designName);
  bcNotify(`Design "${designName}" delete ho gaya`, 'info');
  renderBarcodeModule();
}

async function reverseBarcodingLog(id) {
  try {
    const l = await dbGet('barcodingLogs', id);
    if (!l) return;
    if (!confirm(`Kya "${l.designName} ${l.firmCode || ''}" (${l.qty} Pcs) delete karke Stock dobara calculate karna hai?`)) return;
    await dbDelete('barcodingLogs', id);
    if (typeof window.stxRecalculateAllStock === 'function') await window.stxRecalculateAllStock();
    if (typeof refreshDashboard === 'function') await refreshDashboard();
    bcNotify('Entry delete ho gayi & stock sync hua', 'info');
    renderBarcodeModule();
  } catch (err) { bcNotify('Reverse Error: ' + err.message, 'error'); }
}
