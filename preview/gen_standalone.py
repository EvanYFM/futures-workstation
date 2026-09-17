#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 futures-workstation 复盘生命周期功能的单文件自包含预览版。

用途：聊天沙箱内相对 fetch 全挂，必须单文件（内联 CSS/JS + fetch 垫片）。
- 精简真实快照（8 个核心品种）嵌入垫片，保证总览/详情/CTA 视图可渲染
- 垫 data/imported/user_journal.json：一张 draft 卡（沪金 AU 持仓中）+
  一张 published 卡（焦煤 JM 已平仓归档），直接演示三动作生命周期
- 输出：preview/futures-workstation-review-lifecycle.html

再生成：python3 preview/gen_standalone.py（改代码后重跑，输出覆盖）
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "preview" / "futures-workstation-review-lifecycle.html"
OUT.parent.mkdir(parents=True, exist_ok=True)

DEMO_SYMBOLS = {"AU", "AG", "JM", "I", "FU", "M", "LH", "LC"}

def inline_js(text: str) -> str:
    return text.replace("</script", "<\\/script")

def slim_snapshot() -> dict:
    snap = json.loads((ROOT / "data/snapshots/20260911.json").read_text(encoding="utf-8"))
    insts = [i for i in snap.get("instruments", []) if i.get("symbol") in DEMO_SYMBOLS]
    snap["instruments"] = insts
    if isinstance(snap.get("cta"), list):
        snap["cta"] = [c for c in snap["cta"] if c.get("symbol") in DEMO_SYMBOLS][:8]
    for key in ("brokerHighlights", "keyEvents", "trendResonance"):
        val = snap.get(key)
        if isinstance(val, list):
            snap[key] = val[:6]
    return snap

def demo_journal() -> dict:
    insts = slim_snapshot()["instruments"]
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
        "exportedAt": "2026-09-17T04:00:00.000Z",
        "generator": "standalone-preview", "version": 2, "count": 2,
        "observations": [
            {   # 演示：进行中的草稿卡（持仓中，反复保存观察）
                "id": "ws-AU-demo1", "source": "工作台日志", "kind": "observation",
                "date": "2026-09-11", "variety": au["variety"], "symbol": "AU",
                "contract": None, "strike": None, "instrumentType": None, "optionType": None, "moneyness": None,
                "direction": "多", "strategySource": "自己", "executed": True, "tradeStatus": "open",
                "status": "draft", "createdAt": "2026-09-11T09:30:00.000Z", "editedAt": "2026-09-16T15:00:00.000Z",
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
        ],
    }

def build() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles-v2.css").read_text(encoding="utf-8")
    snap = slim_snapshot()
    journal = demo_journal()
    meta = {"generatedAt": "2026-09-17T09:00:00+08:00", "dates": ["20260911", "20260910", "20260909"], "latestDate": "20260911"}

    # 内联 CSS
    html = re.sub(
        r'<link rel="stylesheet" href="\./styles-v2\.css\?v=[^"]+">',
        lambda m: "<style>\n" + css.replace("</style", "<\\/style") + "\n</style>",
        html, count=1,
    )
    # 内联 3 个 JS（按出现顺序逐个替换，保持执行顺序）
    for src in ("history-store.js", "journal-sync.js", "app.js"):
        code = (ROOT / src).read_text(encoding="utf-8")
        html = re.sub(
            rf'<script src="\./{re.escape(src)}\?v=[^"]+" defer></script>',
            lambda m: "<script defer>\n" + inline_js(code) + "\n</script>",
            html, count=1,
        )
    # fetch 垫片：注入 head 最早处（在所有内联脚本前执行）
    shim = """
<script>
/* ===== 单文件预览垫片：拦截 data/ 相关 fetch，返回内嵌演示数据 ===== */
(function () {
  window.__STANDALONE_PREVIEW__ = true;
  var SNAPSHOT = __SNAPSHOT__;
  var META = __META__;
  var JOURNAL = __JOURNAL__;
  var orig = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, opts) {
    var u = String(url);
    function json(obj) { return Promise.resolve(new Response(JSON.stringify(obj), {status: 200, headers: {"Content-Type": "application/json"}})); }
    function notFound() { return Promise.resolve(new Response("", {status: 404})); }
    if (u.indexOf("dashboard-meta.json") >= 0) return json(META);
    if (/data\\/snapshots\\//.test(u)) return json(SNAPSHOT);
    if (u.indexOf("run-manifest.json") >= 0) return notFound();
    if (u.indexOf("data/imported/user_journal.json") >= 0) return json(JOURNAL);
    if (/data\\/imported\\//.test(u)) return notFound();
    if (orig) return orig(url, opts);
    return notFound();
  };
})();
</script>
""".replace("__SNAPSHOT__", json.dumps(snap, ensure_ascii=False, separators=(",", ":"))) \
   .replace("__META__", json.dumps(meta, ensure_ascii=False, separators=(",", ":"))) \
   .replace("__JOURNAL__", json.dumps(journal, ensure_ascii=False, separators=(",", ":")))
    html = html.replace("</head>", shim + "\n</head>", 1)

    OUT.write_text(html, encoding="utf-8")
    print(f"standalone preview -> {OUT} ({OUT.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    build()
