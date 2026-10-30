#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 futures-workstation 复盘卡（含 v2 期权/策略）功能的单文件自包含预览版。

用途：聊天沙箱内相对 fetch 全挂，必须单文件（内联 CSS/JS + fetch 垫片）。
- 精简真实快照（8 个核心品种，最新日期）嵌入垫片，保证总览/详情/CTA 视图可渲染
- 垫 data/imported/user_journal.json：v2 期权演示卡（SC call、策略归属 A、
  期权结构/区间位置/三止损线/纪律自查/禁止项/计划外执行度全字段）+
  draft 卡（沪金 AU 持仓中）+ published 卡（焦煤 JM 已平仓归档）+ 两条
  「未知」记录（演示品种匹配/日期匹配与交易状态显隐）
- 垫 fs_strategies_v2 localStorage：A/B 两张策略规则卡预填演示规则
  （区间定义/止损三线/期权门槛），填卡联动与月度检视立即可见
- 输出：preview/futures-workstation-review-card-v2.html

再生成：python3 preview/gen_standalone.py（改代码后重跑，输出覆盖）
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "preview" / "futures-workstation-review-card-v2.html"
OUT.parent.mkdir(parents=True, exist_ok=True)

DEMO_SYMBOLS = {"AU", "AG", "JM", "I", "FU", "M", "LH", "LC"}

def inline_js(text: str) -> str:
    return text.replace("</script", "<\\/script")

def latest_snapshots() -> dict:
    """最新一个真实快照，精简到演示品种（date 取目录里最大的）"""
    files = sorted((ROOT / "data/snapshots").glob("*.json"))
    path = files[-1]
    snap = json.loads(path.read_text(encoding="utf-8"))
    insts = [i for i in snap.get("instruments", []) if i.get("symbol") in DEMO_SYMBOLS]
    snap["instruments"] = insts
    if isinstance(snap.get("cta"), list):
        snap["cta"] = [c for c in snap["cta"] if c.get("symbol") in DEMO_SYMBOLS][:8]
    for key in ("brokerHighlights", "keyEvents", "trendResonance"):
        val = snap.get(key)
        if isinstance(val, list):
            snap[key] = val[:6]
    return {path.stem: snap}

