/* =====================================================================
   期货研究工作站 · 数字花园风格测试页 v4 · 数据驱动渲染
   数据: ./data/dashboard-lite.json (extract_lite.py 生成)
   ===================================================================== */
'use strict';

/* ---------- 工具 ---------- */
const $ = (sel) => document.querySelector(sel);

function fmtDate(yyyymmdd) {
  if (!yyyymmdd) return '—';
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
/* 亿元:三位金额 → 「+37.5 亿」 */
function fmtYi(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const yi = v / 1e8;
  const sign = yi > 0 ? '+' : (yi < 0 ? '−' : '');
  return `${sign}${Math.abs(yi).toFixed(1)} 亿`;
}
function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
  return `${sign}${Math.abs(v).toFixed(2)}%`;
}
function fmtHands(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const sign = v > 0 ? '+' : (v < 0 ? '−' : '');
  return `${sign}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
}
function cls(v) { return v > 0 ? 'up' : (v < 0 ? 'down' : 'flat'); }
function cls2(v) { return v > 0 ? 'up' : (v < 0 ? 'down' : ''); }
function dirCls(direction) {
  if (!direction) return 'flat';
  return direction.includes('多') ? 'up' : (direction.includes('空') ? 'down' : 'flat');
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- 状态 ---------- */
const state = { data: null, current: null };

/* ---------- 渲染:摘要行 ---------- */
function renderSummary(snap) {
  const m = snap.summary || {};
  const cells = [
    ['覆盖品种', m.instrumentCount, '支'],
    ['净多', m.bullishCount, '支', 'up'],
    ['净空', m.bearishCount, '支', 'down'],
    ['三方共振', m.tripleCount, '支', ''],
  ];
  $('#sumLine').innerHTML = cells.map(([label, v, unit, tone]) => `
    <div class="sum-cell">
      <span class="sum-label">${label}</span>
      <span class="sum-value ${tone || ''}">${v ?? '—'}<small>${unit}</small></span>
    </div>`).join('');
}

/* ---------- 渲染:三方强共振(卡片 + 相对强度条) ---------- */
function renderResonance(snap) {
  const list = snap.tripleResonance || [];
  if (!list.length) { $('#resonanceList').innerHTML = '<p class="sec-note">本日无三方共振品种。</p>'; return; }
  const maxAbs = Math.max(...list.map(x => Math.abs(x.amountSignal || 0)), 1);
  $('#resonanceList').innerHTML = list.map(it => {
    const w = Math.round(Math.abs(it.amountSignal || 0) / maxAbs * 100);
    const tone = cls2(it.amountSignal);
    return `
    <div class="focus-card ${tone}" data-symbol="${esc(it.symbol)}">
      <div class="fc-head"><span class="fc-name">${esc(it.variety)}</span><span class="fc-code">${esc(it.symbol)}</span></div>
      <div class="fc-amount ${tone} num">${fmtYi(it.amountSignal)}</div>
      <div class="fc-sub">三方手数 ${fmtHands(it.handsSignal)} · ${esc(it.marginalStructure || '—')}</div>
      <div class="fc-bar"><div class="bar-track"><span class="bar-fill ${tone}" style="--w:${w}%"></span></div></div>
      <div class="fc-foot">
        ${it.resonanceLabel ? `<span class="fc-chip ${tone}">${esc(it.resonanceLabel)}</span>` : ''}
        <span class="fc-chip">主力 ${fmtPct(it.changePct)}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---------- 渲染:资金潮汐(四列,列头色线 + 计数) ---------- */
function renderTide(snap) {
  const tides = snap.tide || [];
  $('#tideGrid').innerHTML = tides.map(t => {
    const sum = (t.items || []).reduce((a, b) => a + (b.amount || 0), 0);
    const isIn = (t.label || '').includes('流入');
    const tone = isIn ? 'up' : 'down';
    return `
    <div class="tide-cell ${isIn ? 'in' : 'out'}">
      <div class="tide-head"><b>${esc(t.label)}</b><span class="num ${tone}">${fmtYi(sum)}</span></div>
      ${(t.items || []).map(x => `
        <div class="tide-row" data-symbol="${esc(x.symbol)}">
          <span class="name" title="${esc(x.variety)}">${esc(x.variety)}</span>
          <span class="num ${cls2(x.changePct)}">${fmtPct(x.changePct)}</span>
          <span class="num ${cls2(x.amount)}">${fmtYi(x.amount)}</span>
        </div>`).join('')}
      <div class="tide-row" style="color:var(--gray)">
        <span class="name">共 ${t.count ?? (t.items || []).length} 支</span>
        <span></span><span></span>
      </div>
    </div>`;
  }).join('');
}

/* ---------- 渲染:关键事件 ---------- */
function renderEvents(snap) {
  const list = snap.keyEvents || [];
  $('#eventList').innerHTML = list.map(ev => `
    <div class="row r-event" data-symbol="${esc(ev.symbol)}">
      <span class="row-title">${esc(ev.variety)}<span class="row-code">${esc(ev.symbol)}</span></span>
      <span class="row-sub">${(ev.events || []).map(e => esc(e)).join(' · ')}</span>
      <span class="row-pct ${cls2(ev.priceChangePct)} num hide-sm">${fmtPct(ev.priceChangePct)}</span>
      <span class="row-pct ${cls2(ev.openInterestChangePct)} num hide-sm">${fmtPct(ev.openInterestChangePct)}</span>
      <span class="row-pct num">${ev.turnover ? (ev.turnover / 1e8).toFixed(0) + ' 亿额' : '—'}</span>
    </div>`).join('')
    || '<p class="sec-note">本日无关键事件(或来源未披露)。</p>';
}

/* ---------- 渲染:板块速览(卡 + 多空双列条形) ---------- */
function renderSectors(snap) {
  const list = snap.sectorSummary || [];
  const sideHtml = (arr, tone) => {
    const items = (arr || []).slice(0, 3);
    const maxAbs = Math.max(...items.map(x => Math.abs(x.value || 0)), 1);
    if (!items.length) return '<span class="ss-empty">无净额品种</span>';
    return items.map(x => {
      const w = Math.round(Math.abs(x.value || 0) / maxAbs * 100);
      return `
      <div class="ss-item" data-symbol="${esc(x.symbol)}" style="cursor:pointer" title="${esc(x.variety)}">
        <span class="name">${esc(x.variety)}</span>
        <span class="bar-track"><span class="bar-fill ${cls2(x.value)}" style="--w:${w}%"></span></span>
        <span class="num ${cls2(x.value)}">${fmtYi(x.value)}</span>
      </div>`;
    }).join('');
  };
  $('#sectorGrid').innerHTML = list.map(sec => `
    <div class="sector-card">
      <div class="sector-name"><b>${esc(sec.sector)}</b><span>${sec.bullishCount} 多 · ${sec.bearishCount} 空</span></div>
      <div class="sector-sides">
        <div><div class="ss-title up">净多前三</div>${sideHtml(sec.bullish, 'up')}</div>
        <div><div class="ss-title down">净空前三</div>${sideHtml(sec.bearish, 'down')}</div>
      </div>
    </div>`).join('');
}

/* ---------- 渲染:核心品种全景(紧凑表 + 内/外/家人三行迷你条) ---------- */
function renderPanorama(snap) {
  const list = (snap.instruments || []);
  const watch = list.filter(x => x.watchlist);
  const others = list.filter(x => !x.watchlist)
    .sort((a, b) => Math.abs(b.amountSignal || 0) - Math.abs(a.amountSignal || 0));
  const rows = watch.concat(others.slice(0, 24));

  function grpBars(x) {
    const g = x.grpAmounts || {};
    const entries = [
      ['内资', g.domestic], ['外资', g.foreign], ['家人', g.familyReverse],
    ];
    const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v || 0)), 1);
    return `<div class="grp-bars">${entries.map(([label, v]) => {
      const w = Math.round(Math.abs(v || 0) / maxAbs * 100);
      return `
      <div class="grp-line">
        <span>${label}</span>
        <span class="bar-track"><span class="bar-fill ${cls2(v)}" style="--w:${w}%"></span></span>
        <span class="num ${cls2(v)}">${v ? fmtYi(v) : '—'}</span>
      </div>`;
    }).join('')}</div>`;
  }

  $('#panoTable').innerHTML = `
    <thead><tr>
      <th>板块</th><th>品种 / 方向</th><th class="num">主力涨跌</th>
      <th class="num">三方资金</th><th>内资 · 外资 · 家人反向</th><th>边际结构</th><th>共振</th>
    </tr></thead>
    <tbody>
      ${rows.map(x => `
        <tr data-symbol="${esc(x.symbol)}">
          <td class="gray">${esc(x.sector || '—')}</td>
          <td><span class="t-name">${esc(x.variety)}</span><span class="t-code">${esc(x.symbol)}</span>${x.watchlist ? '<span class="t-code" style="color:var(--cinnabar)">●</span>' : ''}
            <div class="gray" style="font-size:10px"><span class="dir ${dirCls(x.direction)}">${esc(x.direction || '—')}</span></div></td>
          <td class="num ${cls2(x.changePct)}">${fmtPct(x.changePct)}</td>
          <td class="num ${cls2(x.amountSignal)}">${fmtYi(x.amountSignal)}</td>
          <td>${grpBars(x)}</td>
          <td class="gray">${esc(x.marginalStructure || '—')}</td>
          <td class="gray">${esc(x.resonanceLabel || '—')}</td>
        </tr>`).join('')}
    </tbody>`;
}

