/* 美股与美债仪表盘 SPA 渲染器 · 与 a-share 子站同架构
   数据: data/dashboard-meta.json 索引 + data/snapshots/<date>.json 按日懒加载
   配色纪律: 红涨绿跌（与全站一致），--up=朱红 / --down=青绿 */
const fmt = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d));
const sgn = x => x > 0 ? '+' : '';
const cls = x => x > 0 ? 'up' : (x < 0 ? 'down' : 'flat');
const $ = id => document.getElementById(id);

/* ── 日/夜主题动态调色板（与 a-share 同源） ── */
const TH = () => document.documentElement.dataset.theme === 'dark' ? {
  ink:'#e8e5da', text:'#b0ada3', sub:'#8a877d',
  up:'#e2726b', down:'#3fa795', accent:'#6cb2f5', gold:'#b3a78f',
  line:'rgba(232,229,218,.18)', split:'rgba(232,229,218,.08)',
  tipbg:'#23231f', tiptext:'#f0ede4',
  hm:['#3f5a54','#2e2e2b','#7a4a45']
} : {
  ink:'#37352f', text:'#787774', sub:'#9b9a97',
  up:'#d44c47', down:'#0f7b6c', accent:'#2383e2', gold:'#9a8f7d',
  line:'rgba(55,53,47,0.16)', split:'rgba(55,53,47,0.07)',
  tipbg:'#37352f', tiptext:'#fff',
  hm:['#6fa79e','#e9e8e4','#d99692']
};
let AX, TIP;
function refreshPalette() {
  const t = TH();
  AX = { axisLine:{lineStyle:{color:t.line}}, axisTick:{show:false},
    axisLabel:{color:t.text,fontSize:11}, splitLine:{lineStyle:{color:t.split}} };
  TIP = { backgroundColor:t.tipbg, borderWidth:0, textStyle:{color:t.tiptext,fontSize:12},
    confine:true, extraCssText:'box-shadow:0 4px 14px rgba(0,0,0,.25);border-radius:5px;' };
}
let LAST = null;
function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('themeBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ 日间' : '🌙 夜间';
  if (persist) { try { localStorage.setItem('usmarket.theme', theme); } catch (e) {} }
  refreshPalette();
  if (LAST) renderAll(LAST);
}

let charts = [];
function makeChart(id) {
  const el = $(id);
  if (!el || typeof echarts === 'undefined') return null;
  const c = echarts.init(el);
  charts.push(c);
  return c;
}
addEventListener('resize', () => charts.forEach(c => c.resize()));

/* ── 迷你走势（内联 SVG 折线，不占 echarts 实例） ── */
function sparkline(arr, w = 120, h = 30) {
  if (!arr || arr.length < 2) return '';
  const t = TH();
  const min = Math.min(...arr), max = Math.max(...arr);
  const span = (max - min) || 1;
  const pts = arr.map((v, i) =>
    `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / span * (h - 4)).toFixed(1)}`).join(' ');
  const color = arr[arr.length - 1] >= arr[0] ? t.up : t.down;
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}

/* ── 风险偏好状态 → 徽标 ── */
function stateChip(d) {  // d>0 偏进攻(红/涨)，d<0 偏防守(绿/跌)，与全站红涨绿跌一致
  if (d == null) return '<span class="state-chip mid">—</span>';
  if (d >= 0.3) return '<span class="state-chip on">risk-on</span>';
  if (d <= -0.3) return '<span class="state-chip off">risk-off</span>';
  return '<span class="state-chip mid">neutral</span>';
}

/* ── 热力格 ── */
function heatColor(p) {
  if (p == null) return 'background:var(--softbg);color:var(--ink3)';
  const t = TH();
  const a = 0.12 + 0.68 * Math.min(Math.abs(p) / 3, 1);
  return p > 0
    ? `background:rgba(212,76,71,${a.toFixed(2)});color:${document.documentElement.dataset.theme === 'dark' ? '#f0ede4' : (a > 0.45 ? '#fff' : t.ink)}`
    : p < 0
      ? `background:rgba(15,123,108,${a.toFixed(2)});color:${document.documentElement.dataset.theme === 'dark' ? '#f0ede4' : (a > 0.45 ? '#fff' : t.ink)}`
      : 'background:var(--softbg);color:var(--ink2)';
}

