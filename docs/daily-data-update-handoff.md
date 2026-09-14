# 每日更新操作清单

1. 检查工作树并保留用户修改，在干净状态fetch/pull远端main。使用北京时间报告日，休市日不伪造当日数据。
2. 按AGENTS既定来源获取同日行情、席位、保证金、趋势、技术、基本面。席位需同日精确主力净多/净空证据；缺失留空并说明。截图资金流只使用用户当日截图。
3. 保持公开仓最新检出位于源码仓同级 `../futures-workstation`；构建会从其 `data/snapshots` 补回缺失历史文件。设REPORT_DATE，运行build_research_dashboard.py，只生成目标日。已有目标快照默认拒绝覆盖，确需修订时先比较差异再显式设置REBUILD_SNAPSHOT=1。
4. 编译Python，运行全部unittest及 `node --test tests/journal-sync.test.js`，检查app.js语法。运行 `python scripts/check_public_artifacts.py output/research_dashboard --previous-meta ../futures-workstation/data/dashboard-meta.json`。
5. 只发布静态前端、公开数据与快照、manifest及必要检查脚本。禁止复制imported、个人journal、Token/Cookie、账号状态或本机配置。公开前核实源码仓和个人数据仓是否真正private。
6. 提交源码；将验证通过的静态产物同步公开仓，保留历史快照与已有CI，推送后核验Pages最新日期和59商品/63CTA、席位证据及历史切换。不能以CI绿色替代线上核验。

期货既有57份快照已重新统一索引；已修正meta和manifest，移除整包及旧lite包；备用读取也改为manifest+单日快照。v2的49个Python测试已通过，不再保留已知失败断言。

Pages强制门禁待管理员激活：Source改GitHub Actions，仓库变量PAGES_DEPLOY_ENABLED=true。已准备verified-pages工作流。在此之前分支发布仍独立运行。

旧抓取细节、Cookie失效处理及事故过程见 [历史归档](archive/2026-09-13-daily-data-update-handoff.md)。Cookie通过环境变量或受控本机配置注入，不提交到Git。

## 2026-09-14 执行记录（WorkBuddy）

- 按新清单跑通 9/14 全流程并发布：59 商品/63 CTA、保证金与行情 fresh 59/59、席位净多/净空 59/59、seatFlow 8/8（Cookie 有效）、49 测试全过、py_compile 全过。公开仓 `715c6ca`、源码仓 `75d3335`。
- 无用户截图：资金流与 OpenVLab 期权因子当日缺失，按规则留空（补截图后可 REBUILD_SNAPSHOT=1 重建同日）。
- 事故修复：`fetch_eastmoney_main_quotes.py` 的 qhkch 概览抓取异常静默产出空 position_rows CSV，build 席位硬复核拦截；改用机构报告 `contract_rows.csv` 按主力合约过滤转换。**注意转换必须用 `normalize_contract` 比较（郑商所 3 位合约），且每品种只留主力合约行——build 主力合约 fallback 链含 `quotes.contract`，多合约行会大小写不匹配全灭。**
- 东财技术面接口连续 3 日 0/6 异常，标缺失。