/* ---------- 渲染:席位贡献(条形) ---------- */
function renderBrokers(snap) {
  const bh = snap.brokerHighlights || {};
  const order = [['内资', '原方向'], ['外资', '原方向'], ['家人', '反向指标']];
  $('#brokerGrid').innerHTML = order.map(([key, sub]) => {
    const g = bh[key] || { bullish: [], bearish: [] };
    const side = (arr, tone) => {
      const items = (arr || []).slice(0, 5);
      const maxAbs = Math.max(...items.map(x => Math.abs(x.displayAmount || 0)), 1);
      if (!items.length) return '<div class="b-row"><span class="who gray">无</span><span></span><span></span></div>';
      return items.map(b => {
        const w = Math.round(Math.abs(b.displayAmount || 0) / maxAbs * 100);
        return `
        <div class="b-row" data-symbol="${esc(b.symbol)}" style="cursor:pointer" title="${esc(b.broker)} ${esc(b.variety)}">
          <span class="who">${esc(b.broker)}<small>${esc(b.variety)} ${esc(b.symbol)}</small></span>
          <span class="bar-track"><span class="bar-fill ${tone}" style="--w:${w}%"></span></span>
          <span class="num ${tone}">${fmtYi(b.displayAmount)}</span>
        </div>`;
      }).join('');
    };
    return `
    <div class="broker-cell">
      <header><b>${key}</b><span>${sub}</span></header>
      <p class="b-sub up">净 多 贡 献</p>
      ${side(g.bullish, 'up')}
      <p class="b-sub down">净 空 贡 献</p>
      ${side(g.bearish, 'down')}
    </div>`;
  }).join('');
}

