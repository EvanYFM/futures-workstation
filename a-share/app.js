/* A股仪表盘 SPA 渲染器 · 由 dashboard_template.html 转换生成
   架构: data/dashboard-meta.json 索引 + data/snapshots/<date>.json 按日懒加载 */
const fmt = (x, d=2) => (x==null ? '—' : x.toFixed(d));
const sgn = x => x > 0 ? '+' : '';
const cls = x => x > 0 ? 'up' : (x < 0 ? 'down' : 'flat');
const $ = id => document.getElementById(id);

/* ── 日/夜主题: 动态调色板 ── */
const TH = () => document.documentElement.dataset.theme === 'dark' ? {
  ink:'#e8e5da', text:'#b0ada3', sub:'#8a877d',
  up:'#e2726b', down:'#3fa795', accent:'#6cb2f5', gold:'#b3a78f',
  line:'rgba(232,229,218,.18)', split:'rgba(232,229,218,.08)', split2:'rgba(232,229,218,.06)',
  mark:'rgba(232,229,218,.28)', bubble:'#141412',
  tipbg:'#23231f', tiptext:'#f0ede4',
  upA:'rgba(226,114,107,.68)', downA:'rgba(63,167,149,.68)', goldA:'rgba(179,167,143,.18)',
  hm:['#3f5a54','#2e2e2b','#7a4a45'], quad:'#6a6862', clab:'#b0ada3'
} : {
  ink:'#37352f', text:'#787774', sub:'#9b9a97',
  up:'#d44c47', down:'#0f7b6c', accent:'#2383e2', gold:'#9a8f7d',
  line:'rgba(55,53,47,0.16)', split:'rgba(55,53,47,0.07)', split2:'rgba(55,53,47,0.06)',
  mark:'rgba(55,53,47,0.22)', bubble:'#fff',
  tipbg:'#37352f', tiptext:'#fff',
  upA:'rgba(212,76,71,0.68)', downA:'rgba(15,123,108,0.68)', goldA:'rgba(154,143,125,0.14)',
  hm:['#6fa79e','#e9e8e4','#d99692'], quad:'#c4c3bf', clab:'#5f5e5b'
};
let AX, TIP;
function refreshPalette() {
  const t = TH();
  AX = { axisLine: {lineStyle:{color:t.line}}, axisTick:{show:false},
    axisLabel:{color:t.text,fontSize:11}, splitLine:{lineStyle:{color:t.split}} };
  TIP = { backgroundColor:t.tipbg, borderWidth:0, textStyle:{color:t.tiptext,fontSize:12},
    confine:true, extraCssText:'box-shadow:0 4px 14px rgba(0,0,0,.25);border-radius:5px;' };
}
let LAST = null;
function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('themeBtn');
  if (btn) { btn.textContent = theme === 'dark' ? '☀️ 日间' : '🌙 夜间'; }
  if (persist) { try { localStorage.setItem('ashare.theme', theme); } catch (e) {} }
  refreshPalette();
  if (LAST) renderAll(LAST);
}

let charts = [];
let styleChart = null;
addEventListener('resize', () => charts.forEach(c => c.resize()));

