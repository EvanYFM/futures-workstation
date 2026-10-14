(function (root) {
  const ALLOWED_SYMBOLS = new Set(["SC", "AU", "AG"]);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const finite = (value) => typeof value === "number" && Number.isFinite(value);
  const scoreNumber = (value) => finite(value) && value >= -100 && value <= 100 ? value : null;
  const coverageNumber = (value) => finite(value) && value >= 0 && value <= 100 ? value : null;
  const symbolOf = (value) => String(value || "").trim().toUpperCase();
  const contractOf = (value) => String(value || "").trim().toUpperCase();

  function snapshotContract(snapshot, symbol) {
    const instrument = (snapshot?.instruments || []).find((item) => symbolOf(item?.symbol) === symbol);
    return contractOf(instrument?.quote?.contract || instrument?.contract);
  }

  function selectObservation(data, snapshot, snapshotDate, symbol) {
    const normalizedSymbol = symbolOf(symbol);
    if (!ALLOWED_SYMBOLS.has(normalizedSymbol)) return {status: "not_available", reason: "该品种未纳入技术观察样本。"};
    const contract = snapshotContract(snapshot, normalizedSymbol);
    if (!contract) return {status: "pending", reason: "当前快照缺少主力合约，技术观察待核对。"};
    const observation = (data?.observations || []).find((item) => symbolOf(item?.symbol) === normalizedSymbol && String(item?.asOf || "") === String(snapshotDate || "") && contractOf(item?.contract) === contract);
    if (!observation) return {status: "pending", reason: "当前日期或主力合约没有匹配的技术观察。"};
    return {status: "ready", observation, contract};
  }

  function chartSvg(bars, asOf) {
    const asOfDate = /^\d{8}$/.test(String(asOf)) ? `${String(asOf).slice(0, 4)}-${String(asOf).slice(4, 6)}-${String(asOf).slice(6)}` : "";
    const sourceBars = Array.isArray(bars) ? bars : [];
    const safeBars = sourceBars.filter((bar, index) => {
      const values = [bar?.open, bar?.high, bar?.low, bar?.close];
      const previous = sourceBars[index - 1]?.date;
      return /^\d{4}-\d{2}-\d{2}$/.test(String(bar?.date || "")) && String(bar.date) <= asOfDate
        && (!previous || String(previous) < String(bar.date)) && values.every(finite)
        && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close, bar.high);
    });
    if (safeBars.length !== sourceBars.length) return "";
    if (safeBars.length < 2) return "";
    const plotBars = safeBars.slice(-24);
    const values = plotBars.flatMap((bar) => [Number(bar.high), Number(bar.low)]);
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const x = (index) => 8 + index * (284 / Math.max(1, plotBars.length - 1));
    const y = (value) => 112 - ((Number(value) - min) / span) * 100;
    return `<svg class="focus-technical-chart" viewBox="0 0 300 120" role="img" aria-label="最近 ${plotBars.length} 根日线收盘走势"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${plotBars.map((bar, index) => `${x(index).toFixed(1)},${y(bar.close).toFixed(1)}`).join(" ")}"/><g stroke="currentColor" opacity=".55">${plotBars.map((bar, index) => `<path d="M${x(index).toFixed(1)} ${y(bar.high).toFixed(1)}V${y(bar.low).toFixed(1)}"/>`).join("")}</g></svg><p>${escapeHtml(plotBars[0].date)} — ${escapeHtml(plotBars[plotBars.length-1].date)} · 收盘线与日内高低范围</p>`;
  }

  function renderTechnicalObservation(data, snapshot, snapshotDate, symbol) {
    const result = selectObservation(data, snapshot, snapshotDate, symbol);
    if (result.status !== "ready") return `<section class="focus-technical"><div class="detail-kicker">TECHNICAL OBSERVATION</div><h4>${escapeHtml(symbolOf(symbol) || "—")} 技术观察</h4><p>${escapeHtml(result.reason)}</p></section>`;
    const item = result.observation;
    const score = scoreNumber(item.score);
    const structureScore = scoreNumber(item.structureScore);
    const volumeScore = scoreNumber(item.volumeScore);
    const coverage = coverageNumber(item.coverage);
    const notes = Array.isArray(item.notes) ? item.notes.filter((note) => typeof note === "string") : [];
    const sourceConflict = item.sourceConflict === true ? `<span class="bear-text">来源存在冲突</span>` : item.sourceConflict === false ? "来源未见冲突" : "未完成来源核对";
    const screenshot = item.screenshot || {};
    const row = (snapshot?.cta || []).find((r) => r.symbol === symbolOf(symbol));
    const applied = item.status === "applied" && row?.technicalEnhancement?.asOf === item.asOf
      && row?.technicalEnhancement?.contract === item.contract && score != null && row?.factors?.trend === Math.round(score);
    const status = applied ? "已更新本日 CTA 趋势因子" : "研究试算 · 未计入总分";
    const screenshotStatus = screenshot.status === "night_incomplete" ? "夜盘进行中 · 末根未完成 · 不参与日盘评分" : "截图时点待核对 · 不参与评分";
    return `<section class="focus-technical"><div class="detail-kicker">重点技术分析</div><div class="focus-technical-head"><div><h4>${escapeHtml(item.symbol)} ${escapeHtml(item.contract)}</h4><small>${status} · ${escapeHtml(item.asOf)}</small></div><div class="focus-technical-score ${score < 0 ? 'bear-text' : score > 0 ? 'bull-text' : 'neutral-text'}">${score == null ? "待校验" : score.toFixed(1)}</div></div><p>${escapeHtml(item.source || "来源待补充")} · 技术内部覆盖 ${coverage == null ? "待核对" : `${coverage}%`} · ${sourceConflict}</p>${chartSvg(item.bars, item.asOf)}<p>结构 ${structureScore == null ? "待校验" : structureScore.toFixed(1)} · 量价 ${volumeScore == null ? "待校验" : volumeScore.toFixed(1)} · 持仓暂停计分</p>${notes.length ? `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : "<p>观察说明待补充。</p>"}<h4>独立截图观察 ${escapeHtml(screenshot.contract || "")}</h4><p>${screenshotStatus}。${escapeHtml(screenshot.capturedAt || "")} ${screenshot.tradingDate ? `交易日 ${escapeHtml(screenshot.tradingDate)}` : ""}</p><p>${escapeHtml(screenshot.summary || "未提供摘要")}</p><details><summary>公式与每天截图清单</summary><p>结构分 = 50% 高低点方向 + 30% 近20日区间位置 + 20% 近20日方向效率。高低点须左右各2根确认；方向效率为净变化除以逐日变化绝对值之和。</p><p>量价分 = 70% 近10日量加权价格推进 + 30% 近5日量加权收盘位置。量权为当日量/此前20日量中位数（上限3）；价格推进除以前14日平均真实波幅并截断到±1；收盘位置=(2收盘−高−低)/(高−低)。</p><p>增强技术分 = (60×结构分 + 25×量价分) / 85；持仓15%因迁仓未排除而省略。外层仍按原CTA权重计算，其他因子不变。公式未经收益回测，不是完整威科夫阶段模型。</p><p>每天共7张：SC、AU、AG各一张日线40–60根、一张60分钟5–10日，共6张；再加1张三品种报价表。注明完整合约、交易日、北京时间、末根是否完成及是否拼接；光标置最后已完成K线。截图不能替代可靠逐根开高低收、成交量和持仓数据，接口缺失时需导出CSV补足。</p></details></section>`;
  }

  root.FocusTechnical = {ALLOWED_SYMBOLS, selectObservation, renderTechnicalObservation};
})(typeof window !== "undefined" ? window : globalThis);