/* ---------- 渲染:股指 ---------- */
function renderIndices(snap) {
  const list = snap.stockIndices || [];
  $('#indexTable').innerHTML = `
    <thead><tr>
      <th>指数</th><th>方向</th><th class="num">现货涨跌</th><th class="num">收盘</th>
      <th class="num">三方资金</th><th class="num">近 1 日</th><th>合约</th>
    </tr></thead>
    <tbody>
      ${list.map(x => `
        <tr data-symbol="${esc(x.symbol)}">
          <td><span class="t-name">${esc(x.variety)}</span><span class="t-code">${esc(x.symbol)}</span></td>
          <td><span class="dir ${dirCls(x.direction)}">${esc(x.direction || '—')}</span></td>
          <td class="num ${cls2(x.changePct)}">${fmtPct(x.changePct)}</td>
          <td class="num">${x.close ?? '—'}</td>
          <td class="num ${cls2(x.amountSignal)}">${fmtYi(x.amountSignal)}</td>
          <td class="num ${cls2(x.return1d !== null && x.return1d !== undefined ? x.return1d * 100 : null)}">${x.return1d != null ? fmtPct(x.return1d * 100) : '—'}</td>
          <td class="gray">${esc(x.contract || '—')}</td>
        </tr>`).join('')}
    </tbody>`;
}

/* ---------- 渲染:状态 ---------- */
function renderStatus(data, snap) {
  const dates = data.dates || [];
  const rows = [
    ['披露快照', `共 ${dates.length} 个交易日独立固化,当前展示 ${fmtDate(snap.date)}`, fmtDate(snap.date)],
    ['数据提取', `由正式站 dashboard.json 提取(extract_lite.py),保留 ${Object.keys(data.snapshots).length} 个快照`, data.generatedAt ? data.generatedAt.slice(0, 10) : '—'],
    ['来源', '奇货可查 · 席位披露 · 三大商品所 · 同花顺期货通 · trend-animal API', ''],
    ['边界', '本地研究与决策台 · 非投资建议 · 旧来源不冒充当日事实', ''],
  ];
  $('#statusBox').innerHTML = rows.map(([b, desc, when]) => `
    <div class="stat-row">
      <span class="stat-dot"></span><b>${b}</b>
      <span class="desc">${esc(desc)}</span>
      <span class="when">${esc(when)}</span>
    </div>`).join('');
}