function renderAll(DATA) {
  LAST = DATA;
  refreshPalette();
  charts.forEach(c => c.dispose());
  charts = [];
  styleChart = null;

  /* ── 动态叙述与文本 ── */
  document.title = `A股行业轮动与资金流向监控仪表盘 · ${DATA.date_display || DATA.date}`;
  $('mh-date').textContent = DATA.date_display || DATA.date;
  $('mh-gen').textContent = DATA.generated_at || '—';
  if (DATA.meta_chips) $('mh-chips').innerHTML = DATA.meta_chips.map(t => `<span class="chip">${t}</span>`).join('');
  document.querySelectorAll('[data-desc]').forEach(el => {
    const k = el.dataset.desc;
    if (DATA.narrative && DATA.narrative[k] != null) el.innerHTML = DATA.narrative[k];
  });
  if (DATA.north) {
    $('north-amt').innerHTML = `${DATA.north.amt} <span style="font-size:13px;color:var(--ink3)">亿元</span>`;
    $('north-sub').innerHTML = DATA.north.sub;
  }
  if (DATA.calls) {
    $('call-cards').innerHTML = DATA.calls.cards.map(c => `
      <div class="call-card"><span class="cc-tag ${c.cls}">${c.tag}</span>
      <div class="cc-t">${c.t}</div><div class="cc-b">${c.b}</div><div class="cc-e">${c.e}</div></div>`).join('');
    $('call-sig-t').textContent = DATA.calls.sig.t;
    $('call-sig-b').innerHTML = DATA.calls.sig.b;
    if (DATA.calls.participant_impact) {
      $('call-part-t').textContent = DATA.calls.participant_impact.t;
      $('call-part-b').innerHTML = DATA.calls.participant_impact.b;
      document.getElementById('call-part-t').closest('.sig-box').style.display = '';
    } else {
      document.getElementById('call-part-t').closest('.sig-box').style.display = 'none';
    }
  }
  $('broad-range').textContent = DATA.broad_range ? DATA.broad_range + ' · 起点=100' : '起点=100';

/* ── ① 指数卡 ── */
$('idx-cards').innerHTML = DATA.indices.map(r => `
  <div class="card">
    <div class="k"><span>${r.name}</span><span class="${cls(r.pct)} num">${sgn(r.pct)}${fmt(r.pct)}%</span></div>
    <div class="v num">${fmt(r.close)}</div>
    <div class="s num">成交 ${r.turnover.toLocaleString()} 亿元${r.high ? ` · 日内振幅 ${r.high}/${r.low}` : ''}</div>
  </div>`).join('');

/* ── 涨跌家数 ── */
const M = DATA.market, tot = M.up + M.down + 131;
$('seg-up').style.flex = M.up; $('seg-flat').style.flex = 131; $('seg-down').style.flex = M.down;
$('nb-up').textContent = M.up; $('nb-flat').textContent = 131; $('nb-down').textContent = M.down;
$('nb-lu').textContent = M.limit_up; $('nb-ld').textContent = M.limit_down;

/* ── 大小单 ── */
const F = DATA.fund_flow.today;
const setCard = (pre, val, pct) => {
  $(pre).textContent = sgn(val) + fmt(val) + ' 亿';
  $(pre).className = 'v num ' + cls(val);
  if (pct != null) { const e = $(pre + '-pct'); e.textContent = sgn(pct) + fmt(pct) + '%'; e.className = cls(pct) + ' num'; }
};
setCard('ff-super', F.super, -0.47); setCard('ff-big', F.big, -0.45);
setCard('ff-mid', F.mid, null); setCard('ff-small', F.small, null);
$('ff-super-in').textContent = fmt(F.super_in); $('ff-super-out').textContent = fmt(F.super_out);
$('ff-big-in').textContent = fmt(F.big_in); $('ff-big-out').textContent = fmt(F.big_out);
$('ff-mid-in').textContent = fmt(F.mid_in); $('ff-mid-out').textContent = fmt(F.mid_out);
$('ff-small-in').textContent = fmt(F.small_in); $('ff-small-out').textContent = fmt(F.small_out);
$('sp-cy').textContent = fmt(DATA.fund_flow.splits['创业板']);
$('sp-kc').textContent = fmt(DATA.fund_flow.splits['科创板']);
$('sp-hs').textContent = fmt(DATA.fund_flow.splits['沪深300成份']);
$('ff-note').innerHTML = DATA.fund_flow.note_stcn + '；东财口径主力净流出 174.75 亿（−0.92%），<b>小单逆势净流入 215.94 亿</b>，散户承接特征明显。';

/* ── ② 热力网格 ── */
const grid = $('heat-grid'), tip = $('heat-tip');
DATA.industries.forEach(ind => {
  const a = Math.min(Math.abs(ind.pct) / 5.3, 1) * 0.62 + 0.1;
  const bg = ind.pct > 0 ? `rgba(212,76,71,${a})` : (ind.pct < 0 ? `rgba(15,123,108,${a})` : '#eceae7');
  const el = document.createElement('div');
  el.className = 'cell'; el.style.background = bg;
  el.innerHTML = `<span class="cn">${ind.name}</span><span class="cp num" style="color:${ind.pct>=0?'#fff':'#fff'}">${sgn(ind.pct)}${fmt(ind.pct)}%</span>`;
  el.addEventListener('mousemove', e => {
    tip.style.display = 'block';
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 250) + 'px';
    tip.style.top = (e.clientY + 14) + 'px';
    tip.innerHTML = `<b>${ind.name}</b>（申万一级）<br>当日涨跌：<b>${sgn(ind.pct)}${fmt(ind.pct)}%</b><br>主力资金：${ind.flow >= 0 ? '<span style="color:#ff9d98">' : '<span style="color:#7fd8cb">'}${sgn(ind.flow)}${fmt(ind.flow)} 亿元</span><br><span style="opacity:.6">数据宝口径 · 2026-10-09</span>`;
  });
  el.addEventListener('mouseleave', () => tip.style.display = 'none');
  grid.appendChild(el);
});

/* ── ECharts 公共配置 ── */
refreshPalette();
const mk = (id, opt) => { const c = echarts.init($(id), null, {renderer:'canvas'}); c.setOption(opt); charts.push(c); return c; };

/* ── ① 近5日主力净流入柱图 ── */
mk('ch-main5d', {
  grid:{left:44,right:10,top:18,bottom:22},
  tooltip:{...TIP, formatter: p => `${p[0].name}<br>主力净流入 <b>${sgn(p[0].value)}${fmt(p[0].value)}</b> 亿元`},
  xAxis:{type:'category',data:DATA.fund_flow.days.map(d=>d.date),...AX},
  yAxis:{type:'value',...AX},
  series:[{type:'bar',barWidth:22,
    data:DATA.fund_flow.days.map(d=>({value:d.main, itemStyle:{color:d.main>=0?TH().up:TH().down,opacity:.8}}))}]
});

/* ── ③ 行业资金双向条形 ── */
const inds = [...DATA.industries].sort((a,b) => b.flow - a.flow);
mk('ch-indflow', {
  grid:{left:70,right:56,top:10,bottom:20},
  tooltip:{...TIP, formatter: p => `<b>${p.name}</b><br>主力净流入 ${sgn(p.value)}${fmt(p.value)} 亿元<br><span style="opacity:.65">当日涨跌见右侧坐标</span>`},
  xAxis:{type:'value',...AX},
  yAxis:{type:'category',data:inds.map(i=>i.name),...AX,axisLabel:{color:TH().ink,fontSize:11.5}},
  series:[{type:'bar',barWidth:13,
    data:inds.map(i=>({value:i.flow, itemStyle:{color:i.flow>=0?TH().up:TH().down,opacity:.82},
      label:{show:Math.abs(i.flow)>20,position:i.flow>=0?'right':'left',color:TH().text,fontSize:10,
        formatter:()=>`${sgn(i.flow)}${fmt(i.flow,1)}`}}))}],
  graphic:[{type:'text',right:60,top:4,style:{text:'单位：亿元',fill:TH().sub,fontSize:11}}]
});

