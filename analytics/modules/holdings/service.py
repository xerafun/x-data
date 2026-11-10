"""
机构与投资人持仓分析服务 (支持实时极速行情增强与顶流共识发掘)
"""

import os
import json
from typing import Dict, Any, List, Optional
from ...core.cache import cached
from ...core.config import settings
from ...core.logger import logger
from ...core.utils import get_beijing_time
from ...core.us_spot_helper import get_us_spot_direct
from .config import TRACKED_MANAGERS

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


class HoldingsService:
    """顶级机构持仓业务模型"""

    @staticmethod
    def _load_manager_snapshot(manager_id: str) -> Optional[Dict[str, Any]]:
        """从本地快照读取指定投资人数据"""
        file_path = os.path.join(DATA_DIR, f"{manager_id}.json")
        if not os.path.exists(file_path):
            return None
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"读取持仓快照失败 {manager_id}: {e}")
            return None

    @staticmethod
    @cached(
        "holdings:overview_v2",
        ttl=settings.CACHE_TTL.get("market_us", 60),
        stale_ttl=settings.CACHE_TTL.get("market_us", 60) * settings.STALE_TTL_RATIO,
        sync_on_cold=True
    )
    def get_overview() -> Dict[str, Any]:
        """
        获取全量投资人概况看板与顶流共识榜单
        """
        managers_list = []
        all_symbols = set()
        consensus_map: Dict[str, Dict[str, Any]] = {}

        for m_id, meta in TRACKED_MANAGERS.items():
            data = HoldingsService._load_manager_snapshot(m_id)
            if not data:
                continue

            # 提取前 3 大持仓作为卡片简要预览
            top3 = []
            for h in data.get("holdings", [])[:3]:
                sym = h.get("symbol")
                if sym:
                    all_symbols.add(sym)
                top3.append({
                    "symbol": sym,
                    "name": h.get("name"),
                    "weight": h.get("weight", 0),
                    "sector": h.get("sector")
                })

            # 统计全部前 10 大持仓用于共识挖掘
            for h in data.get("holdings", [])[:15]:
                sym = h.get("symbol")
                if not sym or sym in ("SPY", "IVV", "VOO"):  # 剔除宽基指数ETF，聚焦个股共识
                    continue
                all_symbols.add(sym)
                if sym not in consensus_map:
                    consensus_map[sym] = {
                        "symbol": sym,
                        "name": h.get("name"),
                        "sector": h.get("sector"),
                        "holders": [],
                        "total_value": 0,
                    }
                consensus_map[sym]["holders"].append({
                    "manager_id": m_id,
                    "manager_name": meta["name"],
                    "avatar_icon": meta["avatar_icon"],
                    "weight": h.get("weight", 0),
                    "action": h.get("action", "hold"),
                    "action_label": h.get("action_label", "持有")
                })
                consensus_map[sym]["total_value"] += h.get("value", 0)

            managers_list.append({
                "id": m_id,
                "name": meta["name"],
                "en_name": meta["en_name"],
                "institution": meta["institution"],
                "cik": meta["cik"],
                "style": meta["style"],
                "style_tags": meta["style_tags"],
                "avatar_icon": meta["avatar_icon"],
                "description": meta["description"],
                "filing_date": data.get("filing_date"),
                "total_value": data.get("total_value", 0),
                "holding_count": data.get("holding_count", 0),
                "cr10": data.get("cr10", 0),
                "top3_holdings": top3
            })

        # 批量获取实时极速行情
        live_quotes = get_us_spot_direct(list(all_symbols)) if all_symbols else {}

        # 丰富前 3 大预览的实时行情
        for m in managers_list:
            for item in m.get("top3_holdings", []):
                sym = item.get("symbol")
                if sym and sym in live_quotes:
                    q = live_quotes[sym]
                    item["price"] = q.get("price")
                    item["change_pct"] = q.get("change_pct")

        # 筛选被 2 家及以上机构共同重仓的标的作为顶流共识
        consensus_list = []
        for sym, c in consensus_map.items():
            if len(c["holders"]) >= 2:
                q = live_quotes.get(sym, {})
                consensus_list.append({
                    "symbol": sym,
                    "name": c["name"],
                    "sector": c["sector"],
                    "holders_count": len(c["holders"]),
                    "holders": c["holders"],
                    "total_value": c["total_value"],
                    "price": q.get("price"),
                    "change_pct": q.get("change_pct"),
                    "pe": q.get("pe")
                })

        # 共识排序：持有机构数降序 -> 合计市值降序
        consensus_list.sort(key=lambda x: (x["holders_count"], x["total_value"]), reverse=True)

        return {
            "managers": managers_list,
            "consensus": consensus_list[:8],  # 取 Top 8 核心共识股
            "market_time": get_beijing_time().strftime("%Y-%m-%d %H:%M:%S")
        }

    @staticmethod
    def get_manager_detail(manager_id: str) -> Optional[Dict[str, Any]]:
        """
        获取指定投资人的完整持仓明细（带盘中实时行情与估值）
        """
        data = HoldingsService._load_manager_snapshot(manager_id)
        if not data:
            return None

        holdings = data.get("holdings", [])
        symbols = [h["symbol"] for h in holdings if h.get("symbol")]
        live_quotes = get_us_spot_direct(symbols) if symbols else {}

        realtime_total_value = 0
        has_realtime = False

        for h in holdings:
            sym = h.get("symbol")
            if sym and sym in live_quotes:
                q = live_quotes[sym]
                h["price"] = q.get("price")
                h["change_pct"] = q.get("change_pct")
                h["pe"] = q.get("pe")
                h["market_cap"] = q.get("market_cap")
                if q.get("price") and h.get("shares"):
                    # 动态估算实时市值
                    cur_val = q["price"] * h["shares"]
                    h["live_value"] = round(cur_val, 2)
                    realtime_total_value += cur_val
                    has_realtime = True
            else:
                h["price"] = None
                h["change_pct"] = None
                h["pe"] = None
                h["live_value"] = h.get("value")

        return {
            "status": "ok",
            "data": {
                "manager": {
                    "id": data.get("id"),
                    "name": data.get("name"),
                    "en_name": data.get("en_name"),
                    "institution": data.get("institution"),
                    "cik": data.get("cik"),
                    "style": data.get("style"),
                    "style_tags": data.get("style_tags"),
                    "avatar_icon": data.get("avatar_icon"),
                    "description": data.get("description"),
                    "filing_date": data.get("filing_date"),
                    "filing_form": data.get("filing_form"),
                    "accession": data.get("accession"),
                    "total_value": data.get("total_value", 0),
                    "realtime_total_value": round(realtime_total_value, 2) if has_realtime else data.get("total_value", 0),
                    "holding_count": data.get("holding_count", 0),
                    "cr10": data.get("cr10", 0),
                },
                "holdings": holdings,
                "market_time": get_beijing_time().strftime("%Y-%m-%d %H:%M:%S")
            }
        }
