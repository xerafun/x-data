"""
Holdings API: 顶级机构与知名投资人 13F 持仓风向标
"""

from fastapi import APIRouter, HTTPException, Query
from ..modules.holdings.service import HoldingsService

router = APIRouter()


@router.get("/overview", summary="获取投资人概览与顶流共识榜单")
def get_holdings_overview():
    """返回所有跟踪的大佬持仓概览卡片及共识重仓标的"""
    return HoldingsService.get_overview()


@router.get("/investor/{manager_id}", summary="获取指定投资人完整持仓组合")
def get_manager_detail(manager_id: str):
    """返回单个投资人的持仓明细（包含盘中实时价格、今日涨跌与调仓动作）"""
    res = HoldingsService.get_manager_detail(manager_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"未找到投资人档案: {manager_id}")
    return res
