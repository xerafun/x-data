#!/usr/bin/env python
# -*- coding:utf-8 -*-
"""
单元测试: 全球宏观流动性与资金风向 (Global Liquidity & Macro Flow)
"""

import pytest
from analytics.modules.market_western.liquidity import GlobalLiquidity


def test_determine_regime_dash_for_cash():
    """测试股债金三杀/流动性挤兑状态"""
    regime = GlobalLiquidity._determine_regime(
        spx_chg=-1.5,
        gold_chg=-1.8,
        us10y_chg=0.08,
        dxy_val=105.2,
        tips_val=2.5
    )
    assert regime["code"] == "dash_for_cash"
    assert "三杀" in regime["name"]
    assert regime["level"] == "danger"


def test_determine_regime_flight_to_quality():
    """测试避险轮动买金买债状态"""
    # 股市跌，黄金涨
    regime1 = GlobalLiquidity._determine_regime(
        spx_chg=-1.2,
        gold_chg=0.8,
        us10y_chg=0.01,
        dxy_val=103.0,
        tips_val=1.8
    )
    assert regime1["code"] == "flight_to_quality"
    assert regime1["level"] == "warning"

    # 股市跌，美债收益率下行(债券涨)
    regime2 = GlobalLiquidity._determine_regime(
        spx_chg=-0.8,
        gold_chg=-0.1,
        us10y_chg=-0.05,
        dxy_val=102.5,
        tips_val=1.8
    )
    assert regime2["code"] == "flight_to_quality"


def test_determine_regime_risk_on():
    """测试风险偏好扩张状态"""
    regime = GlobalLiquidity._determine_regime(
        spx_chg=0.9,
        gold_chg=0.3,
        us10y_chg=0.01,
        dxy_val=102.0,
        tips_val=1.5
    )
    assert regime["code"] == "risk_on"
    assert regime["level"] == "success"


def test_determine_regime_cash_drain():
    """测试高息现金虹吸状态"""
    regime = GlobalLiquidity._determine_regime(
        spx_chg=0.05,
        gold_chg=0.02,
        us10y_chg=0.0,
        dxy_val=104.5,
        tips_val=2.8
    )
    assert regime["code"] == "cash_drain"
    assert "高息现金虹吸" in regime["name"]


def test_liquidity_overview_schema():
    """测试流动性接口返回格式及完整性"""
    # 使用 wrapped 避免缓存阻断
    data = GlobalLiquidity.get_liquidity_overview.__wrapped__()
    assert isinstance(data, dict)
    assert "dxy" in data
    assert "value" in data["dxy"]
    assert "tips_10y" in data
    assert "net_liquidity" in data
    assert "regime" in data
    assert "code" in data["regime"]
    assert "name" in data["regime"]
    assert "description" in data["regime"]