/* ── ④ 宽基卡+走势 ── */
$('broad-cards').innerHTML = DATA.broad_styles.map(b => `
  <div class="card">
    <div class="k"><span>${b.name}</span><span class="${cls(b.pct)} num">${sgn(b.pct)}${fmt(b.pct)}%</span></div>
    <div class="mini" style="margin-top:6px">
      5D <b class="${cls(b.r5)} num">${sgn(b.r5)}${fmt(b.r5)}%</b><br>
      20D <b class="${cls(b.r20)} num">${sgn(b.r20)}${fmt(b.r20)}%</b><br>
      60D <b class="${cls(b.r60)} num">${sgn(b.r60)}${fmt(b.r60)}%</b> · 1Y <b class="${cls(b.r250)} num">${sgn(b.r250)}${fmt(b.r250)}%</b>
    </div>
  </div>`).join('');
const BCOLORS = {'上证50':TH().ink,'沪深300':TH().sub,'中证500':'#c9c8c4','中证1000':TH().up,'国证成长':'#e8913d','国证价值':TH().down};
mk('ch-broad', {
  grid:{left:40,right:16,top:30,bottom:46},
  tooltip:{...TIP, trigger:'axis', formatter: ps => ps.map(p=>`${p.marker}${p.seriesName} <b>${fmt(p.value[1],1)}</b>`).join('<br>')},
  legend:{top:0,textStyle:{color:TH().text,fontSize:11},itemWidth:16,itemHeight:2},
  xAxis:{type:'time',...AX,axisLabel:{color:TH().sub,fontSize:10,formatter:v=>echarts.time.format(v,'{MM}/{yy}',false)}},
  yAxis:{type:'value',...AX,scale:true},
  series: DATA.broad_styles.filter(b=>['上证50','中证1000','国证成长','国证价值'].includes(b.name))
    .map(b=>({name:b.name,type:'line',showSymbol:false,lineStyle:{width:b.name==='国证价值'||b.name==='中证1000'?2.2:1.4},
      itemStyle:{color:BCOLORS[b.name]},data:b.hist.map(h=>[h[0],h[1]])}))
});

/* ── ⑤ 五风格卡 ── */
const SCOLORS = {'金融':'#b8860b','稳定':TH().down,'消费':'#c86b85','周期':'#8a7f6d','成长':TH().accent};
$('style-cards').innerHTML = DATA.citics_styles.map(s => `
  <div class="card">
    <div class="k"><span>${s.name}</span><span style="color:${SCOLORS[s.name]};font-size:11px">${s.code}</span></div>
    <div class="mini" style="margin-top:6px">
      5D <b class="${cls(s.r5)} num">${sgn(s.r5)}${fmt(s.r5)}%</b><br>
      20D <b class="${cls(s.r20)} num">${sgn(s.r20)}${fmt(s.r20)}%</b><br>
      60D <b class="${cls(s.r60)} num">${sgn(s.r60)}${fmt(s.r60)}%</b><br>
      1Y <b class="${cls(s.ry)} num">${sgn(s.ry)}${fmt(s.ry)}%</b>
    </div>
  </div>`).join('');
const rank = [...DATA.citics_styles].sort((a,b) => b.r60 - a.r60);
$('style-rank').innerHTML = rank.map((s,i) => `
  <span class="rank-pill" style="border-left:3px solid ${SCOLORS[s.name]}">
    <span style="color:var(--ink3)">${i+1}.</span> ${s.name}
    <b class="${cls(s.r60)} num" style="margin-left:4px">${sgn(s.r60)}${fmt(s.r60)}%</b>
    <span style="color:var(--ink3);font-size:11px;margin-left:2px">/60D</span>
  </span>`).join('');

/* 五风格走势图 + 窗口切换 */
function renderStyle(w) {
  const series = DATA.citics_styles.map(s => {
    let hist = s.hist;
    if (w > 0) hist = hist.slice(-(w + 1));
    const base = hist[0][1];
    return { name:s.name, type:'line', showSymbol:false, lineStyle:{width:1.8},
      itemStyle:{color:SCOLORS[s.name]},
      data: hist.map(h => [h[0], +(h[1]/base*100).toFixed(2)]) };
  });
  const opt = {
    grid:{left:40,right:16,top:30,bottom:46},
    tooltip:{...TIP, trigger:'axis', formatter: ps => ps[0].value[0].slice(0,10).replace(/-/g,'/') + '<br>' +
      ps.map(p=>`${p.marker}${p.seriesName} <b>${fmt(p.value[1],1)}</b>`).join('<br>')},
    legend:{top:0,textStyle:{color:TH().text,fontSize:11},itemWidth:16,itemHeight:2},
    xAxis:{type:'time',...AX,axisLabel:{color:TH().sub,fontSize:10,formatter:v=>echarts.time.format(v,'{MM}/{yy}',false)}},
    yAxis:{type:'value',...AX,scale:true},
    series };
  if (!styleChart) styleChart = mk('ch-style', opt);
  else styleChart.setOption(opt, true);
}
renderStyle(0);
renderParticipants(DATA.participants);
$('style-tabs').addEventListener('click', e => {
  if (!e.target.dataset.w) return;
  document.querySelectorAll('#style-tabs .wtab').forEach(b => b.classList.remove('on'));
  e.target.classList.add('on');
  renderStyle(+e.target.dataset.w);
});


