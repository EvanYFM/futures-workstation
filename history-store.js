/* 历史复盘存储层：三层模型 + 静态导入 + localStorage 迁移
 *
 * 数据模型：
 *   observation — 一次判断/复盘（Excel 每品种行、md 叙述行、工作台决策记录）
 *   trade       — 一笔完整交易（md 表格行，含归因）
 *   tradeEvent  — 一次具体操作（开仓/加仓/减仓/平仓，如 1400开仓 -> 1450加仓）
 *
 * 数据来源与口径（2026-09-01 与用户确认）：
 *   1. data/imported/trading_log_excel.json — 仓位列空 = 仅观察他人策略，未执行；
 *      此类记录的 strategyPnlText 是策略方收益，绝不计入 myPnl。
 *   2. data/imported/monthly_review_md.json — 月度复盘表格与叙述。
 *   3. localStorage futuresResearchDecisions.v1 — 老决策记录，迁移为 observation，
 *      原始数据保留不删（符合 AGENTS.md「自动构建不得覆盖人工记录」）。
 */
const HistoryStore = (() => {
  const DB_NAME = "futuresTradingJournal";
  const DB_VERSION = 1;
  const STORES = {observations: "observations", trades: "trades", events: "tradeEvents", meta: "meta"};

  let db = null;
  let cache = {observations: [], trades: [], narratives: [], months: []};

  /* IndexedDB 在隐私模式、磁盘受限或被其他标签页阻塞时可能既不 resolve 也不 reject。
     不设超时会让 Promise.all 永久挂起、整个工作站停在装载中，因此这里强制超时降级，
     退化为只使用 fetch 到的内存数据，页面照常渲染。 */
  const DB_OPEN_TIMEOUT_MS = 3000;

  function withTimeout(promise, ms, message) {
    let timer = null;
    return Promise.race([
      promise.then((value) => { if (timer) clearTimeout(timer); return value; },
                   (error) => { if (timer) clearTimeout(timer); throw error; }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB 不可用"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      const timer = setTimeout(() => reject(new Error("IndexedDB 打开超时")), DB_OPEN_TIMEOUT_MS);
      const settle = (fn, value) => { clearTimeout(timer); fn(value); };
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORES.observations)) database.createObjectStore(STORES.observations, {keyPath: "id"});
        if (!database.objectStoreNames.contains(STORES.trades)) database.createObjectStore(STORES.trades, {keyPath: "id"});
        if (!database.objectStoreNames.contains(STORES.events)) database.createObjectStore(STORES.events, {keyPath: "id"});
        if (!database.objectStoreNames.contains(STORES.meta)) database.createObjectStore(STORES.meta, {keyPath: "key"});
      };
      request.onsuccess = () => settle(resolve, request.result);
      request.onerror = () => settle(reject, request.error || new Error("IndexedDB 打开失败"));
      request.onblocked = () => settle(reject, new Error("IndexedDB 被其他标签页阻塞"));
    });
  }

  function putMany(storeName, items) {
    return new Promise((resolve, reject) => {
      if (!db || !items.length) return resolve();
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      if (!db) return resolve([]);
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function getMeta(key) {
    return new Promise((resolve) => {
      if (!db) return resolve(null);
      const request = db.transaction(STORES.meta, "readonly").objectStore(STORES.meta).get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => resolve(null);
    });
  }

  function setMeta(key, value) {
    return putMany(STORES.meta, [{key, value}]);
  }

  /* 老决策记录（localStorage futuresResearchDecisions.v1）→ observation 迁移。
     2026-09-16 重设计：全字段映射 + 生命周期状态（已平仓→published 归档，
     持仓/未交易→draft 进行中）。不设 updated（=0），已存在的同 id 记录
     （如曾经 syncDecisionToHistory 写过的）不会被覆盖；原始 localStorage 不删。 */
  function migrateLocalStorageDecisions() {
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem("futuresResearchDecisions.v1") || "[]"); }
    catch { legacy = []; }
    if (!legacy.length) return [];
    return legacy.map((record) => ({
      id: `ws-${record.id}`,
      source: "工作台决策",
      kind: "observation",
      date: record.reportDate ? `${record.reportDate.slice(0, 4)}-${record.reportDate.slice(4, 6)}-${record.reportDate.slice(6, 8)}` : "",
      variety: record.variety || "",
      symbol: record.symbol || "",
      contract: null,
      strike: null,
      instrumentType: null,
      optionType: null,
      moneyness: null,
      direction: record.direction || null,
      strategySource: "自己",
      executed: record.tradeStatus !== "no_trade",
      tradeStatus: record.tradeStatus || "no_trade",
      status: record.tradeStatus === "closed" ? "published" : "draft",
      positionPct: record.positionPct || "",
      myPnl: record.pnl === "" || record.pnl == null ? null : record.pnl,
      pnlRatio: null,
      strategyPnlText: "",
      choice: record.choice || "",
      noTradeReason: record.noTradeReason || "",
      stopLossTakeProfit: record.invalidation || "",
      trigger: record.trigger || "",
      mainContradiction: record.mainContradiction || "",
      closeNote: record.closeNote || "",
      reviewNote: record.reviewNote || "",
      selfInquiry: record.selfInquiry || "",
      attribution: record.attribution || {},
      review: [record.mainContradiction, record.closeNote, record.reviewNote, record.selfInquiry ? `自我问答：${record.selfInquiry}` : ""].filter(Boolean).join("\n"),
      ratings: {},
      amountSignal: record.amountSignal, handsSignal: record.handsSignal,
      close: record.close ?? null, changePct: record.changePct ?? null,
      trend: record.trend || "", brokerRanking: record.brokerRanking,
      createdAt: record.createdAt || "",
      raw: "",
    }));
  }

  function normalizeExcelObservation(item) {
    return {
      id: item.id, source: "交易日志Excel", kind: "observation",
      date: item.date || "", dateNote: item.dateNote || "",
      variety: item.variety, symbol: item.symbol,
      contract: item.contract || null, strike: item.strike || null,
      instrumentType: item.instrumentType, optionType: item.optionType,
      moneyness: item.moneyness || null, direction: item.direction,
      lots: item.lots, strategySource: item.strategySource,
      executed: item.executed,
      position: item.position, myPnl: item.myPnl, pnlRatio: item.pnlRatio,
      strategyPnlText: item.strategyPnlText || "",
      batchFlag: item.isBatchSplit || false,
      batchPosition: item.batchPosition || "", batchPnl: item.batchPnl || "",
      ratings: item.ratings || {},
      technical: item.technical || "", fundamental: item.fundamental || "",
      capital: item.capital || "", policy: item.policy || "", sentiment: item.sentiment || "",
      cognitiveBias: item.cognitiveBias || "",
      overall: item.overall || "",
      strategy: item.strategy || "", stopLossTakeProfit: item.stopLossTakeProfit || "",
      review: item.review || "",
      raw: "",
    };
  }

  function normalizeMdTrade(trade) {
    return {
      id: trade.id, source: "月度复盘md", kind: "trade",
      date: trade.month ? `${trade.month}-01` : "",
      month: trade.month || "",
      variety: trade.variety || "", symbol: trade.symbol || "",
      contract: trade.contract || null, strike: trade.strike || null,
      instrumentType: trade.instrumentType, optionType: trade.optionType,
      moneyness: trade.moneyness || null, direction: trade.direction,
      strategySource: "自己",
      executed: true,
      myPnl: trade.pnl, pnlText: trade.pnlText || "",
      attribution: trade.attribution || {},
      events: (trade.events || []).map((event, index) => ({
        id: `${trade.id}-e${index + 1}`, tradeId: trade.id,
        type: event.type, action: event.action,
        price: event.price, note: event.note,
      })),
      raw: trade.raw || "",
    };
  }

  function normalizeMdNarrative(item) {
    return {
      id: item.id, source: "月度复盘md", kind: "narrative",
      date: item.date || (item.month ? `${item.month}-01` : ""),
      month: item.month || "",
      variety: item.variety || "", symbol: item.symbol || "",
      myPnl: item.pnl, pnlText: item.pnlText || "",
      strategySource: "自己", executed: item.pnl != null,
      text: item.text || "",
      raw: "",
    };
  }

  async function fetchJson(path) {
    const response = await fetch(path, {cache: "no-cache"});
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  /* 静态导入源首次落库；已在 meta 标记的源跳过，避免重复导入 */
  async function importStaticSource(name, path, normalizer, listKey) {
    const mark = await getMeta(`import:${name}`);
    if (mark) return mark;
    const payload = await fetchJson(path);
    const items = (payload[listKey] || []).map(normalizer);
    await putMany(STORES.observations, items.filter((item) => item.kind === "observation" || item.kind === "narrative"));
    await putMany(STORES.trades, items.filter((item) => item.kind === "trade"));
    await putMany(STORES.events, items.flatMap((item) => item.events || []));
    await setMeta(`import:${name}`, {count: items.length, at: new Date().toISOString()});
    return {count: items.length, at: new Date().toISOString()};
  }

  async function init() {
    let months = [];
    const errors = [];
    try { db = await openDb(); }
    catch (error) { errors.push(`IndexedDB：${error.message}`); }

    let excelItems = [];
    let mdTrades = [];
    let mdNarratives = [];
    let userItems = [];
    /* 静态导入文件（Excel/md/user_journal）只存在于本地开发环境；公开站点上
       个人数据被排除出部署仓，404 是正常态，静默处理。个人数据的主存储是
       私有数据仓（futures-journal-data/journal.json），由首屏后的 pushToCloud
       异步并入（见 app.js 启动尾部），不阻塞首屏渲染。
       三个探测并行发起（原来串行，国内到 github.io 单 RTT 0.5~2s，串行白等 3 倍）。 */
    const silent404 = (label) => (error) => {
      if (!/HTTP 404/.test(String(error.message || ""))) errors.push(`${label}：${error.message}`);
    };
    /* 公开站点上这三个文件必然 404（部署仓已排除 imported/，check_public_artifacts.py
       主动拒绝），连请求都不必发：国内到 github.io 单 RTT 0.5~2s，白跑三个必失败请求
       只会拖慢首屏后的补齐。只对公开域名跳过，本地开发/LAN/file:// 行为不变。 */
    const isPublicSite = location.hostname === "evanyfm.github.io";
    if (!isPublicSite) await Promise.all([
      fetchJson("data/imported/trading_log_excel.json")
        .then((excel) => { excelItems = (excel.observations || []).map(normalizeExcelObservation); })
        .catch(silent404("Excel 导入")),
      fetchJson("data/imported/monthly_review_md.json")
        .then((md) => {
          months = md.months || [];
          mdTrades = (md.trades || []).map(normalizeMdTrade);
          mdNarratives = (md.narratives || []).map(normalizeMdNarrative);
        })
        .catch(silent404("月度复盘导入")),
      fetchJson("data/imported/user_journal.json")
        .then((user) => { userItems = (user.observations || []).map((item) => ({...item, source: "工作台日志"})); })
        .catch(silent404("用户复盘导入")),
    ]);

    if (db) {
      try {
        await withTimeout(Promise.all([
          putMany(STORES.observations, [...excelItems, ...mdNarratives]),
          putMany(STORES.trades, mdTrades),
          putMany(STORES.events, mdTrades.flatMap((trade) => trade.events || [])),
          putMany(STORES.observations, migrateLocalStorageDecisions()),
          setMeta("lastImport", {at: new Date().toISOString(), excel: excelItems.length, trades: mdTrades.length, narratives: mdNarratives.length}),
        ]), 5000, "IndexedDB 写入超时");
      } catch (error) { errors.push(`IndexedDB 写入：${error.message}`); }
    }

    const legacy = db
      ? await withTimeout(getAll(STORES.observations), 4000, "IndexedDB 读取超时").catch(() => [])
      : [];
    /* 合并:同 id 按 updated 时间戳新者胜(与云端 mergeJournal 一致),杜绝旧数据覆盖新修订 */
    const merged = {};
    const putMerged = (item) => {
      if (!item || !item.id) return;
      const prev = merged[item.id];
      if (!prev || Number(item.updated || 0) >= Number(prev.updated || 0)) merged[item.id] = item;
    };
    [...excelItems, ...mdNarratives, ...mdTrades, ...userItems, ...legacy, ...migrateLocalStorageDecisions()].forEach(putMerged);

    cache = {
      observations: Object.values(merged).filter((item) => item.kind !== "trade"),
      trades: Object.values(merged).filter((item) => item.kind === "trade"),
      narratives: mdNarratives,
      months: months,
    };
    cache.errors = errors;
    return cache;
  }

  /* 全量个人数据负载（供云端首次同步 / 手动同步使用） */
  function localPayload() {
    return {observations: cache.observations, trades: cache.trades, narratives: cache.narratives, months: cache.months};
  }

  /* 推送本地个人数据到私有仓（pull -> merge -> push），返回合并后全量。
     2026-10-14 起兼任「云端数据并入」唯一入口（init 不再等云拉取，首屏先出本地）：
     sync 的推送负载就是 mergeJournal(本地, 远端) 的结果——同 id updated 新者胜，
     远端独有条目（其他设备新写）与远端新版本都在里面，重建缓存即完成并入，
     并持久化回 IndexedDB 供下次离线首屏。 */
  function pushToCloud() {
    if (typeof JournalSync === "undefined" || !JournalSync.hasToken()) {
      return Promise.resolve({local: true, data: localPayload()});
    }
    return JournalSync.syncJournal(localPayload()).then((result) => {
      unsynced = 0;
      lastPushAt = new Date().toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit"});
      const merged = result.data || {};
      const all = [...(merged.observations || []), ...(merged.trades || []), ...(merged.narratives || [])];
      cache.observations = all.filter((item) => item && item.kind !== "trade");
      cache.trades = all.filter((item) => item && item.kind === "trade");
      if ((merged.months || []).length && !cache.months.length) cache.months = merged.months;
      if (db) {
        putMany(STORES.observations, cache.observations).catch(() => {});
        putMany(STORES.trades, cache.trades).catch(() => {});
      }
      return result;
    });
  }

  /* 云同步状态追踪:失败计数(供状态栏显示" N 条待同步")+ 最近成功推送时间 */
  let unsynced = 0;
  let lastPushAt = "";

  /* 工作台保存复盘时调用：写入 IndexedDB 并同步内存缓存，时间线即时可见；
     有 Token 时后台自动同步到私有数据仓；失败计入待同步数(状态栏可见),不再静默 */
  function putObservation(observation) {
    if (!observation || !observation.id) {
      console.warn("[HistoryStore] putObservation 忽略了缺 id 的记录（静默丢弃会掩盖数据丢失）", observation);
      return;
    }
    const stamped = {...observation, updated: Date.now()};
    cache.observations = cache.observations.filter((item) => item.id !== stamped.id);
    cache.observations.push(stamped);
    if (db) putMany(STORES.observations, [stamped]).catch((error) => {
      console.warn("[HistoryStore] IndexedDB 写入失败（重启后该记录可能丢失，建议导出备份）", error);
    });
    if (typeof JournalSync !== "undefined" && JournalSync.hasToken()) {
      unsynced += 1;
      JournalSync.syncJournal({observations: [stamped], trades: [], narratives: [], months: []})
        .then(() => { unsynced = Math.max(0, unsynced - 1); lastPushAt = new Date().toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit"}); if (typeof renderCloudSyncStatus === "function") renderCloudSyncStatus(); })
        .catch(() => { if (typeof renderCloudSyncStatus === "function") renderCloudSyncStatus(); });
    }
  }

  /* 状态栏查询:待同步条数 + 最近成功推送时间 */
  function syncState() {
    return {unsynced: unsynced, lastPushAt: lastPushAt};
  }

  /* ---------- 策略规则卡（v2）：localStorage 本地优先 + strategies.json 云端同步 ----------
     数据量小（几 KB），不上 IndexedDB；独立文件存储的原因见 journal-sync.js 注释。 */
  var STRAT_KEY = "fs_strategies_v2";
  const DEFAULT_STRATEGY_RULES = {
    A: {id: "A", name: "区间回归", version: 1, rules: {}, revisions: []},
    B: {id: "B", name: "向上突破", version: 1, rules: {}, revisions: []},
  };

  function loadStrategies() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STRAT_KEY) || "[]"); } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    ["A", "B"].forEach((id) => {
      if (!list.some((s) => s.id === id)) {
        list.push(JSON.parse(JSON.stringify(DEFAULT_STRATEGY_RULES[id])));
        localStorage.setItem(STRAT_KEY, JSON.stringify(list));
      }
    });
    return list.filter((s) => !s.deleted).concat(list.filter((s) => s.deleted));
  }

  function saveStrategy(strategy) {
    const list = loadStrategies();
    strategy.updated = Date.now();
    const idx = list.findIndex((s) => s.id === strategy.id);
    if (idx >= 0) list[idx] = strategy; else list.push(strategy);
    localStorage.setItem(STRAT_KEY, JSON.stringify(list));
    unsynced += 1;
    return strategy;
  }

  function pushStrategiesToCloud() {
    if (typeof JournalSync === "undefined" || !JournalSync.hasToken() || !JournalSync.syncStrategies) {
      return Promise.resolve({local: true, data: loadStrategies()});
    }
    return JournalSync.syncStrategies(loadStrategies()).then((result) => {
      const merged = result.data || [];
      localStorage.setItem(STRAT_KEY, JSON.stringify(merged));
      return {data: merged, ok: true};
    });
  }

  /* 启动时拉取远端策略规则（不推送）：有 Token 才发请求，失败静默——本地规则永远可用 */
  function pullStrategiesFromCloud() {
    if (typeof JournalSync === "undefined" || !JournalSync.hasToken() || !JournalSync.pullStrategies) return Promise.resolve(null);
    return JournalSync.pullStrategies().then((r) => {
      if (!r || !Array.isArray(r.data)) return null;
      const local = loadStrategies();
      const merged = JournalSync.mergeStrategies(local, r.data);
      localStorage.setItem(STRAT_KEY, JSON.stringify(merged));
      return merged;
    }).catch(() => null);
  }

  /* 导出：只包含本地工作台新写的 observation（source=工作台日志），不含静态
     Excel/md 导入项与已删除的墓碑记录，避免推送时重复/复活。Agent 收到后追加到
     data/imported/user_journal.json，下次刷新页面自动展示 */
  function exportUserJournal() {
    const items = cache.observations.filter((item) => item.source === "工作台日志" && !item.deleted);
    return {
      exportedAt: new Date().toISOString(),
      generator: "trading-system research_dashboard",
      version: 2,
      count: items.length,
      observations: items,
    };
  }

  return {init, cache: () => cache, putObservation, exportUserJournal, pushToCloud, syncState, hasCloudToken: () => typeof JournalSync !== "undefined" && JournalSync.hasToken(),
    loadStrategies, saveStrategy, pushStrategiesToCloud, pullStrategiesFromCloud};
})();