def demo_journal(snap: dict) -> dict:
    latest_date = next(iter(snap))
    insts = next(iter(snap.values()))["instruments"]
    au = next(i for i in insts if i["symbol"] == "AU")
    jm = next(i for i in insts if i["symbol"] == "JM")
    def evidence(inst):
        trend = inst.get("trend") or {}
        return {
            "amountSignal": inst.get("amountSignal"), "handsSignal": inst.get("handsSignal"),
            "close": (inst.get("quote") or {}).get("close"), "changePct": (inst.get("quote") or {}).get("changePct"),
            "trend": trend.get("temperature", ""), "brokerRanking": inst.get("brokerRanking"),
        }
    return {
        "exportedAt": "2026-10-30T04:00:00.000Z",
        "generator": "standalone-preview", "version": 2, "count": 5,
        "observations": [
            {   # v2 演示：期权已平仓归档卡——期权结构/区间位置/三止损线/纪律自查/禁止项/计划执行度全字段
                "id": "ws-SC-demo-v2", "source": "工作台日志", "kind": "observation",
                "date": "2026-10-20", "variety": "原油", "symbol": "SC",
                "contract": "SC2512C580", "strike": "580", "instrumentType": "期权", "optionType": "call",
                "moneyness": "虚2", "direction": "多", "strategySource": "自己", "strategyTag": "A",
                "executed": True, "tradeStatus": "closed", "status": "published",
                "createdAt": "2026-10-20T09:30:00.000Z", "publishedAt": "2026-10-26T15:00:00.000Z",
                "editedAt": "2026-10-26T15:00:00.000Z",
                "expiryDate": "2026-11-19", "dte": 30, "lots": 5, "premiumPerLot": 120, "totalCost": 600,
                "accountPct": "1.2", "ivRank": "55",
                "rangeLower": 540, "rangeUpper": 620, "rangeCurrent": 552, "rangePosPct": 15.0, "nearEdge": True,
                "positionPct": "8%",
                "mainContradiction": "区间下沿附近（位置 15%），触下沿回归假设；反向证据是 OPEC 产量政策落地前 IV 会先抬。",
                "trigger": "价格触及区间下沿上方 5% 内（542 附近）买 call",
                "stopLossTakeProfit": "收盘跌破 530 = 区间失效，全部认错",
                "stopPrice": "530 收盘跌破", "stopPremiumPct": "-40", "stopTime": "政策会议前一周",
                "discipline": {"sleepHours": "6", "emotionLevel": 3, "justStopped": False, "justWoke": False,
                    "withinOpen30": False, "infoSource": "区间边界被测试 3 次 + 持仓量结构"},
                "violations": ["open_30min"],
                "closeNote": "反弹至 585 权利金翻倍，按止盈线分两笔平。",
                "myPnl": 640, "noTradeReason": "",
                "resultVsExpect": "better", "resultGapNote": "IV 抬升快于预期", "planCompliance": "in_plan",
                "reviewNote": "最大错误：开盘 30 分钟内就进了（违反时间纪律），虽然赚了。下一次只改：等开盘 30 分钟后的确认。",
                "selfInquiry": "", "review": "", "attribution": {"时机错?": "N"}, "ratings": {},
            },
            {   # v2 演示：期权计划外亏损卡——禁止项统计/计划内外期望差的数据源
                "id": "ws-SC-demo-v2b", "source": "工作台日志", "kind": "observation",
                "date": "2026-10-08", "variety": "原油", "symbol": "SC",
                "contract": "SC2512P560", "strike": "560", "instrumentType": "期权", "optionType": "put",
                "moneyness": "虚3", "direction": "空", "strategySource": "自己", "strategyTag": "unplanned",
                "executed": True, "tradeStatus": "closed", "status": "published",
                "createdAt": "2026-10-08T09:35:00.000Z", "publishedAt": "2026-10-09T15:00:00.000Z",
                "editedAt": "2026-10-09T15:00:00.000Z",
                "expiryDate": "2026-11-19", "dte": 42, "lots": 3, "premiumPerLot": 90, "totalCost": 270,
                "positionPct": "5%",
                "mainContradiction": "跳空 +2% 看突破，实际是情绪接力。",
                "trigger": "", "stopLossTakeProfit": "",
                "stopPrice": "", "stopPremiumPct": "", "stopTime": "",
                "discipline": {"sleepHours": "5.2", "emotionLevel": 8, "justStopped": True, "justWoke": True,
                    "withinOpen30": True, "infoSource": "只有一个价格观察"},
                "violations": ["reversal_after_stop", "after_loss", "open_30min", "emotion_high", "unclear_source"],
                "closeNote": "开盘追 put，当天权利金腰斩，次日割肉。",
                "myPnl": -1350, "noTradeReason": "",
                "resultVsExpect": "worse", "resultGapNote": "IV 高位接盘", "planCompliance": "unplanned",
                "reviewNote": "最大错误：put 刚被止损就同标的反向追多再翻空，六格空白下单。下一次只改：止损后 2 小时冷静期。",
                "selfInquiry": "这笔来自「刚亏了必须马上赚回来」，不是来自信号。", "review": "", "attribution": {"判断错?": "Y", "执行错?": "Y"}, "ratings": {},
            },
            {   # 演示：进行中的草稿卡（持仓中，反复保存观察）
                "id": "ws-AU-demo1", "source": "工作台日志", "kind": "observation",
                "date": latest_date, "variety": au["variety"], "symbol": "AU",
                "contract": None, "strike": None, "instrumentType": None, "optionType": None, "moneyness": None,
                "direction": "多", "strategySource": "自己", "executed": True, "tradeStatus": "open",
                "status": "draft", "createdAt": f"{latest_date}T09:30:00.000Z", "editedAt": "2026-10-28T15:00:00.000Z",
                "positionPct": "30%",
                "mainContradiction": "席位净多集中度连续三日抬升，但价格仍贴着 EMA20 走，回踩不破就是入场窗口；反向证据是外资席位在高位小幅减仓。",
                "trigger": "回踩 2850 企稳加仓，第一笔已进",
                "stopLossTakeProfit": "跌破 2780 全部止损",
                "closeNote": "", "myPnl": None, "noTradeReason": "", "reviewNote": "", "selfInquiry": "", "review": "",
                "attribution": None, "ratings": {}, **evidence(au),
            },
            {   # 演示：已发布归档卡（已平仓，固定在下方时间线）
                "id": "ws-JM-demo1", "source": "工作台日志", "kind": "observation",
                "date": "2026-09-09", "variety": jm["variety"], "symbol": "JM",
                "contract": None, "strike": None, "instrumentType": None, "optionType": None, "moneyness": None,
                "direction": "空", "strategySource": "自己", "executed": True, "tradeStatus": "closed",
                "status": "published", "createdAt": "2026-09-09T09:00:00.000Z",
                "publishedAt": "2026-09-15T14:30:00.000Z", "editedAt": "2026-09-15T14:30:00.000Z",
                "positionPct": "20%",
                "mainContradiction": "焦煤仓单累积+席位净空扩散，基差走弱确认产业做空逻辑。",
                "trigger": "反弹至 1380 附近建空",
                "stopLossTakeProfit": "站上 1420 止损",
                "closeNote": "1280 全部止盈离场，分两笔平，第二笔稍贪但整体按计划执行。",
                "myPnl": 18400, "noTradeReason": "",
                "reviewNote": "最大错误：第二笔平仓贪了 30 点，动了「再等等」的念头。下一次只改：到目标位直接市价平，不留情绪仓位。",
                "selfInquiry": "平仓时腿软想提前跑的是恐惧，扛着不平的是执著；两者都不是行情给的信号。",
                "review": "", "attribution": {"时机错?": "N"},
                "ratings": {}, **evidence(jm),
            },
            {   # 演示：月度复盘导入的「未知」记录（无品种，有日期）→ 品种匹配演示
                "id": "md-demo-unknown-1", "source": "月度复盘md", "kind": "observation",
                "date": "2026-08-01", "variety": "未知", "symbol": "",
                "contract": None, "strike": None, "instrumentType": None, "optionType": None, "moneyness": None,
                "direction": "空", "strategySource": "自己", "executed": True, "tradeStatus": "closed",
                "status": "published", "createdAt": "2026-08-01T09:00:00.000Z",
                "publishedAt": "2026-08-01T09:00:00.000Z", "editedAt": "2026-08-01T09:00:00.000Z",
                "positionPct": "10%",
                "mainContradiction": "月度复盘原文：油脂板块高升水 + 席位净空扩散，逢反弹布空。",
                "trigger": "反弹至区间上沿布空", "stopLossTakeProfit": "突破前高止损",
                "closeNote": "月末按计划离场。", "myPnl": -5200, "noTradeReason": "",
                "reviewNote": "最大错误：入场偏早，等确认信号。下一次只改：等突破回踩再进。",
                "selfInquiry": "", "review": "（原文略）", "attribution": {"判断错?": "Y"},
                "ratings": {},
            },
        ],
    }