/* ── ⑪ 市场参与者分析 ── */
function renderParticipants(P) {
  if (!P) return;
  $('p-cards').innerHTML = P.cards.map(c => `
    <div class="p-card">
      <div class="p-head"><b>${c.name}</b><span class="p-state ${c.cls}">${c.state}</span></div>
      <div class="p-role">${c.role}</div>
      <div class="p-metrics">${c.metrics.map(m => `<div><span>${m[0]}</span><b>${m[1]}</b></div>`).join('')}</div>
      <div class="p-note">${c.note}</div>
    </div>`).join('');

  const t = TH();
  const C = P.chart, E = P.external;
  mk('ch-part', {
    tooltip: {trigger:'axis', ...TIP, formatter: ps => ps.filter(p=>p.value!=null).map(p =>
      `${p.marker}${p.seriesName}: <b>${p.value==null?'—':p.seriesName==='沪深300(归一)'?p.value.toFixed(1):p.value.toFixed(2)+'%'}</b>`).join('<br>')},
    legend:{top:0,textStyle:{color:t.text,fontSize:11},itemWidth:16,itemHeight:2},
    grid:{left:46,right:50,top:30,bottom:24},
    xAxis:{type:'category',data:C.dates,...AX,axisLabel:{...AX.axisLabel,formatter:v=>v.slice(2,7)}},
    yAxis:[{type:'value',scale:true,...AX,name:'归一',nameTextStyle:{color:t.sub}},
           {type:'value',...AX,name:'%',nameTextStyle:{color:t.sub}}],
    series:[
      {name:'沪深300(归一)',type:'line',data:C.market,yAxisIndex:0,showSymbol:false,
       lineStyle:{width:1.6,color:t.ink},itemStyle:{color:t.ink},
       areaStyle:{color:t.goldA}},
      {name:'红利超额(保险)',type:'line',data:C.div_excess,yAxisIndex:1,showSymbol:false,
       lineStyle:{width:1.4,color:t.gold},itemStyle:{color:t.gold}},
      {name:'小盘超额(量化)',type:'line',data:C.small_excess,yAxisIndex:1,showSymbol:false,
       lineStyle:{width:1.4,color:t.accent},itemStyle:{color:t.accent}},
      {name:'融资余额变动(杠杆)',type:'line',data:C.margin_chg,yAxisIndex:1,showSymbol:false,
       lineStyle:{width:1.4,color:t.up,type:'solid'},itemStyle:{color:t.up}}
    ]
  });
  mk('ch-ext', {
    tooltip:{trigger:'axis',...TIP},
    legend:{top:0,textStyle:{color:t.text,fontSize:11},itemWidth:16,itemHeight:2},
    grid:{left:46,right:52,top:28,bottom:24},
    xAxis:{type:'category',data:E.dates,...AX,axisLabel:{...AX.axisLabel,formatter:v=>v.slice(2,7)}},
    yAxis:[{type:'value',scale:true,...AX,name:'US10Y %',nameTextStyle:{color:t.sub}},
           {type:'value',...AX,name:'CNY %',nameTextStyle:{color:t.sub}}],
    series:[
      {name:'美债10Y(%)',type:'line',data:E.us10y,yAxisIndex:0,showSymbol:false,
       lineStyle:{width:1.5,color:t.up},itemStyle:{color:t.up}},
      {name:'人民币20日变动(%)',type:'line',data:E.usdcny_chg,yAxisIndex:1,showSymbol:false,
       lineStyle:{width:1.4,color:t.gold},itemStyle:{color:t.gold},
       markLine:{symbol:'none',silent:true,data:[{yAxis:0}],lineStyle:{color:t.mark,type:'dashed'}}}
    ]
  });

  $('attr-table').innerHTML = '<thead><tr><th>时期</th><th>阶段</th><th>主导参与者</th><th>证据</th><th>市场表现</th></tr></thead><tbody>' +
    P.attribution.map(a => `<tr><td>${a.period}</td><td>${a.title}</td><td class="aw">${a.who}</td><td>${a.evidence}</td><td>${a.move}</td></tr>`).join('') + '</tbody>';
  $('p-concl-b').textContent = P.conclusion;
}

/* 信号箱 */
$('sig-title').textContent = `🔍 风格信号：${DATA.style_regime.regime}`;
$('sig-body').innerHTML = `${DATA.style_regime.conclusion}<br>方法说明：${DATA.style_regime.report[1].body} 每日收盘后按 30/60 日窗口重排，本次更新至 ${DATA.date_display || DATA.date}。`;

/* 五风格评价卡 */
const evalText = s => {
  const parts = [];
  if (s.r60 > 3) parts.push(`中期强势，60日${sgn(s.r60)}${fmt(s.r60)}%，趋势资金的主要根据地`);
  else if (s.r60 < -10) parts.push(`中期深度回撤（60日${fmt(s.r60)}%），处于风格劣势端`);
  else parts.push(`中期表现平淡（60日${sgn(s.r60)}${fmt(s.r60)}%）`);
  if (s.r5 > 1) parts.push(`短线动能向上（5日+${fmt(s.r5)}%）`);
  else if (s.r5 < -1) parts.push(`短线仍在走弱（5日${fmt(s.r5)}%）`);
  else parts.push(`短线企稳`);
  return parts.join('；') + '。';
};
$('style-evals').innerHTML = DATA.citics_styles.map(s => `
  <div class="card" style="border-top:3px solid ${SCOLORS[s.name]}">
    <div class="k"><span style="font-weight:600;color:var(--ink)">${s.name}</span></div>
    <div class="mini" style="color:var(--ink2);font-size:12px;margin-top:6px">${evalText(s)}</div>
  </div>`).join('');