/* ══════════ ④ 美元流动性与风险偏好 ══════════ */
function renderLiquidity(L, t, structure) {
  const hideIds = ['fund-cards', 'ch-netliq', 'risk-cards', 'ch-styles', 'credit-cards'];
  const secH3 = document.getElementById('liq-desc').closest('section').querySelectorAll('h3.blk');
  if (!L) {
    hideIds.forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
    secH3.forEach(h => { h.style.display = 'none'; });
    $('liq-desc').innerHTML = '该快照为旧版结构，不含流动性模块（20261022 起启用）。';
    const v = $('liq-verdict');
    if (v) { v.style.display = ''; v.innerHTML = '<div class="sb-t">本快照无流动性数据</div><div class="sb-b">切换至 20261022 或更新日期查看资金价格、净流动性与风险偏好温度计。</div>'; }
    return;
  }
  hideIds.forEach(id => { const el = $(id); if (el) el.style.display = ''; });
  secH3.forEach(h => { h.style.display = ''; });
  const f = L.funding || {};
  const bp = x => x == null ? '—' : `${sgn(x)}${x.toFixed(1)}bp`;
  $('fund-cards').innerHTML = [
    { k: 'SOFR（有担保隔夜融资）', v: f.sofr?.value, s: f.sofr?.date || '—', extra: `20日 ${bp(f.sofr?.chg20_bp)}`, cls: '' },
    { k: 'SOFR − IORB（融资压力）', v: f.sofr_iorb_bp, unit: 'bp', s: (f.sofr_iorb_bp ?? 0) > 5 ? '转正走阔 → 准备金偏紧' : '为负/贴近零 → 融资宽松', extra: '', cls: cls(f.sofr_iorb_bp) },
    { k: 'EFFR（无担保隔夜）', v: f.effr?.value, s: f.effr?.date || '—', extra: '', cls: '' },
    { k: 'IORB（准备金利率）', v: f.iorb?.value, s: f.iorb?.date || '—', extra: '政策利率走廊上沿', cls: '' },
  ].map(c => `<div class="card"><div class="k"><span>${c.k}</span></div>
      <div class="v num ${c.cls}">${c.v == null ? '—' : (c.unit ? c.v.toFixed(1) + c.unit : c.v.toFixed(2) + '%')}</div>
      <div class="s">${c.s}${c.extra ? ' · ' + c.extra : ''}</div></div>`).join('');

  const b = L.balances;
  const liqChart = makeChart('ch-netliq');
  if (b && liqChart && b.net_liquidity_hist?.length) {
    const hist = b.net_liquidity_hist;
    liqChart.setOption({
      tooltip: { ...TIP, trigger: 'axis', valueFormatter: v => '$' + Number(v).toFixed(0) + 'B' },
      grid: { left: 56, right: 20, top: 24, bottom: 24 },
      xAxis: { type: 'category', data: hist.map(p => p[0]), ...AX },
      yAxis: { type: 'value', scale: true, ...AX },
      series: [{ type: 'line', data: hist.map(p => p[1]), showSymbol: false,
        lineStyle: { color: t.accent, width: 1.8 }, areaStyle: { color: t.accent, opacity: 0.07 },
        markLine: { silent: true, symbol: 'none', label: { show: false },
          lineStyle: { color: t.split, type: 'dashed' },
          data: [{ type: 'average' }] } }]
    });
    $('liq-desc').innerHTML =
      `净流动性 <b>$${(b.net_liquidity_bn / 1000).toFixed(2)} 万亿</b>（联储总资产 $${(b.walcl.value_bn / 1000).toFixed(2)}T − TGA $${(b.tga ? b.tga.value_bn / 1000 : 0).toFixed(2)}T − RRP $${b.rrp ? b.rrp.value_bn : 0}B）。` +
      `四层观察：资金价格 → 数量 → 信用与波动 → 风险偏好。`;
  }

  const ratios = L.ratios || [];
  $('risk-cards').innerHTML = ratios.map(r => `
    <div class="card">
      <div class="k"><span>${r.name}</span>${stateChip(r.d5)}</div>
      <div class="v num ${cls(r.d5)}">${sgn(r.d5)}${fmt(r.d5)}%</div>
      <div class="s num">5日 · 20日 ${sgn(r.d20)}${fmt(r.d20)}%</div>
      ${sparkline(r.spark)}
      <div class="mini">${r.meaning}</div>
    </div>`).join('');

  const styles = L.styles || [];
  const styleChart = makeChart('ch-styles');
  if (styleChart) {
    styleChart.setOption({
      tooltip: { ...TIP },
      legend: { textStyle: { color: t.text }, top: 0 },
      grid: { left: 60, right: 20, top: 30, bottom: 24 },
      xAxis: { type: 'category', data: styles.map(s => s.name.split('（')[0]), ...AX },
      yAxis: { type: 'value', name: '%', ...AX },
      series: [
        { name: '近5日', type: 'bar', barMaxWidth: 34, color: t.ink,
          data: styles.map(s => ({ value: s.d5, itemStyle: { color: (s.d5 ?? 0) >= 0 ? t.up : t.down } })) },
        { name: '近20日', type: 'bar', barMaxWidth: 34, color: t.sub,
          data: styles.map(s => ({ value: s.d20, itemStyle: { color: (s.d20 ?? 0) >= 0 ? 'rgba(212,76,71,.40)' : 'rgba(15,123,108,.40)' } })) }
      ]
    });
  }

  const rot = L.rotation || {};
  const st = rot.state;
  const regimeCode = structure?.regime?.code;
  const verdictText = st === 'risk-off'
    ? (regimeCode === 'structural-deai'
        ? '结构性收缩：去 AI 敞口，而非全面避险'
        : '风险偏好收缩：资金撤离成长/科技，转向防御与必需消费')
    : st === 'risk-on'
      ? (regimeCode === 'narrow-rally' ? '窄幅抱团：指数上涨由少数权重股拉动' : '风险偏好扩张：成长/科技占优，防御落后')
      : '风格中性：成长与防御差距不显著';
  $('liq-verdict').innerHTML =
    `<div class="sb-t">${st === 'risk-off' ? '▼' : st === 'risk-on' ? '▲' : '•'} ${verdictText}</div>
     <div class="sb-b">成长 − 防御：近5日 <b>${sgn(rot.growth_minus_defensive_5d)}${fmt(rot.growth_minus_defensive_5d)}pp</b> ·
     近20日 <b>${sgn(rot.growth_minus_defensive_20d)}${fmt(rot.growth_minus_defensive_20d)}pp</b>（pp 为百分点差，负值=防御跑赢）。
     配合 <b>科技/必需消费比值</b>近5日 ${sgn(ratios.find(r => r.key === 'tech_defensive')?.d5)}${fmt(ratios.find(r => r.key === 'tech_defensive')?.d5)}%、
     <b>等权/市值权</b> ${sgn(ratios.find(r => r.key === 'breadth')?.d5)}${fmt(ratios.find(r => r.key === 'breadth')?.d5)}% 交叉验证资金去向。` +
    (structure?.regime ? `<br><span style="color:var(--ink3)">结构判别（见⑤）：<b style="color:var(--ink2)">${structure.regime.label}</b>——风格差为负但宽度为正时，属权重股/AI 链拖累，不等于全市场避险。</span>` : '') +
    `</div>`;

  const v = L.vol || {}, c = L.credit || {};
  $('credit-cards').innerHTML = `
    <div class="card"><div class="k"><span>高收益债利差 HY OAS</span></div>
      <div class="v num">${fmt(c.hy_oas)}%</div>
      <div class="s">${c.date || '—'} · 20日 ${bp(c.hy_oas_chg20)}（走阔=信用风险上升）</div></div>
    <div class="card"><div class="k"><span>MOVE（债市隐含波动）</span></div>
      <div class="v num">${fmt(v.move, 1)}</div>
      <div class="s">${v.move != null && v.move > 120 ? '高波动区间' : '常态区间'} · 利率市场的"VIX"</div></div>
    <div class="card"><div class="k"><span>VIX − VIX3M（期限结构）</span></div>
      <div class="v num ${cls(v.term)}">${sgn(v.term)}${fmt(v.term)}</div>
      <div class="s">VIX ${fmt(v.vix)} / 3M ${fmt(v.vix3m)} · ${v.term != null && v.term > 0 ? '倒挂 → 近端恐慌' : '正挂 → 短期平静'}</div></div>`;
}