def demo_strategies() -> list:
    return [
        {"id": "A", "name": "区间回归", "version": 2,
         "rules": {
             "assumption": "SC 价格在 [下沿,上沿] 内震荡，触及边界后回归",
             "lowerBound": "近 20 日最低价", "upperBound": "近 20 日最高价",
             "validIf": "区间至少被测试 3 次且未收盘突破",
             "invalidIf": "收盘突破任一边界 → 区间作废，本策略停用",
             "entryRule": "区间下沿附近（下方 5% 内）买 call；上沿附近（上方 5% 内）买 put",
             "positionRule": "单笔权利金 ≤1.2% 账户；方向冲突时减半",
             "stopPrice": "收盘突破边界（区间失效即认错）",
             "stopPremiumPct": "-40", "stopTime": "DTE≤14 或事件前一周",
             "accountPctCap": "1.2", "ivRankCap": "60", "minDte": "30", "edgePct": "5",
             "conflictRule": "A 与 B 信号同日冲突 → 只用 A 的一半仓位，或当日不交易",
             "pendingBlanks": "回测次数/突破次数的统计依据",
         },
         "revisions": [
             {"date": "2026-10-30", "version": 2, "change": "建立区间定义与三止损线", "reason": "交易日记卡 v1 建卡"},
         ],
         "updated": 1793356800000},
        {"id": "B", "name": "向上突破", "version": 1, "rules": {}, "revisions": []},
    ]