/* 轮动矩阵 */
const periods = [['r5','5D'],['r20','20D'],['r60','60D'],['ry','1Y']];
let mh = '<tr><th>风格 \\ 周期</th>' + periods.map(p=>`<th>${p[1]}</th>`).join('') + '</tr>';
rank.forEach(s => {
  mh += `<tr><td style="border-left:3px solid ${SCOLORS[s.name]}">${s.name}</td>`;
  periods.forEach(p => {
    const v = s[p[0]], a = Math.min(Math.abs(v)/20,1)*0.55+0.08;
    const bg = v>0 ? `rgba(212,76,71,${a})` : `rgba(15,123,108,${a})`;
    mh += `<td style="background:${bg};color:#fff;font-weight:600">${sgn(v)}${fmt(v)}%</td>`;
  });
  mh += '</tr>';
});
$('style-matrix').innerHTML = mh;

/* 价差与拥挤度 */
const S = Object.fromEntries(DATA.citics_styles.map(s=>[s.name,s]));
const spreads = [
  {k:'金融 − 成长（60D 价差）', v:S['金融'].r60 - S['成长'].r60, s:'风格分化极端值，历史高位区间，注意均值回归风险'},
  {k:'稳定 − 成长（60D 价差）', v:S['稳定'].r60 - S['成长'].r60, s:'防御风格相对成长的溢价仍在走阔'},
  {k:'消费 − 周期（60D 价差）', v:S['消费'].r60 - S['周期'].r60, s:'内需端相对顺周期占优，反映盈利预期分化'},
];
const disp5 = Math.max(...DATA.citics_styles.map(s=>s.r5)) - Math.min(...DATA.citics_styles.map(s=>s.r5));
const disp20 = Math.max(...DATA.citics_styles.map(s=>s.r20)) - Math.min(...DATA.citics_styles.map(s=>s.r20));
spreads.push({k:'五风格 5D 动量离散度', v:disp5, s: disp5>disp20 ? '短线风格分歧加大→轮动加速，忌单边追高' : '短线风格趋同→主线收敛'});
spreads.push({k:'五风格 20D 动量离散度', v:disp20, s:'中期分化明显，风格选择的重要性高于行业选择'});
$('spreads').innerHTML = spreads.map(x => `
  <div class="spread-card">
    <div class="sk">${x.k}</div>
    <div class="sv num" style="color:${x.v>=0?'var(--up)':'var(--down)'}">${sgn(x.v)}${fmt(x.v)} <span style="font-size:12px;color:var(--ink3)">pct</span></div>
    <div class="ss">${x.s}</div>
  </div>`).join('');

/* ── ⑥ 北向 ── */
$('nb-sh').innerHTML = (DATA.northbound.top_sh || []).length
  ? DATA.northbound.top_sh.map((x,i)=>`${i+1}. <b>${x[0]}</b> <span class="num" style="color:var(--ink2)">${fmt(x[1])} 亿</span>`).join('<br>')
  : '<span style="color:var(--ink3)">当日成交前三盘后未披露</span>';
$('nb-sz').innerHTML = (DATA.northbound.top_sz || []).length
  ? DATA.northbound.top_sz.map((x,i)=>`${i+1}. <b>${x[0]}</b> <span class="num" style="color:var(--ink2)">${fmt(x[1])} 亿</span>`).join('<br>')
  : '<span style="color:var(--ink3)">当日成交前三盘后未披露</span>';
const NB = DATA.northbound;
mk('ch-north', {
  grid:{left:52,right:52,top:26,bottom:26},
  tooltip:{...TIP, trigger:'axis', formatter: ps => `${ps[0].name}<br>` + ps.map(p=>`${p.marker}${p.seriesName} <b>${p.seriesName==='占比'?fmt(p.value)+'%':fmt(p.value)+' 亿'}</b>`).join('<br>')},
  legend:{top:0,textStyle:{color:TH().text,fontSize:11},itemWidth:16,itemHeight:2},
  xAxis:{type:'category',data:NB.days.map(d=>d.date),...AX},
  yAxis:[{type:'value',name:'亿元',nameTextStyle:{color:TH().sub},...AX},
         {type:'value',name:'占比%',nameTextStyle:{color:TH().sub},...AX,splitLine:{show:false},min:12,max:18}],
  series:[
    {name:'北向成交额',type:'bar',barWidth:30,data:NB.days.map(d=>d.amt),
     itemStyle:{color:TH().gold,opacity:.75}},
    {name:'占比',type:'line',yAxisIndex:1,data:NB.days.map(d=>d.ratio),
     lineStyle:{width:2,color:TH().accent},itemStyle:{color:TH().accent},symbolSize:6}
  ]
});

/* ═══════════ v2 新增模块渲染 ═══════════ */

/* ── ① 成交额一年分位 ── */
const TP = DATA.turnover_pct;
$('tp-today').textContent = TP.today.toLocaleString() + ' 亿元';
$('tp-pct').textContent = TP.percentile + '%';
$('tp-med').textContent = TP.median.toLocaleString();
$('tp-p90').textContent = TP.p90.toLocaleString();
$('tp-ma20').textContent = TP.ma20.toLocaleString();
const badge = $('tp-badge');
badge.textContent = TP.percentile >= 80 ? '高位放量' : (TP.percentile <= 20 ? '低位缩量' : '中性区间');
badge.className = 'num ' + (TP.percentile >= 80 ? 'up' : (TP.percentile <= 20 ? 'down' : 'flat'));
$('tp-note').textContent = `今日成交额处于过去一年 ${TP.percentile <= 20 ? '偏低' : (TP.percentile >= 80 ? '偏高' : '中游')}水平（${TP.percentile}% 分位）：较一年中位数 ${TP.median.toLocaleString()} 亿 ${TP.today > TP.median ? '高' : '低'} ${Math.abs(TP.today - TP.median).toLocaleString()} 亿，较 20 日均值 ${TP.ma20.toLocaleString()} 亿 ${TP.today > TP.ma20 ? '放量' : '缩量'} ${Math.abs(Math.round((TP.today / TP.ma20 - 1) * 100))}%。`;