/* ══════════ ⑤ 结构判别与观察池 ══════════ */
const GROUP_NAMES = { breadth: '宽度与基准', defensive: '防御/红利', real_assets: '实物/抗通胀', ai_offense: 'AI/进攻' };
function renderStructure(S, t) {
  if (!S) {
    $('regime-box').innerHTML = '<div class="sb-t">该快照无结构判别数据</div><div class="sb-b">20261022 起的新快照才包含该模块。</div>';
    $('struct-cards').innerHTML = '<div class="card"><div class="v">—</div></div>';
    return;
  }
  const ix = S.index || {}, ai = S.ai_chain || {}, na = S.non_ai || {}, disp = S.dispersion || {}, rg = S.regime || {};
  const quad = [
    { code: 'structural-deai', t: '指数↓ / 宽度↑', n: '结构性去AI' },
    { code: 'broad-riskoff', t: '指数↓ / 宽度↓', n: '全面避险' },
    { code: 'broad-riskon', t: '指数↑ / 宽度↑', n: '全面 risk-on' },
    { code: 'narrow-rally', t: '指数↑ / 宽度↓', n: '窄幅抱团' },
  ];
  $('regime-box').innerHTML =
    `<div class="sb-t">当前结构：${rg.label || '—'}</div>
     <div class="sb-b">${rg.desc || ''} · 数据日期 ${S.as_of || '—'}</div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">
       ${quad.map(q => `<div style="font-size:11.5px;padding:6px 10px;border:1px solid ${q.code === rg.code ? 'var(--ink)' : 'var(--line)'};border-radius:4px;background:${q.code === rg.code ? 'var(--softbg)' : 'transparent'};color:${q.code === rg.code ? 'var(--ink)' : 'var(--ink3)'}">
         <b>${q.n}</b> · ${q.t}</div>`).join('')}
     </div>`;
  $('struct-cards').innerHTML = `
    <div class="card"><div class="k"><span>标普500（市值权）</span></div>
      <div class="v num ${cls(ix.spx_d1)}">${sgn(ix.spx_d1)}${fmt(ix.spx_d1)}%</div>
      <div class="s">SPY ${sgn(ix.spy_d1)}${fmt(ix.spy_d1)}%</div></div>
    <div class="card"><div class="k"><span>标普等权 RSP</span></div>
      <div class="v num ${cls(ix.rsp_d1)}">${sgn(ix.rsp_d1)}${fmt(ix.rsp_d1)}%</div>
      <div class="s">等权 − 市值权：<b class="${cls(ix.spread)}">${sgn(ix.spread)}${fmt(ix.spread)}pp</b></div></div>
    <div class="card"><div class="k"><span>AI 链等权篮子</span></div>
      <div class="v num ${cls(ai.basket_d1)}">${sgn(ai.basket_d1)}${fmt(ai.basket_d1)}%</div>
      <div class="s">相对标普 <b class="${cls(ai.vs_spx_d1)}">${sgn(ai.vs_spx_d1)}${fmt(ai.vs_spx_d1)}pp</b> · 非AI 8行业 ${sgn(na.basket_d1)}${fmt(na.basket_d1)}%</div></div>
    <div class="card"><div class="k"><span>离散度：z≥2 个股</span></div>
      <div class="v num">${disp.z2_count ?? '—'}<span style="font-size:13px;color:var(--ink3)"> / ${disp.universe ?? '—'}</span></div>
      <div class="s">横截面标准差 ${fmt(disp.cs_std)}% · 跟踪池口径，非全市场</div></div>`;

  const groups = {};
  (S.watchlist || []).forEach(w => {
    if (!groups[w.group]) groups[w.group] = { name: w.group_name, d1s: [], tickers: [] };
    if (w.d1 != null) groups[w.group].d1s.push(w.d1);
    groups[w.group].tickers.push(w);
  });
  const order = ['breadth', 'defensive', 'real_assets', 'ai_offense'];
  const rows = order.filter(g => groups[g]);
  $('watch-table').innerHTML =
    '<tr><th>名称</th><th>代码</th><th>最新</th><th>1日</th><th>5日</th><th>20日</th><th>相对标普20日</th></tr>' +
    rows.map(g => {
      const grp = groups[g];
      return `<tr><td colspan="7" style="background:var(--softbg);color:var(--ink2);font-weight:600">${grp.name}
        <span style="font-weight:400;color:var(--ink3)">· 组内等权当日 ${sgn(avg(grp.d1s))}${fmt(avg(grp.d1s))}%</span></td></tr>` +
        grp.tickers.map(w => `<tr>
          <td>${w.name}</td><td style="color:var(--ink3)">${w.ticker}</td>
          <td class="num">${fmt(w.price)}</td>
          <td class="num ${cls(w.d1)}">${sgn(w.d1)}${fmt(w.d1)}%</td>
          <td class="num ${cls(w.d5)}">${sgn(w.d5)}${fmt(w.d5)}%</td>
          <td class="num ${cls(w.d20)}">${sgn(w.d20)}${fmt(w.d20)}%</td>
          <td class="num ${cls(w.rs20)}">${sgn(w.rs20)}${fmt(w.rs20)}pp</td></tr>`).join('');
    }).join('');

  const chart = makeChart('ch-groups');
  if (chart) {
    const vals = rows.map(g => avg(groups[g].d1s));
    chart.setOption({
      tooltip: { ...TIP, valueFormatter: v => v == null ? '—' : v + '%' },
      grid: { left: 50, right: 20, top: 16, bottom: 24 },
      xAxis: { type: 'category', data: rows.map(g => GROUP_NAMES[g] || g), ...AX },
      yAxis: { type: 'value', name: '%', ...AX },
      series: [{ type: 'bar', barMaxWidth: 40,
        data: vals.map(v => ({ value: v, itemStyle: { color: (v ?? 0) >= 0 ? t.up : t.down } })),
        label: { show: true, position: 'top', fontSize: 11, color: t.text,
                 formatter: p => p.value == null ? '—' : (p.value > 0 ? '+' : '') + p.value.toFixed(2) } }]
    });
  }
}

