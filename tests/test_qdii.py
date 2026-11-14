import pytest
from analytics.modules.qdii import QDII_FUND_METADATA

def test_qdii_metadata_519981():
    item = next((f for f in QDII_FUND_METADATA if f["code"] == "519981"), None)
    assert item is not None, "519981 not found in QDII_FUND_METADATA"
    assert item["name"] == "长信标普100等权重指数(QDII)A"
    assert item["index_code"] == "SPX_100"
    assert item["index_name"] == "标普100"
    assert item["fee_rate"] == "1.30%"
    assert item["tag"] == "标普100"
    assert "stock_us_pct" in item["default_asset_allocation"]
    assert item["default_asset_allocation"]["stock_pct"] == 85.54

def test_all_qdii_metadata_structure():
    required_keys = [
        "code", "name", "index_code", "index_name",
        "fee_rate", "tracking_error", "inception_date",
        "default_return_1y", "default_nav", "default_nav_date",
        "default_asset_allocation"
    ]
    seen_codes = set()
    for item in QDII_FUND_METADATA:
        code = item.get("code")
        assert code not in seen_codes, f"Duplicate fund code {code}"
        seen_codes.add(code)
        for k in required_keys:
            assert k in item, f"Missing key '{k}' in fund {code}"
        assert isinstance(item["default_asset_allocation"], dict)
        assert "stock_pct" in item["default_asset_allocation"]


def test_resolve_fund_asset_allocation():
    from analytics.modules.qdii import resolve_fund_asset_allocation
    alloc, src_type, src_desc, rep_date = resolve_fund_asset_allocation("457001")
    assert alloc["stock_pct"] > 0
    assert "cash_pct" in alloc
    assert "bond_pct" in alloc
    assert src_type in ("metadata_fallback", "quarterly_direct", "stock_scaled_estimate")


def test_dual_track_nav_convergence(monkeypatch):
    from analytics.modules.qdii import fetch_sina_fund_navs

    class MockResponse:
        status_code = 200
        text = (
            'var hq_str_f_040046="华安纳斯达克100,5.1000,5.1000,5.0500,2026-11-10,0.99";\n'
            'var hq_str_fu_040046="华安纳斯达克100,15:00:00,5.1200,5.1000,5.1200,0,0.39,2026-11-11";\n'
        )

    def mock_requests_get(url, *args, **kwargs):
        return MockResponse()

    # 模拟天天基金返回比新浪更新的正式净值 (2026-11-11 最新确认净值 5.1500)
    def mock_em_fallback(code, session=None):
        if code == "040046":
            return {
                "official_nav": 5.1500,
                "official_nav_date": "2026-11-11",
                "nav": 5.1500,
                "nav_date": "2026-11-11",
            }
        return None

    monkeypatch.setattr("requests.get", mock_requests_get)
    monkeypatch.setattr("analytics.modules.qdii.fetch_eastmoney_nav_fallback", mock_em_fallback)

    res = fetch_sina_fund_navs(["040046"])
    fund = res["040046"]

    # 必须收敛并优先采用天天基金最新的官方正式净值
    assert fund["official_nav"] == 5.1500
    assert fund["official_nav_date"] == "2026-11-11"
    # 当最新官方确认净值已经为 2026-11-11，早于或等于该日的盘中估值必须被抑制作废
    assert fund["is_estimated"] is False
    assert fund["estimated_nav"] is None


def test_scheduler_qdii_jobs_registered():
    from analytics.core.scheduler import scheduler, setup_default_jobs
    setup_default_jobs()
    job_ids = [job.id for job in scheduler.scheduler.get_jobs()]
    assert "warmup:qdii:evening_19" in job_ids
    assert "warmup:qdii:evening_peak" in job_ids
    assert "warmup:qdii:daytime" in job_ids


def test_qdii_dynamic_ttl():
    from datetime import datetime
    from analytics.modules.qdii import calculate_qdii_dynamic_ttl

    # 1. 模拟工作日晚间披露高峰 20:15 (周三)
    ttl, strat = calculate_qdii_dynamic_ttl(datetime(2026, 11, 11, 20, 15, 0))
    assert ttl == 900
    assert "evening_peak" in strat

    # 2. 模拟工作日盘中交易 10:30 (周三)
    ttl, strat = calculate_qdii_dynamic_ttl(datetime(2026, 11, 11, 10, 30, 0))
    assert ttl == 1800
    assert "trading_hours" in strat

    # 3. 模拟工作日凌晨休市 03:00 (周四)
    ttl, strat = calculate_qdii_dynamic_ttl(datetime(2026, 11, 12, 3, 0, 0))
    assert ttl == 7200
    assert "off_hours" in strat

    # 4. 模拟周末 14:00 (周六)
    ttl, strat = calculate_qdii_dynamic_ttl(datetime(2026, 11, 14, 14, 0, 0))
    assert ttl == 7200
    assert "weekend" in strat