mk('ch-turnover', {
  grid:{left:46,right:14,top:14,bottom:20},
  tooltip:{...TIP, trigger:'axis', formatter: ps => ps.map(p => `${p.name}<br>${p.seriesName} <b>${p.value.toLocaleString()}</b> 亿`).join('<br>')},
  xAxis:{type:'category',data:TP.hist.map(h=>h[0]),...AX,axisLabel:{...AX.axisLabel,interval:48}},
  yAxis:{type:'value',name:'亿元',nameTextStyle:{color:TH().sub},...AX},
  series:[
    {name:'成交额',type:'line',data:TP.hist.map(h=>h[1]),showSymbol:false,
     lineStyle:{width:1.2,color:TH().gold},areaStyle:{color:TH().goldA}},
    {name:'中位数',type:'line',data:TP.hist.map(()=>TP.median),showSymbol:false,
     lineStyle:{width:1,color:TH().sub,type:'dashed'},tooltip:{show:false}},
    {name:'今日',type:'scatter',data:[[TP.hist.length-1, TP.today]],symbolSize:7,
     itemStyle:{color:TH().up},tooltip:{formatter:() => `10/09 成交额 <b>${TP.today.toLocaleString()}</b> 亿（${TP.percentile}% 分位）`}}
  ]
});

/* ── ③ 近5日行业滚动热力图 ── */
const H5 = DATA.sw_heat_5d;
const streakMap = {};
DATA.ths_cont.forEach(c => { streakMap[c.name] = c; });
// 申万行业名 → 同花顺近似行业的连续性点(映射表: 手工核心映射 + 其余用涨跌连续性)
const SW2THS = {'农林牧渔':'种植业与林业','煤炭':'煤炭开采','石油石化':'石油开采','有色金属':'工业金属','电力设备':'电池','机械设备':'工程机械','国防军工':'航天装备','汽车':'汽车整车','家用电器':'白色家电','食品饮料':'饮料制造','纺织服饰':'服装家纺','轻工制造':'家居用品','医药生物':'化学制药','公用事业':'电力','交通运输':'航运港口','房地产':'房地产开发','商贸零售':'一般零售','社会服务':'旅游零售','计算机':'软件开发','传媒':'影视院线','通信':'通信服务','银行':'国有大型银行','非银金融':'证券','电子':'半导体','建筑材料':'水泥','建筑装饰':'基础建设','基础化工':'化学制品','钢铁':'普钢','环保':'环保','美容护理':'化妆品','综合':'综合'};
const hmData = [];
H5.rows.forEach((row, yi) => {
  row.days.forEach((v, xi) => hmData.push([xi, yi, v]));
});
mk('ch-sw5d', {
  grid:{left:150,right:90,top:8,bottom:44},
  tooltip:{...TIP, formatter: p => {
    const row = H5.rows[p.data[1]];
    const st = streakMap[SW2THS[row.name]];
    let s = `${row.name} · ${H5.dates[p.data[0]]}<br>当日涨跌 <b>${sgn(p.data[2])}${fmt(p.data[2])}%</b>`;
    s += `<br>5日累计 <b>${sgn(row.d5)}${fmt(row.d5)}%</b> · 今日主力 ${row.flow >= 0 ? '+' : ''}${row.flow} 亿`;
    if (st) s += `<br>THS资金连续性: 今日${st.d1>0?'+':''}${st.d1} / 3日${st.d3>0?'+':''}${st.d3} / 5日${st.d5>0?'+':''}${st.d5} 亿`;
    return s;
  }},
  xAxis:{type:'category',data:H5.dates,...AX,position:'top',axisLabel:{color:TH().text,fontSize:11.5}},
  yAxis:{type:'category',data:H5.rows.map(r => {
    const st = streakMap[SW2THS[r.name]];
    const dots = st && st.streak !== 0 ? ` ${st.streak > 0 ? '●'.repeat(Math.abs(st.streak)) : '○'.repeat(Math.abs(st.streak))}` : '';
    return r.name + dots;
  }),axisLine:{show:false},axisTick:{show:false},
    axisLabel:{color:TH().ink,fontSize:11.5,margin:8,
      formatter: v => v, rich:{}}},
  visualMap:{min:-3,max:3,calculable:false,orient:'vertical',right:0,top:'center',itemHeight:90,
    inRange:{color:[TH().down,TH().hm[0],TH().hm[1],TH().hm[2],TH().up]},
    textStyle:{color:TH().sub,fontSize:10}},
  series:[{type:'heatmap',data:hmData,label:{show:true,fontSize:10,color:TH().ink,
    formatter: p => (p.data[2] > 0 ? '+' : '') + p.data[2].toFixed(1)},
    itemStyle:{borderColor:TH().bubble,borderWidth:1.5},emphasis:{itemStyle:{shadowBlur:4,shadowColor:'rgba(0,0,0,.2)'}}}]
});
// 右侧 5日累计 标签(rich text 不支持 per-item 颜色,改为图表标题下加说明 + tooltip)
// 连续性圆点已在 y 轴标签: ●=连续净流入, ○=连续净流出

