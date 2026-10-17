# A股仪表盘 · 数据获取全流程 Handoff

> **用途**：交付/协作/断点续跑的完整操作手册。面向任何接手此管线的 agent 或人类协作者。
> **维护**：主 agent（游星）· 工作区 `/home/z/my-project/reports/`（本地操作手册 RUNBOOK.md 是本文档的姊妹篇，本文件同步精简版到仓库）
> **调度**：交易日 19:00（Asia/Shanghai）定时任务
> **线上**：https://evanyfm.github.io/futures-workstation/ （主站「A股仪表盘」标签页，iframe 嵌 `/a-share/` 子站）
> 最近重大变更：2026-10-16 大小单降级源（见 §5）

---

## 1. 产出物与目录结构

```
reports/                              # 主工作区（本地，不入公开仓）
├── RUNBOOK.md                        # 运行手册（本文档的本地完整版）
├── collect_data.py                   # 机器数据采集（12类源）
├── collect_participants.py           # 参与者序列采集（红利/2000/美债/汇率/两融）
├── fetch_fund_flow_web.py            # 东财网页版资金流降级源(2026-10-17新增)
├── calc_<date>.py                    # 当日机械计算 → _calc.json
├── assemble_<date>.py                # 组装快照 → dashboard_data.json
├── build_dashboard.py                # 生成独立HTML(内联echarts, 自包含)
├── verify.js                         # playwright验收(charts=8/无JS错)
├── station_update.py                 # 快照站入库(a-share/data/snapshots/)
├── push_ashare.sh                    # 部署GitHub Pages(含rebase/token)
├── data/daily/<YYYYMMDD>/            # 当日原始数据+快照
├── data/participants/participant_series.json  # 参与者时序(滚动90日)
└── data/shot_sec*.png                # verify.js分段截图(VLM审查用)
```

## 2. 流程总览（9步）

| # | 步骤 | 命令 | 要点 |
|---|------|------|------|
| 1 | 交易日判断 | `ak.stock_zh_index_spot_sina()` 昨收 vs 前日快照 | 休市→静默退出不发送 |
| 2 | 机器采集 | `collect_data.py <date>` | **必须 nohup 后台跑**（见 §6 挂起问题） |
| 3 | 参与者采集 | `collect_participants.py <date>` | stdout 摘要 JSON，null 须排查 |
| 4 | web 补源 | web_search + page_reader | 证券时报资金表(18:30后)/东财北向/当日收评 |
| 5 | 机械计算 | `calc_<date>.py` | 前日脚本为模板，核对降级路径 |
| 6 | 快照组装 | `assemble_<date>.py` | **deep_keys 对比前日快照防漏字段** |
| 7 | 构建验证 | `build_dashboard.py` + `verify.js` + VLM 看截图 | charts=8 / 无JS错 / 无空白模块 |
| 8 | 快照站入库 | `station_update.py <date>` | 更新 snapshots/ + dashboard-meta.json |
| 9 | 部署推送 | `bash push_ashare.sh` | **push 前自动 pull --rebase**（远端常有并行提交） |

最后 `send_file` 发独立 HTML + 3-5 条核心结论（资金主线/行业轮动/风格/情绪/参与者动向）+ 线上地址。

## 3. 机器数据源清单（collect_data.py 输出）

| 文件 | 源(akshare) | 用途 | 降级路径 |
|------|-------------|------|----------|
| index_spot_sina.csv | 新浪指数快照 | 三大指数高低收 | 腾讯行情 |
| sw_industry.csv | 申万31行业 | 行业涨跌 | THS行业 |
| sw_style.csv | 申万风格指数 | 低PB/高PE等 | — |
| ths_flow_d1/d3/d5.csv | THS行业资金流 | 行业净额(备用) | 东财datacenter |
| a_spot_tx.csv | 腾讯全A快照 | 成交/涨跌家数/主力净额交叉 | 东财 |
| zt_pool / dt_pool.csv | 东财涨跌停池 | 情绪模块(连板/炸板) | THS |
| margin_em.json | 东财两融 | 融资余额(两融T+1) | margin_sse.csv沪市T+0 |
| margin_sse.csv | 上交所两融 | 沪市拆分 | — |
| etf_sina.csv | 新浪ETF | 宽基ETF占比(政府托底监测) | — |
| sw_hist_31.json | 申万31行业历史 | 行业热力6日 | 逐行业index_hist_sw |
| sw_A_hist.csv | 申万A指801003 | 成交额分位(60日) | — |
| hist_<index>.csv ×10 | 指数历史 | 宽基结构 | — |
| kp_data.js | kp-research.cn | 中信五风格 | **陈旧→申万风格代理**(见§5) |
| concept_hist.json | THS概念历史 | 概念热力(已不渲染) | — |
| fund_flow_em.json | 东财push2delay | 主力/大小单拆分 | **东财网页版**(见§5) |

## 4. Web 补源（agent 搜索任务）

