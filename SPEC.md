# SPEC.md — futures-workstation 产品面规格

> 本文件是产品面真相文档（路由/页面/数据/流/边界），供 AI 会话快速上船与漂移检测。
> 数据生产口径的权威源在私有源码仓 trading-system（config/seat_universe.yaml）。
> 修改任何产品行为前先读本文，改后同步本文。最后全面核对：2026-10-03。

## 1. 路由与页面

| 页面 | 角色 |
|---|---|
| index.html | 研究工作站单页（七视图：总览/品种/详情/决策/历史/CTA + A股/美股美债两个子站 iframe 视图） |
| a-share/ | A股每日仪表盘子站（独立管线，详见 docs/ashare-data-pipeline-handoff.md） |
| us-market/ | 美股与美债复盘仪表盘子站（独立管线，见 trading-system-fresh/docs/us-market-data-pipeline-handoff.md） |
| 404.html | 错误页 |

前端资产（根目录平铺，无构建步骤）：`app.js`（渲染/交互，~1577 行）、`history-store.js`（IndexedDB 层）、`journal-sync.js`（私有仓云同步）、`styles-v2.css`、`assets/`。

## 2. 数据结构

- **公开数据**（data/）：`snapshots/YYYYMMDD.json`（58 商品/62 CTA，席位·行情·基本面·技术面）、`dashboard-meta.json`（dates 列表 + latestDate，首页靠它选最新日期）、根 `run-manifest.json`（schemaVersion/runId/latestDate/snapshotDates/snapshotCount）。
- **本地层**（IndexedDB `futuresTradingJournal` v1）：observations / trades / tradeEvents / meta 四 store，keyPath=id。**observation 单一模型**（2026-09-28 重设计）：draft（进行中，可反复保存）→ published（已平仓归档，固定）；旧 decisions/localStorage 体系已退役。
- **私有仓** `EvanYFM/futures-journal-data`：journal.json 全部个人复盘数据（匿名访问 404）。
- 合并语义：putObservation 回写（IndexedDB + 私有仓云同步，updated 新者胜）；删除写墓碑 `deleted:true + updated`，跨设备合并不复活。

## 3. 数据流

- 日报流：trading-system `make daily` 生产 → build 输出 → data agent 同步公开仓（`data: publish` 提交）→ Pages 上线。
- 复盘卡流：页面编辑 → localStorage/IndexedDB → journal-sync 推 futures-journal-data → 多设备合并拉回。
- 首屏：`index.html` head 内联预热 `dashboard-meta.json` → 最新 snapshot（写入 `window.__bootData`，必须在 `<link rel=stylesheet>` 之前）→ `app.js` 复用该结果渲染；预热失败返回 null，`app.js` 回退为自行 fetch。**首屏只等「索引 + 最新快照」**：`run-manifest.json`（仅在 meta 失效时兜底）与 `HistoryStore.init()`（IndexedDB + 3 个必 404 的 imported 探测）都在出图后并入，不阻塞 `#app[data-ready]`。最近 5 日历史快照在首屏后并发补齐。缓存戳 `?v=`（发布时替换为提交 SHA）。

## 4. 环境变量与密钥

- `localStorage` 同步 Token（journal-sync 用，不进 git/公开代码）。
- 无后端、无构建、无包管理（纯静态零依赖）。

## 5. 已知边界（有意为之，勿当 bug 修）

- **guard-data-publish CI**（09-28 事故后）：`data: ...` 前缀发布提交只准动 `data/**` 与 `run-manifest.json`；前端文件混入 = 发布 Agent 越界覆盖，CI 拒绝。功能改动必须走独立 feat/fix 提交。
- 板块口径（趋势/天气/情绪/股指已删）由 ts 侧决定，本仓不自行定义口径。
- app.js 单文件 ~1600 行是**接受的债务**：单人+AI 协作定位成本低，拆分留待下次大功能顺手做。
- 席位颜色语义：看多红/看空绿（中文交易语境），勿按西方惯例改。