const rowHTML = c => `<div class="row"><span class="nm">${c.name}</span><span class="dots ${c.streak>0?'up':'down'}">${c.streak>0?'●'.repeat(c.streak):'○'.repeat(-c.streak)}</span><span class="val ${c.d1>=0?'up':'down'}">${sgn(c.d1)}${fmt(c.d1,1)}</span><span class="sub">3日 ${sgn(c.d3)}${fmt(c.d3,1)} · 5日 ${sgn(c.d5)}${fmt(c.d5,1)}</span></div>`;
$('ths-in').innerHTML = DATA.ths_cont.filter(c => c.streak >= 2).sort((a,b)=>b.d3-a.d3).slice(0,8).map(rowHTML).join('');
$('ths-out').innerHTML = DATA.ths_cont.filter(c => c.streak <= -2).sort((a,b)=>a.d3-b.d3).slice(0,8).map(rowHTML).join('');

/* ── ⑧ 概念四象限 ── */
const CM = DATA.concept_matrix;
const conceptSize = v => Math.max(8, Math.min(30, 8 + Math.abs(v) * 0.9));
// 仅标注重点概念: 今日涨幅前10 或 净额绝对值前6, 其余悬停查看
const showNames = new Set([
  ...[...CM].sort((a,b)=>b.today-a.today).slice(0,10).map(c=>c.name),
  ...[...CM].sort((a,b)=>Math.abs(b.flow||0)-Math.abs(a.flow||0)).slice(0,6).map(c=>c.name)
]);
mk('ch-concept', {
  grid:{left:50,right:20,top:30,bottom:40},
  tooltip:{...TIP, formatter: p => {
    const d = p.data[2];
    return `<b>${d.name}</b><br>今日 <b>${sgn(d.today)}${fmt(d.today)}%</b> · 昨日 ${sgn(d.yest)}${fmt(d.yest)}%<br>5日累计 ${sgn(d.d5)}${fmt(d.d5)}% · 今日净额 ${d.flow != null ? sgn(d.flow) + fmt(d.flow,1) + ' 亿' : '—'}`;
  }},
  xAxis:{type:'value',name:'昨日涨跌 %',nameLocation:'middle',nameGap:24,nameTextStyle:{color:TH().text},...AX,splitLine:{show:true,lineStyle:{color:TH().split2}}},
  yAxis:{type:'value',name:'今日涨跌 %',...AX},
  series:[{type:'scatter',
    data:CM.map(c => ({value:[c.yest, c.today, c], name:c.name,
      symbolSize:conceptSize(c.flow || 2),
      itemStyle:{color: c.today >= 0 ? TH().upA : TH().downA, borderColor:TH().bubble,borderWidth:1}})),
    label:{show:true,position:'top',fontSize:10.5,color:TH().clab,
      formatter:p => showNames.has(p.data.name) ? p.data.name : '',
      labelLayout:{hideOverlap:true, moveOverlap:'shiftY'}},
    markLine:{symbol:'none',silent:true,lineStyle:{color:TH().mark,type:'dashed'},
      label:{show:false},data:[{xAxis:0},{yAxis:0}]},
    markArea:{silent:true,itemStyle:{color:'rgba(0,0,0,0)'},
      label:{show:true,position:'inside',color:TH().quad,fontSize:11,fontWeight:500},
      data:[[{name:'↗ 延续强化',xAxis:0,yAxis:0},{xAxis:'max',yAxis:'max'}],
            [{name:'逆势反转 ↖',xAxis:'min',yAxis:0},{xAxis:0,yAxis:'max'}],
            [{name:'退潮 ↘',xAxis:0,yAxis:'min'},{xAxis:'max',yAxis:0}],
            [{name:'持续走弱 ↙',xAxis:'min',yAxis:'min'},{xAxis:0,yAxis:0}]]}
  }]
});

/* ── ⑨ 涨停池 / 两融 / ETF ── */
const LP = DATA.limit_pool;
const zc = (n, sub) => `<div class="card"><div class="k"><span>${sub}</span></div><div class="v num">${n}</div></div>`;
$('zt-cards').innerHTML =
  `<div class="card"><div class="k"><span>涨停家数</span></div><div class="v num up">${LP.zt_count}</div><div class="mini">真实涨停（交易所口径）</div></div>` +
  `<div class="card"><div class="k"><span>跌停家数</span></div><div class="v num down">${LP.dt_count}</div><div class="mini">${LP.dt_names.slice(0,4).join('、')}${LP.dt_names.length>4?' 等':''}</div></div>` +
  `<div class="card"><div class="k"><span>最高连板</span></div><div class="v num">${LP.max_lb}<span style="font-size:14px;color:var(--ink3)"> 板</span></div><div class="mini">${LP.max_lb_stock} · 空间板</div></div>` +
  `<div class="card"><div class="k"><span>炸板反复</span></div><div class="v num">${LP.zhaban_touched}<span style="font-size:14px;color:var(--ink3)"> 家</span></div><div class="mini">盘中开板 ${LP.zhaban_total} 次</div></div>`;

const lbEntries = Object.entries(LP.lb_dist).sort((a,b)=>b[0]-a[0]);
$('lb-ladder').innerHTML = lbEntries.map(([k,v]) =>
  `<div class="lb-item"><div class="n ${k==LP.max_lb?'up':''}">${k}板</div><div class="t">${v} 家</div></div>`).join('') +
  `<div class="lb-item"><div class="n" style="font-size:14px;line-height:26px">首板</div><div class="t">${LP.zt_count - Object.values(LP.lb_dist).reduce((a,b)=>a+b,0)} 家</div></div>`;

