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

/* ── 数字格式化 ── */
function fmtMoney(x) {  // 大额美元 → $40.40万亿
  if (x == null) return '—';
  if (x >= 1e12) return '$' + (x / 1e12).toFixed(2) + ' 万亿';
  if (x >= 1e8) return '$' + (x / 1e8).toFixed(2) + ' 亿';
  return '$' + Math.round(x).toLocaleString('en-US');
}
function fmtClock(x) {
  return '$ ' + Math.floor(x).toLocaleString('en-US');
}

/* ── 债务时钟动画 ── */
let clockTimer = null;
function startClock(base, rate, asOf) {
  if (clockTimer) clearInterval(clockTimer);
  if (base == null || rate == null) { $('debt-clock').textContent = '$ —'; return; }
  const t0 = Date.now();
  const tick = () => {
    const cur = base + rate * (Date.now() - t0) / 1000;
    $('debt-clock').textContent = fmtClock(cur);
  };
  $('debt-clock-sub').innerHTML =
    `每秒增加约 <b>$ ${Math.round(rate).toLocaleString('en-US')}</b>（近30个发布日日均推算）· 官方锚点 ${asOf || '—'}（T+1）`;
  tick();
  clockTimer = setInterval(tick, 200);
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

  /* ④ 债务时钟 */
  const debt = DATA.debt;
  if (debt) {
    startClock(debt.total, debt.per_second_rate, debt.as_of);
    const ie = debt.interest_expense;
    $('debt-cards').innerHTML = `
      <div class="spread-card"><div class="sk">人均负债</div>
        <div class="sv num">${debt.per_capita != null ? '$ ' + Math.round(debt.per_capita).toLocaleString('en-US') : '—'}</div>
        <div class="ss">${debt.population_note || ''}</div></div>
      <div class="spread-card"><div class="sk">年利息支出（FY累计）</div>
        <div class="sv num">${ie ? fmtMoney(ie.value) : '—'}</div>
        <div class="ss">${ie ? (ie.note || '') + ' · ' + ie.as_of : 'Treasury 端点不可用'}</div></div>
      <div class="spread-card"><div class="sk">债务 / GDP</div>
        <div class="sv num">—</div>
        <div class="ss">GDP 季频序列待 FRED 恢复后接入</div></div>`;
    const debtChart = makeChart('ch-debt');
    if (debtChart && debt.history?.length) {
      debtChart.setOption({
        tooltip: { ...TIP, trigger: 'axis',
          valueFormatter: v => '$' + (v / 1e12).toFixed(2) + ' 万亿' },
        grid: { left: 60, right: 20, top: 16, bottom: 24 },
        xAxis: { type: 'category', data: debt.history.map(r => r.date), ...AX },
        yAxis: { type: 'value', name: '万亿$',
          axisLabel: { ...AX.axisLabel, formatter: v => (v / 1e12).toFixed(1) },
          axisLine: AX.axisLine, axisTick: AX.axisTick, splitLine: AX.splitLine,
          min: v => Math.floor(v.min / 1e12) * 1e12 },
        series: [{ type: 'line', data: debt.history.map(r => r.total),
          showSymbol: false, lineStyle: { color: t.gold, width: 1.6 },
          areaStyle: { color: t.gold, opacity: 0.08 } }]
      });
    }
  } else {
    startClock(null, null, null);
    $('debt-cards').innerHTML = '<div class="spread-card"><div class="sv">—</div><div class="ss">Treasury Fiscal Data 不可用</div></div>';
  }

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
