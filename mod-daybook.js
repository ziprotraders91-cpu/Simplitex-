// === SimpliTex File 5: Daily Daybook & Bunkar Passbook (15-Row Pager + Universal Search) ===

const _DBK_POOL = (typeof JW_POOL_KEY !== 'undefined') ? JW_POOL_KEY : '__JW_POOL__';
let daybookState = { date: '', showAll: false };

function _escDBK(s) {
  return (typeof esc === 'function') ? esc(s) : String(s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function _todayDBK() {
  if (typeof todayISO === 'function') return todayISO();
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setupDaybookUIHooks() {
  const main = document.querySelector('main.container');
  if (main && !document.getElementById('tab-daybook')) {
    const sec = document.createElement('section');
    sec.id = 'tab-daybook';
    sec.className = 'tab-sec hidden';
    main.appendChild(sec);
  }

  const nav = document.getElementById('mainNav');
  if (nav && !document.getElementById('navBtnDaybook')) {
    const btn = document.createElement('button');
    btn.id = 'navBtnDaybook';
    btn.className = 'nav-btn';
    btn.textContent = '📒 Daybook';
    btn.onclick = function () { openTab('tab-daybook', btn); };
    const settingsBtn = nav.lastElementChild;
    nav.insertBefore(btn, settingsBtn);
  }

  const gw = document.getElementById('gatewayMenu');
  if (gw && !document.getElementById('gwDaybookRow')) {
    const row = document.createElement('div');
    row.id = 'gwDaybookRow';
    row.className = 'list-row';
    row.dataset.key = '8';
    row.onclick = function () {
      openTab('tab-daybook', document.getElementById('navBtnDaybook'));
    };
    row.innerHTML = '<span>8. Daily Daybook (Roz ka Poora Register)</span><span class="badge">Key: 8</span>';
    gw.appendChild(row);
  }
}

// Chained Tab & Esc Hooks
const _prevTabHookDBK = window.onTabChanged;
window.onTabChanged = function (tabId) {
  if (_prevTabHookDBK) _prevTabHookDBK(tabId);
  if (tabId === 'tab-daybook') {
    if (!daybookState.date) daybookState.date = _todayDBK();
    if (window._stxPagerState) delete window._stxPagerState['daybookPager'];
    renderDaybook();
  }
};

const _prevEscHookDBK = window.handleModuleEscape;
window.handleModuleEscape = function () {
  if (_prevEscHookDBK && _prevEscHookDBK()) return true;
  const sec = document.querySelector('.tab-sec:not(.hidden)');
  const pbCard = document.getElementById('bunkarPassbookCard');
  if (sec && sec.id === 'tab-stock-detail' && pbCard) {
    pbCard.remove();
    return true;
  }
  return false;
};

// === 1. BUNKAR PASSBOOK (15-Row Pager + Universal Search) ===
async function openBunkarPassbook(bunkarName) {
  await openDB();
  const jwLedger = await dbGetAll('jobWorkLedger');
  const bcLogs = await dbGetAll('barcodingLogs');
  const curStock = await dbGet('bunkarStock', bunkarName);

  const entries = [];

  jwLedger.forEach((l) => {
    if (l.direction === 'IN' && l.jobWorkType === 'DIRECT_BAITHAK' && l.bunkarName === bunkarName) {
      entries.push({
        date: l.date, ts: l.createdAt || 0, type: '🏠 Direct Baithak',
        detail: l.note || 'Baithak Inward', qtyText: `+${l.qty}`, color: '#15803d'
      });
    }
    if (l.direction === 'OUT' && Array.isArray(l.batchItems)) {
      const hit = l.batchItems.find((b) => b.bunkarName === bunkarName);
      if (hit) {
        entries.push({
          date: l.date, ts: l.createdAt || 0, type: `📤 ${l.jobWorkType} Out`,
          detail: `Worker: ${l.workerName}${l.jobWorkNo ? ' (#' + l.jobWorkNo + ')' : ''}`,
          qtyText: `-${hit.qty}`, color: '#b91c1c'
        });
      }
    }
  });

  bcLogs.forEach((b) => {
    if (b.sourceName === bunkarName) {
      entries.push({
        date: b.date, ts: b.createdAt || 0, type: '🏷️ Barcoding',
        detail: `${b.designName} (${b.firmCode})`, qtyText: `-${b.qty}`, color: '#1d4ed8'
      });
    }
  });

  entries.sort((a, b) => b.ts - a.ts);

  const sec = document.getElementById('tab-stock-detail');
  const oldPB = document.getElementById('bunkarPassbookCard');
  if (oldPB) oldPB.remove();
  if (window._stxPagerState) delete window._stxPagerState['bunkarPassbookPager'];

  const card = document.createElement('div');
  card.id = 'bunkarPassbookCard';
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <h2>📜 Bunkar Passbook: ${_escDBK(bunkarName)} (Available: ${curStock ? curStock.qty : 0} Pcs)</h2>
      <button class="btn btn-light btn-sm" onclick="document.getElementById('bunkarPassbookCard').remove()">X Close (Esc)</button>
    </div>
    <div id="bunkarPassbookPager"></div>
  `;
  sec.prepend(card);

  mountPagedList({
    id: 'bunkarPassbookPager',
    items: entries,
    perPage: 15,
    placeholder: '🔍 Date, Kaam, Worker ya Design search karein...',
    headHtml: '<tr><th>Date</th><th>Kaam</th><th>Detail</th><th>Pcs</th></tr>',
    getSearchText: (e) => `${e.date} ${e.type} ${e.detail} ${e.qtyText}`,
    renderRow: (e) => `
      <tr>
        <td style="white-space:nowrap;">${_escDBK(e.date)}</td>
        <td><b>${_escDBK(e.type)}</b></td>
        <td><small>${_escDBK(e.detail)}</small></td>
        <td><b style="color:${e.color};">${_escDBK(e.qtyText)}</b></td>
      </tr>
    `,
    emptyHtml: '<tr><td colspan="4">Is Bunkar ka koi record nahi hai</td></tr>'
  });

  card.scrollIntoView({ behavior: 'smooth' });
}

// === 2. DAILY DAYBOOK (15-Row Pager + Universal Search) ===
async function renderDaybook() {
  await openDB();
  const box = document.getElementById('tab-daybook');
  if (!box) return;

  const targetDate = daybookState.date || _todayDBK();
  const matchDate = (d) => daybookState.showAll || d === targetDate;

  const jwLedger = (await dbGetAll('jobWorkLedger')).filter((x) => matchDate(x.date));
  const bcLogs = (await dbGetAll('barcodingLogs')).filter((x) => matchDate(x.date));
  const orders = (await dbGetAll('orders')).filter((x) => matchDate(x.date));
  const challans = (await dbGetAll('challans')).filter((x) => matchDate(x.date));

  let sumBaithak = 0, sumJWOut = 0, sumJWIn = 0, sumBarcoded = 0, sumChallanPcs = 0, sumChallanAmt = 0;
  const rows = [];

  jwLedger.forEach((l) => {
    if (l.direction === 'IN' && l.jobWorkType === 'DIRECT_BAITHAK') {
      sumBaithak += l.qty;
      rows.push({ date: l.date, ts: l.createdAt || 0, mod: '🏠 Baithak In', who: l.bunkarName, detail: l.note || '-', val: `+${l.qty} Pcs` });
    } else if (l.direction === 'OUT') {
      sumJWOut += l.qty;
      const bText = (l.batchItems || []).map((b) => `${b.bunkarName === _DBK_POOL ? 'POOL' : b.bunkarName}(${b.qty})`).join(', ');
      rows.push({ date: l.date, ts: l.createdAt || 0, mod: `📤 ${l.jobWorkType} Out`, who: l.workerName, detail: `${l.jobWorkNo ? '#' + l.jobWorkNo + ' | ' : ''}${bText}`, val: `${l.qty} Pcs` });
    } else if (l.direction === 'IN') {
      sumJWIn += l.qty;
      rows.push({ date: l.date, ts: l.createdAt || 0, mod: `📥 ${l.jobWorkType} Wapsi`, who: l.workerName, detail: l.note || 'Total Wapsi', val: `+${l.qty} Pcs` });
    }
  });

  bcLogs.forEach((b) => {
    sumBarcoded += b.qty;
    rows.push({
      date: b.date, ts: b.createdAt || 0, mod: '🏷️ Barcoding',
      who: `${b.designName} (${b.firmCode})`,
      detail: `From: ${b.sourceName === _DBK_POOL ? 'JW Pool' : b.sourceName}`, val: `${b.qty} Pcs`
    });
  });

  orders.forEach((o) => {
    rows.push({
      date: o.date, ts: o.createdAt || 0, mod: '📝 Order Form',
      who: o.partyName, detail: `Order #${o.orderNo} (${(o.items || []).length} Designs)`, val: `${o.packingType} / ${o.folderName}`
    });
  });

  challans.forEach((c) => {
    sumChallanPcs += c.totalPcs || 0;
    sumChallanAmt += c.totalAmount || 0;
    rows.push({
      date: c.date, ts: c.createdAt || 0, mod: '🚚 Challan',
      who: `${c.partyName} (${c.partyCity})`,
      detail: `Challan #${c.challanNo} | ${c.transport || '-'}`,
      val: `${c.totalPcs} Pcs (₹${Number(c.totalAmount || 0).toLocaleString('en-IN')})`
    });
  });

  rows.sort((a, b) => b.ts - a.ts);

  box.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>📒 Daily Daybook (${daybookState.showAll ? 'All Records' : _escDBK(targetDate)})</h2>
        <button class="btn btn-light btn-sm" onclick="openTabByName('tab-dash')">← Gateway (Esc)</button>
      </div>

      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
        <label style="margin:0;">Date:</label>
        <input type="date" style="width:auto;" value="${_escDBK(targetDate)}"
               onchange="daybookState.date=this.value; daybookState.showAll=false; if(window._stxPagerState) delete window._stxPagerState['daybookPager']; renderDaybook();" />
        <button class="btn btn-dark btn-sm" onclick="daybookState.date=_todayDBK(); daybookState.showAll=false; if(window._stxPagerState) delete window._stxPagerState['daybookPager']; renderDaybook();">Aaj (Today)</button>
        <button class="btn btn-light btn-sm" onclick="daybookState.showAll=!daybookState.showAll; if(window._stxPagerState) delete window._stxPagerState['daybookPager']; renderDaybook();">
          ${daybookState.showAll ? 'Sirf Selected Date' : 'All Dates (Sabhi)'}
        </button>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; margin-bottom:14px;">
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:8px; border-radius:8px; text-align:center;">
          <small>Baithak In</small><br/><b>+${sumBaithak} Pcs</b>
        </div>
        <div style="background:#eff6ff; border:1px solid #bfdbfe; padding:8px; border-radius:8px; text-align:center;">
          <small>JW Out / Wapsi</small><br/><b>${sumJWOut} / +${sumJWIn}</b>
        </div>
        <div style="background:#fefce8; border:1px solid #fef08a; padding:8px; border-radius:8px; text-align:center;">
          <small>Barcoded</small><br/><b>${sumBarcoded} Pcs</b>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; padding:8px; border-radius:8px; text-align:center;">
          <small>Challan Sale</small><br/><b>${sumChallanPcs} Pcs (₹${sumChallanAmt.toLocaleString('en-IN')})</b>
        </div>
      </div>

      <div id="daybookPager"></div>
    </div>
  `;

  mountPagedList({
    id: 'daybookPager',
    items: rows,
    perPage: 15,
    placeholder: '🔍 Party, Worker, Bunkar, Design, Transport ya Bill No. search karein...',
    headHtml: '<tr><th>Date</th><th>Module</th><th>Party / Worker / Design</th><th>Detail</th><th>Qty / Value</th></tr>',
    getSearchText: (r) => `${r.date} ${r.mod} ${r.who} ${r.detail} ${r.val}`,
    renderRow: (r) => `
      <tr>
        <td style="white-space:nowrap;">${_escDBK(r.date)}</td>
        <td style="white-space:nowrap;"><b>${_escDBK(r.mod)}</b></td>
        <td><b>${_escDBK(r.who)}</b></td>
        <td><small>${_escDBK(r.detail)}</small></td>
        <td style="white-space:nowrap;"><b>${_escDBK(r.val)}</b></td>
      </tr>
    `,
    emptyHtml: '<tr><td colspan="5">Is date par koi kaam nahi hua hai</td></tr>'
  });
}

window.addEventListener('DOMContentLoaded', setupDaybookUIHooks);