1. **证券时报《X月X日主力资金流向日报》**（stcn.com，数据宝，发布 18-20 点）：
   31行业资金表 + 主力净额 + 个股前五 + 创业板/科创板/沪深300拆分。**当前主力口径首选**（东财 API 封禁期）。
2. **东财《X月X日北向资金最新动向》**（发布约 18-19 点）：成交额 + 占两市比 + 沪深股通前十大成交股。
   备用：东财 datacenter `RPT_MUTUAL_DEAL_HISTORY`（MUTUAL_TYPE=005，DEAL_AMT 单位百万）——此域名未被封。
3. **当日收评**（北京日报/中新经纬等）：涨跌家数叙事 + 板块动向 + 龙虎榜事件。

## 5. 降级与口径矩阵（2026-10-17 现状）

| 数据 | 正常源 | 当前状态 | 降级方案 |
|------|--------|----------|----------|
| 主力净额 | 东财 push2delay | **API 对采集环境 403（10-14 起）** | ①数据宝文章口径(主力) ②东财网页版 dpzjlx.html（`fetch_fund_flow_web.py`，page_reader 渲染，**含全部大小单拆分**） ③腾讯个股汇总（交叉校验） |
| 大小单拆分 | 东财 push2his daykline | 同上 403 | `fetch_fund_flow_web.py` → fund_flow_web.json（117日历史+当日分布，与东财App同源） |
| 五风格当日点 | kp_data.js | 更新时间不定（常晚于19点） | 申万风格代理：金融→银行 / 稳定→低PB / 消费→食品饮料 / 周期→中PE / 成长→高PE，**次日复核官方值** |
| THS 接口 | 同花顺 | 偶发挂起（连接死等） | 子进程隔离重试（见 §6） |
| 北向净买额 | — | 2024-08 起停止披露 | 只有成交额+占比，报告须标注 |

**双口径标注规范**：main 用数据宝口径时，super/big 用东财网页口径——两口径存在差异（如 10-16：数据宝 -2.91亿 vs 东财 -60.88亿），note 字段必须写明每个字段的口径来源。

## 6. 已知工程坑（重要！）

1. **akshare 网络挂起**：东财/THS 接口会让 requests 卡死在已死连接的 select 上，SIGALRM 会被 akshare 内部重试吞掉。**解法**：`multiprocessing.Process` 子进程隔离 + `p.join(timeout)` + terminate（参考 `collect_data_resume2.py` 模式）。长采集命令一律 `setsid nohup ... & disown` 后台跑，`tail` 日志轮询。
2. **执行环境时钟错位**：容器 btime 与 ps etime 不同步，排障以 `date` + 文件 mtime 为准。
3. **GitHub Pages 流停滞**（2026-10-15 已修复）：fetch 默认无超时，主站/a-share 子站已加 20s 超时+2次重试。
4. **git 推送**：token 内嵌 remote URL（extraHeader 认证已失效）；push 前必须 `git pull --rebase origin main`（远端有用户本地工作流并行提交）。
5. **会话 504 中断**：长任务后台化 + 日志文件回读，用户以「继续」恢复，无状态损失。
6. **sw_hist_31 偶有日洞**（如缺 10-15）：行业热力计算时若 hist 已含当日，需用 spot(昨收=前收) 覆盖当日列，否则末列为跨2日涨幅（2026-10-16 已修）。**存量 bug 警示：2026-10-15 及更早的「5日热力」模块 dates 实为9月末+当日拼凑，历史数据使用时注意**。

## 7. 快照契约要点（deep_keys 校验）

必含字段：`date / date_display / generated_at / meta_chips[4] / indices[].{high,low} / narrative{overview,heat,roll,indflow,style,style5,north,concept,emotion,calls,participants} / north / calls{cards[3-4].{tag,cls,t,b,e},sig,participant_impact} / participants{cards[6],chart,external,attribution,conclusion(纯字符串)} / broad_range / calls.cards[].cls ∈ {overweight,watch,underweight}`

- 概念模块字段照常生成但不渲染（2026-10-14 起移除，deep_keys 对比时保留）
- `limit_pool.zt_industry_top.*` 为动态键（当日涨停行业），deep_keys 差异属正常
- 参与者状态判定规则：红利60日超额>5%=保险主导；成长60日<-10%且集中=公募瓦解；US10Y20日>+20bp=外资承压；成交分位<30%=量化受抑；大跌日宽基ETF占比>3%=政府疑似托底；融资20日<-2%=杠杆退潮

## 8. 验收清单（每次全过才算完成）

- [ ] `verify.js`: charts=8, JS errors none
- [ ] VLM 分段截图: 无空白/null/溢出
- [ ] deep_keys: REF有CUR无 = 仅动态键差异
- [ ] 线上 meta latestDate = 当日, snapshot HTTP 200
- [ ] participants summary 无 null
- [ ] fund_flow super/big 非 null（若 null 走 §5 降级并标注口径）