function avg(arr) {
  const xs = (arr || []).filter(x => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/* ══════════ 渲染主流程 ══════════ */
function renderAll(DATA) {
  LAST = DATA;
  refreshPalette();
  charts.forEach(c => c.dispose());
  charts = [];
  const t = TH();

  document.title = `美股与美债复盘仪表盘 · ${DATA.date_display || DATA.date}`;
  $('mh-date').textContent = DATA.date_display || DATA.date;
  $('mh-gen').textContent = (DATA.generated_at || '—').replace('T', ' ').slice(0, 19);
  $('mh-chips').innerHTML = (DATA.meta_chips || []).map(x => `<span class="chip">${x}</span>`).join('');
  $('caliber-notes').innerHTML = (DATA.notes || []).map(n => `<li>${n}</li>`).join('');

  /* ① 隔夜速览 */
  const idx = DATA.market?.indices || [];
  const cross = DATA.market?.cross || [];
  $('idx-cards').innerHTML = idx.map(c => `
    <div class="card">
      <div class="k"><span>${c.name}</span><span class="${cls(c.d1)} num">${sgn(c.d1)}${fmt(c.d1)}%</span></div>
      <div class="v num">${c.price != null ? c.price.toLocaleString('en-US') : '—'}</div>
      <div class="s num">5日 ${sgn(c.d5)}${fmt(c.d5)}% · 20日 ${sgn(c.d20)}${fmt(c.d20)}%</div>
      ${sparkline(c.spark)}
    </div>`).join('');
  $('cross-cards').innerHTML = cross.map(c => `
    <div class="card">
      <div class="k"><span>${c.name}</span><span class="${cls(c.d1)} num">${sgn(c.d1)}${fmt(c.d1)}%</span></div>
      <div class="v num">${fmt(c.price)}</div>
      <div class="s num">5日 ${sgn(c.d5)}${fmt(c.d5)}%</div>
      ${sparkline(c.spark)}
    </div>`).join('');
  const spx = idx.find(i => i.key === 'SPX') || {};
  const vix = cross.find(i => i.key === 'VIX') || {};
  const tenY = DATA.rates?.curve?.values?.[DATA.rates.curve.tenors.indexOf('10 Yr')];
  $('ov-summary').innerHTML =
    `标普500 收 <b>${fmt(spx.price)}</b>（${sgn(spx.d1)}${fmt(spx.d1)}%），VIX <b>${fmt(vix.price)}</b>` +
    `，美债10Y <b>${fmt(tenY)}%</b>（财政部曲线 ${DATA.rates?.curve?.date || '—'}）· ` +
    `数据为美东 ${DATA.date_display} 交易日。`;

  /* ② 板块热力 + 轮动 */
  const grid = DATA.sectors?.grid || [];
  $('heat-grid').innerHTML = grid.map(c => `
    <div class="cell" style="${heatColor(c.d1)}" data-ticker="${c.ticker}">
      <span class="cn">${c.name}</span>
      <span class="cp num">${sgn(c.d1)}${fmt(c.d1)}%</span>
    </div>`).join('');
  const tip = $('heat-tip');
  $('heat-grid').querySelectorAll('.cell').forEach(el => {
    const c = grid.find(g => g.ticker === el.dataset.ticker);
    el.addEventListener('mousemove', e => {
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
      tip.innerHTML = `<b>${c.name} ${c.ticker}</b><br>5日 ${sgn(c.d5)}${fmt(c.d5)}% · 20日 ${sgn(c.d20)}${fmt(c.d20)}% · 60日 ${sgn(c.d60)}${fmt(c.d60)}%<br>RS20（对标普超额）${sgn(c.rs20)}${fmt(c.rs20)}pp`;
    });
    el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });

  const roll = DATA.sectors?.roll;
  const rollChart = makeChart('ch-roll');
  if (rollChart && roll && roll.rows.length) {
    const rows = [...roll.rows].map(r => ({
      ...r, sum: r.cells.reduce((a, v) => a + (v || 0), 0)
    })).sort((a, b) => b.sum - a.sum);
    const data = [];
    rows.forEach((r, y) => r.cells.forEach((v, x) => data.push([x, y, v])));
    rollChart.setOption({
      tooltip: { ...TIP, formatter: p => `${rows[p.value[1]].name} ${roll.dates[p.value[0]]}<br>${p.value[2] == null ? '—' : sgn(p.value[2]) + fmt(p.value[2]) + '%'}` },
      grid: { left: 70, right: 20, top: 10, bottom: 30 },
      xAxis: { type: 'category', data: roll.dates.map(d => d.slice(5)), ...AX },
      yAxis: { type: 'category', data: rows.map(r => r.name), ...AX },
      visualMap: { min: -3, max: 3, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
        inRange: { color: [t.hm[0], t.hm[1], t.hm[2]] }, textStyle: { color: t.text } },
      series: [{ type: 'heatmap', data,
        label: { show: true, fontSize: 10, color: t.text, formatter: p => p.value[2] == null ? '—' : fmt(p.value[2], 1) },
        itemStyle: { borderColor: t.split, borderWidth: 1 } }]
    });
  }

  /* ③ 七巨头与 AI 科技股 */
  const ai = DATA.ai_tech || { mag7: [], stocks: [], themes: [] };
  $('theme-pills').innerHTML = ai.themes.map((th2, i) => `
    <span class="rank-pill">${['🥇', '🥈', '🥉'][i] || ''} ${th2.name}
      <b class="${cls(th2.d5)} num">${sgn(th2.d5)}${fmt(th2.d5)}%</b>
      <span style="color:var(--ink3)">/ 20日 ${sgn(th2.d20)}${fmt(th2.d20)}% · 20日上涨 ${th2.up20_count}/${th2.member_count}</span>
    </span>`).join('');
  const hot = ai.themes[0];
  if (hot) $('ai-summary').innerHTML =
    `近5日最热主线：<b>${hot.name}</b>（等权 ${sgn(hot.d5)}${fmt(hot.d5)}%，20日内 ${hot.up20_count}/${hot.member_count} 只上涨）。` +
    `七巨头 + 三条 AI 主线等权篮子，按近5日排序。`;

  const themeChart = makeChart('ch-themes');
  if (themeChart && ai.themes.length) {
    themeChart.setOption({
      tooltip: { ...TIP },
      legend: { textStyle: { color: t.text }, top: 0 },
      grid: { left: 60, right: 20, top: 30, bottom: 24 },
      xAxis: { type: 'category', data: ai.themes.map(x => x.name), ...AX },
      yAxis: { type: 'value', name: '%', ...AX },
      series: [
        { name: '近5日', type: 'bar', data: ai.themes.map(x => x.d5),
          itemStyle: { color: p => (p.value >= 0 ? t.up : t.down) } },
        { name: '近20日', type: 'bar', data: ai.themes.map(x => x.d20),
          itemStyle: { color: p => (p.value >= 0 ? 'rgba(212,76,71,.45)' : 'rgba(15,123,108,.45)') } }
      ]
    });
  }

  const rowHtml = c => `<tr>
    <td>${c.name} <span style="color:var(--ink3)">${c.ticker}</span></td>
    <td class="num">${c.price != null ? c.price.toLocaleString('en-US') : '—'}</td>
    <td class="num ${cls(c.d1)}">${sgn(c.d1)}${fmt(c.d1)}%</td>
    <td class="num ${cls(c.d5)}">${sgn(c.d5)}${fmt(c.d5)}%</td>
    <td class="num ${cls(c.d20)}">${sgn(c.d20)}${fmt(c.d20)}%</td>
    <td class="num ${cls(c.d60)}">${sgn(c.d60)}${fmt(c.d60)}%</td>
    <td class="num ${cls(c.rs20)}">${sgn(c.rs20)}${fmt(c.rs20)}</td></tr>`;
  const head = '<tr><th>名称</th><th>收盘</th><th>1日</th><th>5日</th><th>20日</th><th>60日</th><th>RS20(pp)</th></tr>';
  $('mag7-table').innerHTML = head + [...ai.mag7].sort((a, b) => (b.d5 ?? -99) - (a.d5 ?? -99)).map(rowHtml).join('');
  const themeNameOf = { semis: 'AI半导体', cloud: 'AI云与软件', infra: 'AI基建与电力' };
  $('ai-table').innerHTML =
    '<tr><th>名称</th><th>主线</th><th>1日</th><th>5日</th><th>20日</th><th>60日</th><th>RS20(pp)</th></tr>' +
    [...ai.stocks].sort((a, b) => (b.d5 ?? -99) - (a.d5 ?? -99)).map(c => `<tr>
      <td>${c.name} <span style="color:var(--ink3)">${c.ticker}</span></td>
      <td><span class="theme-tag">${themeNameOf[c.theme] || c.theme}</span></td>
      <td class="num ${cls(c.d1)}">${sgn(c.d1)}${fmt(c.d1)}%</td>
      <td class="num ${cls(c.d5)}">${sgn(c.d5)}${fmt(c.d5)}%</td>
      <td class="num ${cls(c.d20)}">${sgn(c.d20)}${fmt(c.d20)}%</td>
      <td class="num ${cls(c.d60)}">${sgn(c.d60)}${fmt(c.d60)}%</td>
      <td class="num ${cls(c.rs20)}">${sgn(c.rs20)}${fmt(c.rs20)}</td></tr>`).join('');

  /* ④ 美元流动性与风险偏好 */
  renderLiquidity(DATA.liquidity, t, DATA.structure);
  /* ⑤ 结构判别与观察池 */
  renderStructure(DATA.structure, t);

  /* ⑤ 收益率曲线 */
  const R = DATA.rates;
  if (R && R.curve) {
    const sp = R.spreads || {};
    $('spread-cards').innerHTML = `
      <div class="spread-card"><div class="sk">2s10s 利差</div>
        <div class="sv num ${cls(sp.s2s10)}">${sgn(sp.s2s10)}${fmt(sp.s2s10)}%</div>
        <div class="ss">10Y − 2Y · ${sp.inverted ? '倒挂中' : '正常（未倒挂）'}</div></div>
      <div class="spread-card"><div class="sk">3M10Y 利差</div>
        <div class="sv num ${cls(sp.s3m10)}">${sgn(sp.s3m10)}${fmt(sp.s3m10)}%</div>
        <div class="ss">10Y − 3M · 衰退预测的经典口径</div></div>
      <div class="spread-card"><div class="sk">曲线状态</div>
        <div class="sv">${sp.inverted ? '⚠️ 倒挂' : '正常'}</div>
        <div class="ss">${R.curve.date} · 财政部日度</div></div>`;
    $('curve-desc').innerHTML =
      `当前 2s10s = <b>${sgn(sp.s2s10)}${fmt(sp.s2s10)}%</b>（${sp.inverted ? '倒挂' : '未倒挂'}）。` +
      `正常情况下长端高于短端；倒挂往往预示衰退。短端体现政策意志，长端体现市场预期。`;

    const curveChart = makeChart('ch-curve');
    if (curveChart) {
      const mk = (label, c, color, width, dash) => c && ({
        name: label, type: 'line', data: c.values, smooth: true, showSymbol: true, symbolSize: 5,
        lineStyle: { color, width, type: dash || 'solid' }, itemStyle: { color }
      });
      curveChart.setOption({
        tooltip: { ...TIP, trigger: 'axis', valueFormatter: v => v == null ? '—' : v + '%' },
        legend: { textStyle: { color: t.text }, top: 0 },
        grid: { left: 46, right: 20, top: 30, bottom: 24 },
        xAxis: { type: 'category', data: R.curve.tenors, boundaryGap: false, ...AX },
        yAxis: { type: 'value', name: '%', scale: true, ...AX },
        series: [
          mk('当日 ' + R.curve.date, R.curve, t.up, 2.4),
          mk('1周前', R.curve_1w, t.accent, 1.4),
          mk('1月前', R.curve_1m, t.gold, 1.4),
          mk('1年前', R.curve_1y, t.sub, 1.2, 'dashed'),
        ].filter(Boolean)
      });
    }

    /* 关键期限矩阵：当日/1周/1月/1年前 + 周变动 */
    const pick = (c, tenor) => {
      if (!c || !c.tenors) return null;
      const i = c.tenors.indexOf(tenor);
      return i >= 0 ? c.values[i] : null;
    };
    const keyTenors = ['1 Mo', '3 Mo', '6 Mo', '1 Yr', '2 Yr', '5 Yr', '10 Yr', '30 Yr'];
    const bpDiff = (a, b) => (a == null || b == null) ? null : Math.round((a - b) * 100);
    $('curve-table').innerHTML =
      '<tr><th>期限</th><th>当日</th><th>1周前</th><th>1月前</th><th>1年前</th><th>周变动</th></tr>' +
      keyTenors.map(tn => {
        const cur = pick(R.curve, tn), w = pick(R.curve_1w, tn), m = pick(R.curve_1m, tn), y = pick(R.curve_1y, tn);
        const d = bpDiff(cur, w);
        return `<tr><td>${tn.replace(' Mo', '个月').replace(' Yr', '年')}</td>
          <td class="num">${fmt(cur)}%</td><td class="num">${fmt(w)}%</td>
          <td class="num">${fmt(m)}%</td><td class="num">${fmt(y)}%</td>
          <td class="num ${cls(d)}">${d == null ? '—' : sgn(d) + d + 'bp'}</td></tr>`;
      }).join('');

    const histChart = makeChart('ch-hist');
    if (histChart && R.hist_10y?.length) {
      histChart.setOption({
        tooltip: { ...TIP, trigger: 'axis', valueFormatter: v => v == null ? '—' : v + '%' },
        legend: { textStyle: { color: t.text }, top: 0 },
        grid: { left: 46, right: 20, top: 30, bottom: 24 },
        xAxis: { type: 'category', data: R.hist_10y.map(p => p[0]), ...AX },
        yAxis: { type: 'value', name: '%', scale: true, ...AX },
        series: [
          { name: '10Y', type: 'line', data: R.hist_10y.map(p => p[1]), showSymbol: false,
            lineStyle: { color: t.up, width: 1.6 }, itemStyle: { color: t.up } },
          { name: '2Y', type: 'line', data: R.hist_2y.map(p => p[1]), showSymbol: false,
            lineStyle: { color: t.accent, width: 1.4 }, itemStyle: { color: t.accent } }
        ]
      });
    }

    /* ⑥ 三因子 */
    const tp10 = R.term_premium10;
    $('factor-cards').innerHTML = `
      <div class="card"><div class="k"><span>名义 10Y</span></div>
        <div class="v num">${fmt(R.curve.values[R.curve.tenors.indexOf('10 Yr')])}%</div>
        <div class="s">财政部日度 · ${R.curve.date}</div></div>
      <div class="card"><div class="k"><span>实际利率（10Y TIPS）</span></div>
        <div class="v num">${fmt(R.real10)}%</div>
        <div class="s">实体经济回报的判断</div></div>
      <div class="card"><div class="k"><span>通胀预期（Breakeven）</span></div>
        <div class="v num">${fmt(R.breakeven10)}%</div>
        <div class="s">名义 − 实际，市场对未来 CPI 路径的定价</div></div>
      <div class="card"><div class="k"><span>期限溢价（ACM）</span></div>
        <div class="v num">${tp10 ? sgn(tp10.value) + fmt(tp10.value) + '%' : '—'}</div>
        <div class="s">${tp10 ? 'NY Fed ACM · ' + tp10.date : 'ACM 获取失败'}</div></div>`;
    const fh = R.factor_hist || {};
    const fc = makeChart('ch-factors');
    if (fc && fh.nominal?.length) {
      const dates = fh.nominal.map(p => p[0]);
      const lookup = arr => { const m = Object.fromEntries(arr || []); return dates.map(d => m[d] ?? null); };
      fc.setOption({
        tooltip: { ...TIP, trigger: 'axis', valueFormatter: v => v == null ? '—' : v + '%' },
        legend: { textStyle: { color: t.text }, top: 0 },
        grid: { left: 46, right: 20, top: 30, bottom: 24 },
        xAxis: { type: 'category', data: dates, ...AX },
        yAxis: { type: 'value', name: '%', scale: true, ...AX },
        series: [
          { name: '名义10Y', type: 'line', data: fh.nominal.map(p => p[1]), showSymbol: false, lineStyle: { color: t.ink, width: 1.8 }, itemStyle: { color: t.ink } },
          { name: '实际利率', type: 'line', data: lookup(fh.real), showSymbol: false, lineStyle: { color: t.accent, width: 1.4 }, itemStyle: { color: t.accent } },
          { name: '通胀预期', type: 'line', data: lookup(fh.breakeven), showSymbol: false, lineStyle: { color: t.gold, width: 1.4 }, itemStyle: { color: t.gold } }
        ]
      });
      // 归因：近 5 日变动最大的因子
      const chg = arr => (arr && arr.length >= 6) ? (arr[arr.length - 1][1] - arr[arr.length - 6][1]) : null;
      const moves = [['实际利率', chg(fh.real)], ['通胀预期', chg(fh.breakeven)]].filter(x => x[1] != null);
      if (moves.length) {
        moves.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        const [nm, mv] = moves[0];
        $('factor-desc').innerHTML =
          `近5日 10Y 变动的主导因子：<b>${nm}</b>（${sgn(mv)}${(mv * 100).toFixed(0)}bp）。` +
          `名义利率 ≈ 实际利率 + 通胀预期；期限溢价（ACM ${tp10 ? sgn(tp10.value) + fmt(tp10.value) + '%' : '—'}）是嵌入其中的风险补偿。` +
          `${nm === '实际利率' ? '实际利率主导 → 市场对实体经济回报的判断在变。' : '通胀预期主导 → 市场在重估 CPI 路径（关税/油价/数据）。'}`;
      }
    }
  }

  /* ⑦ 研判 */
  if (DATA.calls && DATA.calls.cards) {
    $('calls-body').innerHTML =
      `<div class="call-cards">${DATA.calls.cards.map(c => `
        <div class="call-card"><span class="cc-tag ${c.cls}">${c.tag}</span>
        <div class="cc-t">${c.t}</div><div class="cc-b">${c.b}</div><div class="cc-e">${c.e}</div></div>`).join('')}</div>` +
      (DATA.calls.sig ? `<div class="sig-box"><div class="sb-t">${DATA.calls.sig.t}</div><div class="sb-b">${DATA.calls.sig.b}</div></div>` : '');
  }
}

/* ══════════ 数据加载与日期导航 ══════════ */
const state = { dates: [], cur: null, cache: {} };

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function loadDate(dateKey) {
  $('db-status').textContent = '加载中…';
  try {
    if (!state.cache[dateKey])
      state.cache[dateKey] = await fetchJson(`./data/snapshots/${dateKey}.json`);
    state.cur = dateKey;
    renderAll(state.cache[dateKey]);
    syncNav();
    $('db-status').textContent = `${dateKey} · 共 ${state.dates.length} 个交易日`;
  } catch (e) {
    $('db-status').textContent = `加载失败：${e.message}`;
  }
}

function syncNav() {
  const i = state.dates.indexOf(state.cur);
  $('nav-prev').disabled = i >= state.dates.length - 1;
  $('nav-next').disabled = i <= 0;
  $('date-sel').value = state.cur;
}

async function boot() {
  refreshPalette();
  try {
    const meta = await fetchJson('./data/dashboard-meta.json');
    state.dates = meta.dates || [];
    if (!state.dates.length) throw new Error('无快照');
    $('date-sel').innerHTML = state.dates.map(d => `<option value="${d}">${d}</option>`).join('');
    await loadDate(state.dates[0]);
  } catch (e) {
    $('db-status').textContent = `初始化失败：${e.message}`;
  }
}

$('nav-prev').addEventListener('click', () => {
  const i = state.dates.indexOf(state.cur);
  if (i < state.dates.length - 1) loadDate(state.dates[i + 1]);
});
$('nav-next').addEventListener('click', () => {
  const i = state.dates.indexOf(state.cur);
  if (i > 0) loadDate(state.dates[i - 1]);
});
$('nav-latest').addEventListener('click', () => loadDate(state.dates[0]));
$('date-sel').addEventListener('change', e => loadDate(e.target.value));
$('themeBtn').addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));

/* 主站日夜切换联动（同域 iframe） */
try {
  if (window.parent !== window && window.parent.document) {
    new MutationObserver(() => {
      const th = window.parent.document.documentElement.getAttribute('data-theme');
      if (th && th !== document.documentElement.dataset.theme) applyTheme(th, false);
    }).observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
} catch (e) { /* 跨域忽略 */ }

boot();