$('zt-ind-chips').innerHTML = '涨停行业分布：' + Object.entries(LP.zt_industry_top).map(([k,v]) =>
  `<span class="chip" style="margin:2px 4px 2px 0;display:inline-block">${k} ${v}</span>`).join('');

$('seal-stats').innerHTML = [
  `<div class="row"><span class="nm">早盘封板（10:30 前）</span><span class="val">${LP.seal_early} 家</span><span class="sub">占 ${Math.round(LP.seal_early/LP.zt_count*100)}%</span></div>`,
  `<div class="row"><span class="nm">午后封板（13:00 后）</span><span class="val">${LP.seal_afternoon} 家</span><span class="sub">占 ${Math.round(LP.seal_afternoon/LP.zt_count*100)}%</span></div>`,
  `<div class="row"><span class="nm">封板后炸板复封</span><span class="val">${LP.zhaban_touched} 家</span><span class="sub">共 ${LP.zhaban_total} 次</span></div>`,
  `<div class="row"><span class="nm">跌停名单</span><span class="val">${LP.dt_count} 家</span><span class="sub">${LP.dt_names.join('、')||'—'}</span></div>`
].join('');

const MG = DATA.margin;
mk('ch-margin', {
  grid:{left:52,right:14,top:14,bottom:22},
  tooltip:{...TIP, trigger:'axis', formatter: ps => ps.map(p => `${p.seriesName} <b>${p.value.toLocaleString()}</b> 亿`).join('<br>')},
  legend:{top:0,textStyle:{color:TH().text,fontSize:11},itemWidth:14,itemHeight:8},
  xAxis:{type:'category',data:MG.series.map(s=>s.date),...AX},
  yAxis:{type:'value',...AX,min:v=>Math.floor(v.min*0.98)},
  series:[
    {name:'沪市',type:'bar',stack:'m',barWidth:26,data:MG.series.map(s=>s.sse),itemStyle:{color:'#c8b89a',opacity:.85}},
    {name:'深市',type:'bar',stack:'m',data:MG.series.map(s=>s.szse),itemStyle:{color:TH().gold,opacity:.85}},
    {name:'合计',type:'line',data:MG.series.map(s=>s.total),lineStyle:{width:2,color:TH().ink},itemStyle:{color:TH().ink},symbolSize:5}
  ]
});
$('mg-note').textContent = `最新合计约 ${(MG.today_total/1e4).toFixed(2)} 万亿（${MG.note}）；${MG.delta != null ? '较上一完整交易日' + (MG.delta >= 0 ? '增加 ' : '减少 ') + Math.abs(MG.delta).toLocaleString() + ' 亿' : ''}。`;

$('etf-list').innerHTML = DATA.etf_top.map(e =>
  `<div class="row"><span class="nm">${e.name}</span><span class="val ${e.pct>=0?'up':'down'}">${sgn(e.pct)}${fmt(e.pct)}%</span><span class="sub">${e.amt} 亿</span></div>`).join('');

console.log('dashboard rendered');

}

/* ── 快照懒加载与导航 ── */
let META = null, CUR = null;
const fetchJSON = u => fetch(u, {cache: 'no-store'}).then(r => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});
const fmtDate = d => d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;

async function loadDate(d, push = true) {
  $('db-status').textContent = '加载中…';
  try {
    const snap = await fetchJSON(`data/snapshots/${d}.json`);
    CUR = d;
    renderAll(snap);
    $('date-sel').value = d;
    const i = META.dates.indexOf(d);
    $('nav-prev').disabled = i >= META.dates.length - 1;
    $('nav-next').disabled = i <= 0;
    $('db-status').textContent = `快照 ${fmtDate(d)} · 共 ${META.dates.length} 个交易日`;
    if (push && location.hash !== '#' + d) history.replaceState(null, '', '#' + d);
    window.scrollTo({top: 0});
  } catch (e) {
    $('db-status').textContent = '加载失败：' + e.message + '（若以 file:// 打开请改用本地服务器或 GitHub Pages）';
  }
}

/* ── 主题控制 ── */
(function initTheme() {
  const cur = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const btn = $('themeBtn');
  if (btn) btn.textContent = cur === 'dark' ? '☀️ 日间' : '🌙 夜间';
  btn.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
  /* 嵌入工作站时跟随父站主题切换 */
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'ashare-theme' && (e.data.theme === 'dark' || e.data.theme === 'light'))
      applyTheme(e.data.theme, false);
  });
})();

(async function boot() {
  try {
    META = await fetchJSON('data/dashboard-meta.json');
  } catch (e) {
    $('db-status').textContent = 'meta 加载失败：需通过 HTTP 访问（如 python -m http.server）';
    return;
  }
  $('date-sel').innerHTML = META.dates.map(d => `<option value="${d}">${fmtDate(d)}</option>`).join('');
  $('date-sel').onchange = e => loadDate(e.target.value);
  $('nav-prev').onclick = () => { const i = META.dates.indexOf(CUR); if (i < META.dates.length - 1) loadDate(META.dates[i + 1]); };
  $('nav-next').onclick = () => { const i = META.dates.indexOf(CUR); if (i > 0) loadDate(META.dates[i - 1]); };
  $('nav-latest').onclick = () => loadDate(META.dates[0]);
  const h = location.hash.replace('#', '');
  await loadDate(META.dates.includes(h) ? h : META.dates[0], false);
})();