def build() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles-v2.css").read_text(encoding="utf-8")
    snaps = latest_snapshots()
    journal = demo_journal(snaps)
    meta = {"generatedAt": "2026-10-30T09:00:00+08:00", "dates": list(snaps), "latestDate": list(snaps)[-1]}

    # 预览版标题
    html = html.replace("<title>中国期货研究全景</title>", "<title>中国期货研究全景 · 复盘卡 v2 预览</title>", 1)
    # 单文件无依赖：favicon 外链去掉
    html = re.sub(r'\s*<link rel="icon"[^>]*>', "", html)
    # 内联 CSS
    html = re.sub(
        r'<link rel="stylesheet" href="\./styles-v2\.css[^"]*">',
        lambda m: "<style>\n" + css.replace("</style", "<\\/style") + "\n</style>",
        html, count=1,
    )
    # 内联 5 个 JS（按出现顺序逐个替换，保持执行顺序）
    for src in ("history-store.js", "journal-sync.js", "focus-technical-data.js", "focus-technical.js", "app.js"):
        code = (ROOT / src).read_text(encoding="utf-8")
        html = re.sub(
            rf'<script src="\./{re.escape(src)}[^"]*" defer></script>',
            lambda m: "<script defer>\n" + inline_js(code) + "\n</script>",
            html, count=1,
        )
    # fetch 垫片：注入 head 最早处（在 __bootData 预热脚本前执行）
    shim = """
<script>
/* ===== 单文件预览垫片：拦截 data/ 相关 fetch，返回内嵌演示数据 ===== */
(function () {
  window.__STANDALONE_PREVIEW__ = true;
  var SNAPS = __SNAPS__;
  var META = __META__;
  var JOURNAL = __JOURNAL__;
  var STRATEGIES = __STRATEGIES__;
  try { if (!localStorage.getItem("fs_strategies_v2")) localStorage.setItem("fs_strategies_v2", JSON.stringify(STRATEGIES)); } catch (e) {}
  var orig = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, opts) {
    var u = String(url);
    function json(obj) { return Promise.resolve(new Response(JSON.stringify(obj), {status: 200, headers: {"Content-Type": "application/json"}})); }
    function notFound() { return Promise.resolve(new Response("", {status: 404})); }
    if (u.indexOf("dashboard-meta.json") >= 0) return json(META);
    var m = u.match(/data\\/snapshots\\/([0-9]+)\\.json/);
    if (m) { if (SNAPS[m[1]]) return json(SNAPS[m[1]]); return notFound(); }
    if (u.indexOf("run-manifest.json") >= 0) return notFound();
    if (u.indexOf("data/imported/user_journal.json") >= 0) return json(JOURNAL);
    if (/data\\/imported\\//.test(u)) return notFound();
    if (orig) return orig(url, opts);
    return notFound();
  };
})();
</script>
""".replace("__SNAPS__", json.dumps(snaps, ensure_ascii=False, separators=(",", ":"))) \
   .replace("__META__", json.dumps(meta, ensure_ascii=False, separators=(",", ":"))) \
   .replace("__JOURNAL__", json.dumps(journal, ensure_ascii=False, separators=(",", ":"))) \
   .replace("__STRATEGIES__", json.dumps(demo_strategies(), ensure_ascii=False, separators=(",", ":")))
    html = html.replace("</head>", shim + "\n</head>", 1)

    OUT.write_text(html, encoding="utf-8")
    print(f"standalone preview -> {OUT} ({OUT.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    build()
