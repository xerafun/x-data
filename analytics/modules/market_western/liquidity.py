#!/usr/bin/env python
# -*- coding:utf-8 -*-
"""
Date: 2026/11/17
Desc: 全球宏观流动性与资金风向 (Global Liquidity & Macro Flow)
监控指标：
1. 美元指数 (DXY) - 实时汇率相对强弱与现金吸引力
2. 10Y TIPS 实际利率 (DFII10) - 杀估值真实贴现率真锚
3. 美联储净流动性 (WALCL - WTREGEN - RRP) - 金融市场真正的美元活水
4. 跨资产宏观流向状态机 (Dash for Cash / Flight to Quality / Risk-On / Cash Drain)
"""

import io
import asyncio
import pandas as pd
from typing import Dict, Any, Optional
from datetime import datetime

from ...core.cache import cached
from ...core.config import settings
from ...core.logger import logger
from ...core.snapshot import save_snapshot_async, _load_local_file
from ...core.utils import safe_float


SNAPSHOT_KEY = "market_global:liquidity"


class GlobalLiquidity:
    """全球宏观流动性与资金流向分析"""

    @staticmethod
    def _fetch_fred_series(series_id: str, timeout: int = 5) -> Optional[tuple]:
        """通过 curl_cffi 拉取 FRED 单一时间序列最新值"""
        try:
            from curl_cffi import requests
            url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
            resp = requests.get(url, impersonate="chrome120", timeout=timeout)
            if resp.status_code == 200 and resp.text:
                df = pd.read_csv(io.StringIO(resp.text))
                if len(df.columns) >= 2:
                    col = df.columns[1]
                    df[col] = pd.to_numeric(df[col], errors="coerce")
                    df = df.dropna(subset=[col])
                    if not df.empty:
                        last_row = df.iloc[-1]
                        return float(last_row[col]), str(last_row["observation_date"])
        except Exception as e:
            logger.debug(f"[GlobalLiquidity] FRED {series_id} 拉取跳过/超时: {e}")
        return None

    @staticmethod
    def _determine_regime(
        spx_chg: float,
        gold_chg: float,
        us10y_chg: float,
        dxy_val: float,
        tips_val: float
    ) -> Dict[str, Any]:
        """跨资产联动状态机评估"""
        # 1. 股债金三杀 / 流动性挤兑 (Dash for Cash)
        # 美股跌、黄金跌、长端美债跌(收益率跳涨)
        if spx_chg < -0.2 and gold_chg < -0.2 and us10y_chg > 0.02:
            return {
                "code": "dash_for_cash",
                "name": "流动性挤兑 (三杀预警)",
                "level": "danger",
                "signal": "无差别变现去杠杆",
                "description": "股/债/金同向大幅承压，高息美元与现金成为唯一避风港，市场呈现去杠杆与流动性挤兑特征。"
            }

        # 2. 经典避险 (Flight to Quality)
        # 美股跌，但避险资产黄金涨或美债收益率下行(债券涨)
        if spx_chg < -0.2 and (gold_chg > 0.1 or us10y_chg < -0.02):
            return {
                "code": "flight_to_quality",
                "name": "避险轮动 (Flight to Quality)",
                "level": "warning",
                "signal": "避险资金买金买债",
                "description": "股市风险偏好回落，避险资金有序流入黄金与长端国债，跨资产流动性传导保持健康。"
            }

        # 3. 充裕扩张 (Risk-On)
        if spx_chg > 0.2:
            return {
                "code": "risk_on",
                "name": "充裕扩张 (Risk-On)",
                "level": "success",
                "signal": "风险偏好高企",
                "description": "全球金融条件相对宽松，风险偏好旺盛，主要权益资产呈现扩张共振。"
            }

        # 4. 高息现金虹吸 (Cash Drain)
        # 实际利率高企 (>2.0%) 或美元指数处于高位 (>103)
        if tips_val >= 2.0 or dxy_val >= 103.0:
            return {
                "code": "cash_drain",
                "name": "高息现金虹吸 (Cash Drain)",
                "level": "info",
                "signal": "高利率资金观望",
                "description": "美元实际利率处于高位，无风险现金对各类资产持续产生流动性抽水与估值压制。"
            }

        # 5. 平衡震荡
        return {
            "code": "neutral",
            "name": "平衡震荡 (Neutral)",
            "level": "info",
            "signal": "流动性观望",
            "description": "跨资产流动性波动平缓，资金处于资产再平衡与宏观数据观望期。"
        }

    @staticmethod
    def _fetch_macro_assets_data(cached_assets: Optional[list] = None) -> list:
        """
        获取全球 4 大核心大类资产（标普500、现货黄金、20Y美债、美元指数）历史日线及多周期收益率
        """
        from ..chart.indices_comparison import fetch_eastmoney_index_kline

        configs = [
            {"code": "SP500", "name": "标普500", "secid": "100.SPX", "color": "#3B82F6", "category": "equity"},
            {"code": "GOLD", "name": "现货黄金", "secid": "101.GC00Y", "color": "#EAB308", "category": "commodity"},
            {"code": "TLT", "name": "20Y美债", "secid": "105.TLT", "color": "#10B981", "category": "bond"},
            {"code": "DXY", "name": "美元指数", "secid": "100.UDI", "color": "#8B5CF6", "category": "cash"},
        ]

        cached_map = {a["code"]: a for a in (cached_assets or []) if isinstance(a, dict) and "code" in a}
        results = []

        for c in configs:
            code = c["code"]
            asset_info = None
            try:
                df = fetch_eastmoney_index_kline(c["secid"])
                if df is not None and not df.empty and len(df) >= 5:
                    sub = df.tail(90).copy()
                    sub["close"] = pd.to_numeric(sub["close"], errors="coerce")
                    sub = sub.dropna(subset=["close"])
                    if not sub.empty:
                        hist = sub[["date", "close"]].values.tolist()
                        latest = float(sub["close"].iloc[-1])
                        c5 = float(sub["close"].iloc[-6]) if len(sub) >= 6 else latest
                        c20 = float(sub["close"].iloc[-21]) if len(sub) >= 21 else latest
                        c60 = float(sub["close"].iloc[-61]) if len(sub) >= 61 else latest
                        ret5 = round((latest - c5) / c5 * 100, 2)
                        ret20 = round((latest - c20) / c20 * 100, 2)
                        ret60 = round((latest - c60) / c60 * 100, 2)
                        asset_info = {
                            "code": code,
                            "name": c["name"],
                            "color": c["color"],
                            "category": c["category"],
                            "latest_close": latest,
                            "returns": {"5d": ret5, "20d": ret20, "60d": ret60},
                            "history": hist,
                        }
            except Exception as e:
                logger.warning(f"[GlobalLiquidity] 获取资产 {code} 异常: {e}")

            if not asset_info and code in cached_map:
                asset_info = cached_map[code]

            if asset_info:
                results.append(asset_info)

        return results

    @staticmethod
    def _build_flow_pipeline(
        assets: list,
        net_liq: float,
        tips_val: float
    ) -> Dict[str, Any]:
        """
        基于资产 20 日表现及流动性状态构建资金流向管道
        """
        if not assets:
            return {}

        ret_map = {a["code"]: a.get("returns", {}).get("20d", 0.0) for a in assets}
        spx_ret = ret_map.get("SP500", 0.0)
        gold_ret = ret_map.get("GOLD", 0.0)
        tlt_ret = ret_map.get("TLT", 0.0)
        dxy_ret = ret_map.get("DXY", 0.0)

        outflows = []
        inflows = []
        for a in assets:
            ret = a.get("returns", {}).get("20d", 0.0)
            item = {
                "code": a["code"],
                "name": a["name"],
                "color": a["color"],
                "category": a.get("category", "other"),
                "change": ret,
            }
            if ret < 0:
                outflows.append(item)
            else:
                inflows.append(item)

        outflows.sort(key=lambda x: x["change"])
        inflows.sort(key=lambda x: x["change"], reverse=True)

        if spx_ret < 0 and gold_ret < 0 and tlt_ret < 0 and dxy_ret > 0:
            bridge_title = "流动性虹吸 · 资金撤向避风港"
            bridge_desc = "股债金三杀去杠杆，高贴现率压制下高息现金成为唯一避风港"
            scenario = "dash_for_cash"
        elif spx_ret > 0 and (tlt_ret < 0 or gold_ret < 0):
            bridge_title = "风险追逐 · 资金回流核心资产"
            bridge_desc = "避险资产离场，流动性回流权益与成长标的 (Risk-On)"
            scenario = "risk_on"
        elif spx_ret < 0 and (gold_ret > 0 or tlt_ret > 0):
            bridge_title = "经典避险 · 防御资金买金买债"
            bridge_desc = "股市风险释放，避险资金有序涌入黄金与长端国债 (Flight to Safety)"
            scenario = "flight_to_quality"
        else:
            bridge_title = "结构分化 · 宏观再平衡"
            bridge_desc = "跨资产资金双向轮动，市场在无风险高利率环境下等待主线"
            scenario = "neutral"

        return {
            "scenario": scenario,
            "bridge_title": bridge_title,
            "bridge_desc": bridge_desc,
            "outflows": outflows,
            "inflows": inflows,
            "net_liquidity_scale": f"${net_liq}T",
            "tips_rate": f"{tips_val}%"
        }

    @staticmethod
    @cached(
        SNAPSHOT_KEY,
        ttl=settings.CACHE_TTL.get("market_overview", 3600),
        stale_ttl=settings.CACHE_TTL.get("market_overview", 3600) * settings.STALE_TTL_RATIO,
    )
    def get_liquidity_overview() -> Dict[str, Any]:
        """
        获取全球宏观流动性与资金风向指标
        """
        # 读取本地快照作为坚固兜底
        cached_snapshot = _load_local_file(SNAPSHOT_KEY) or {}

        # 1. 获取美元指数 (DXY) 及全球资产行情 (东方财富高公允接口)
        dxy_val = 103.7
        dxy_chg = 0.0
        spx_chg = 0.0
        gold_chg = 0.0

        try:
            import akshare as ak
            df_global = ak.index_global_spot_em()
            if not df_global.empty:
                udi = df_global[df_global["代码"] == "UDI"]
                if not udi.empty:
                    dxy_val = safe_float(udi["最新价"].iloc[0]) or dxy_val
                    dxy_chg = safe_float(udi["涨跌幅"].iloc[0]) or dxy_chg

                spx = df_global[df_global["代码"] == "SPX"]
                if not spx.empty:
                    spx_chg = safe_float(spx["涨跌幅"].iloc[0]) or spx_chg

                xau = df_global[df_global["代码"].str.contains("XAU|GC00Y|黄金", na=False)]
                if not xau.empty:
                    gold_chg = safe_float(xau["涨跌幅"].iloc[0]) or gold_chg
        except Exception as e:
            logger.warning(f"[GlobalLiquidity] 获取全球行情接口异常: {e}")
            if "dxy" in cached_snapshot:
                dxy_val = cached_snapshot["dxy"].get("value", dxy_val)
                dxy_chg = cached_snapshot["dxy"].get("change_pct", dxy_chg)

        # 2. 获取美债 10Y 变动 (来自已有的 USTreasury)
        us10y_chg = 0.0
        try:
            from .treasury import USTreasury
            bonds_data = USTreasury.get_us_bond_yields()
            if "spread" in bonds_data and "us_10y_change" in bonds_data["spread"]:
                us10y_chg = safe_float(bonds_data["spread"]["us_10y_change"]) or 0.0
        except Exception:
            pass

        # 3. 获取 10Y TIPS 实际利率与美联储净流动性 (FRED)
        tips_val = cached_snapshot.get("tips_10y", {}).get("value", 2.91)
        tips_date = cached_snapshot.get("tips_10y", {}).get("date", "最新")

        net_liq_val = cached_snapshot.get("net_liquidity", {}).get("value", 5.84)
        net_liq_date = cached_snapshot.get("net_liquidity", {}).get("date", "最新")

        # 尝试在线更新 FRED 数据 (超时 4 秒保护)
        res_tips = GlobalLiquidity._fetch_fred_series("DFII10", timeout=4)
        if res_tips:
            tips_val = round(res_tips[0], 2)
            tips_date = res_tips[1]

        res_walcl = GlobalLiquidity._fetch_fred_series("WALCL", timeout=4)
        res_tga = GlobalLiquidity._fetch_fred_series("WTREGEN", timeout=4)
        res_rrp = GlobalLiquidity._fetch_fred_series("RRPONTSYD", timeout=4)

        if res_walcl and res_tga and res_rrp:
            walcl_m = res_walcl[0]
            tga_m = res_tga[0]
            rrp_b = res_rrp[0]
            # 计算净流动性 (Trillions) = (WALCL - WTREGEN - RRP * 1000) / 1,000,000
            net_liq_calc = (walcl_m - tga_m - (rrp_b * 1000)) / 1000000.0
            net_liq_val = round(net_liq_calc, 2)
            net_liq_date = res_walcl[1]

        # 4. 评估指标状态文本
        dxy_status = "偏强运行" if dxy_val >= 104 else "中性震荡" if dxy_val >= 101 else "走弱宽松"
        tips_status = "高位杀估值" if tips_val >= 2.0 else "温和中性" if tips_val >= 1.0 else "流动性宽松"
        net_liq_status = "偏紧收缩" if net_liq_val < 6.0 else "稳健充裕"

        # 5. 跨资产宏观状态机诊断
        regime = GlobalLiquidity._determine_regime(spx_chg, gold_chg, us10y_chg, dxy_val, tips_val)

        # 6. 获取 4 大核心大类资产日线历史及多周期收益率 (标普500、黄金、20Y美债、美元指数)
        cached_assets = cached_snapshot.get("assets", [])
        assets = GlobalLiquidity._fetch_macro_assets_data(cached_assets=cached_assets)

        # 若获取到了最新的 DXY 资产收盘价，优先以此校准 dxy_val
        for a in assets:
            if a.get("code") == "DXY" and a.get("latest_close"):
                dxy_val = a["latest_close"]
                dxy_chg = a.get("returns", {}).get("5d", dxy_chg)
                dxy_status = "偏强运行" if dxy_val >= 104 else "中性震荡" if dxy_val >= 101 else "走弱宽松"
                break

        # 7. 构建动态资金流向管道
        flow_pipeline = GlobalLiquidity._build_flow_pipeline(assets, net_liq_val, tips_val)

        payload = {
            "dxy": {
                "value": round(dxy_val, 2),
                "change_pct": round(dxy_chg, 2),
                "status": dxy_status,
                "label": "美元指数 (DXY)",
                "sublabel": "现金汇率相对强弱"
            },
            "tips_10y": {
                "value": round(tips_val, 2),
                "unit": "%",
                "date": tips_date,
                "status": tips_status,
                "label": "10Y TIPS 实际利率",
                "sublabel": "无风险贴现率真锚"
            },
            "net_liquidity": {
                "value": round(net_liq_val, 2),
                "unit": "T",
                "date": net_liq_date,
                "status": net_liq_status,
                "label": "美联储净流动性",
                "sublabel": "总资产 - TGA - 逆回购"
            },
            "regime": regime,
            "assets": assets,
            "flow_pipeline": flow_pipeline,
            "update_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        # 异步持久化本地快照
        try:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(save_snapshot_async(SNAPSHOT_KEY, payload))
            except RuntimeError:
                asyncio.run(save_snapshot_async(SNAPSHOT_KEY, payload))
        except Exception:
            pass

        return payload