/* ---------- 品种详情弹层 ---------- */
function openDetail(symbol) {
  const snap = state.snap;
  const x = (snap.instruments || []).find(i => i.symbol === symbol);
  if (!x) return;
  const m = x.margin || {};
  const cells = [
    ['方向', `<span class="dir ${dirCls(x.direction)}" style="font-size:19px">${esc(x.direction || '—')}</span>`, ''],
    ['三方资金', `${fmtYi(x.amountSignal)}`, cls2(x.amountSignal)],
    ['三方手数', `${fmtHands(x.handsSignal)}<small>手</small>`, cls2(x.handsSignal)],
    ['主力涨跌', `${fmtPct(x.changePct)}<small>${esc(x.contract || '')}</small>`, cls2(x.changePct)],
    ['收盘价', `${x.close ?? '—'}`, ''],
    ['边际结构', esc(x.marginalStructure || '—'), ''],
    ['保证金/手', `${m.perLot ?? '—'}<small>元 · ${esc(m.rate || '')}</small>`, ''],
    ['保证金合约', `${esc(m.contract || '—')}<small>${esc(m.exchange || '')}</small>`, ''],
    ['20 日收益', `${x.return20d != null ? fmtPct(x.return20d) : '—'}`, cls2(x.return20d)],
  ];
  $('#detailBody').innerHTML = `
    <div class="d-head">
      <h3>${esc(x.variety)}</h3>
      <span class="row-code">${esc(x.symbol)} · ${esc(x.sector || '')}</span>
      ${x.resonanceLabel ? `<span class="row-tag">${esc(x.resonanceLabel)}</span>` : ''}
    </div>
    <div class="d-grid">
      ${cells.map(([label, val, tone]) => `
        <div class="d-cell"><span class="d-label">${label}</span>
        <span class="d-value ${tone || ''}">${val}</span></div>`).join('')}
    </div>`;
  $('#detailMask').hidden = false;
}
function closeDetail() { $('#detailMask').hidden = true; }

/* ---------- 交易日历 ---------- */
function buildCalendar() {
  const dates = new Set((state.data.dates || []).map(String));
  let view = null;
  if (!view) {
    const cur = String(state.current);
    view = new Date(+cur.slice(0, 4), +cur.slice(4, 6) - 1, 1);
  }
  const panel = $('#calPanel');

  function render() {
    $('#calTitle').textContent = `${view.getFullYear()} 年 ${view.getMonth() + 1} 月`;
    const days = $('#calDays');
    days.innerHTML = '';
    const first = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    const total = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < first; i++) days.appendChild(document.createElement('span'));
    for (let d = 1; d <= total; d++) {
      const key = `${view.getFullYear()}${String(view.getMonth() + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'cal-day';
      el.textContent = d;
      if (dates.has(key)) el.classList.add('has-data');
      if (key === String(state.current)) el.classList.add('is-selected');
      el.addEventListener('click', () => {
        if (!dates.has(key)) return;
        switchDate(key);
        panel.hidden = true;
      });
      days.appendChild(el);
    }
  }
  $('#calPrev').onclick = () => { view.setMonth(view.getMonth() - 1); render(); };
  $('#calNext').onclick = () => { view.setMonth(view.getMonth() + 1); render(); };
  $('#dateBtn').onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) render(); };
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== $('#dateBtn')) panel.hidden = true;
  });
}

/* ---------- 切换日期 ---------- */
function switchDate(key) {
  const snap = state.data.snapshots[key];
  if (!snap) return;
  state.current = key;
  state.snap = snap;
  $('#dateText').textContent = fmtDate(key);
  renderSummary(snap);
  renderResonance(snap);
  renderTide(snap);
  renderEvents(snap);
  renderSectors(snap);
  renderPanorama(snap);
  renderBrokers(snap);
  renderIndices(snap);
  renderStatus(state.data, snap);
}

/* ---------- 主题(太极钮) ---------- */
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  const btn = $('#themeBtn');
  btn.classList.toggle('is-flipped',
    document.documentElement.getAttribute('data-theme') === 'dark');
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    btn.classList.toggle('is-flipped', next === 'dark');
  });
}

/* ---------- 启动 ---------- */
async function main() {
  initTheme();
  try {
    const res = await fetch('./data/dashboard-lite.json');
    state.data = await res.json();
  } catch (err) {
    $('#loading').textContent = '数据装载失败:' + err.message;
    return;
  }
  /* 注意:JS 对象纯数字键按数值升序排列,keys()[0] 是最早快照;
     默认必须打开 latestDate(不存在时回退 keys 最后一个 = 最新) */
  const keys = Object.keys(state.data.snapshots);
  const first = (state.data.latestDate && state.data.snapshots[state.data.latestDate])
    ? state.data.latestDate
    : keys[keys.length - 1];
  if (!first) { $('#loading').textContent = '无快照数据'; return; }
  $('#metaGen').textContent = `提取自 dashboard.json · ${fmtDate(state.data.latestDate)} 最新`;
  switchDate(first);
  buildCalendar();

  /* 事件委托:品种点击 → 详情弹层 */
  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-symbol]');
    if (row && row.dataset.symbol) openDetail(row.dataset.symbol);
  });
  $('#detailClose').addEventListener('click', closeDetail);
  $('#detailMask').addEventListener('click', (e) => {
    if (e.target === $('#detailMask')) closeDetail();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

  $('#loading').classList.add('is-done');
}
main();
