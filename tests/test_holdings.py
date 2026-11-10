"""
Unit tests for Holdings module (13F whale investor holdings & consensus)
"""

import unittest
from analytics.modules.holdings.service import HoldingsService
from analytics.modules.holdings.config import TRACKED_MANAGERS
from analytics.modules.holdings.ticker_map import resolve_ticker


class TestHoldingsModule(unittest.TestCase):

    def test_tracked_managers_config(self):
        """Verify all tracked managers have valid configurations"""
        self.assertGreaterEqual(len(TRACKED_MANAGERS), 6)
        for m_id, meta in TRACKED_MANAGERS.items():
            self.assertEqual(meta["id"], m_id)
            self.assertTrue(meta["name"])
            self.assertTrue(meta["institution"])
            self.assertTrue(meta["cik"])
            self.assertTrue(meta["style"])

    def test_resolve_ticker(self):
        """Verify ticker resolution for well-known CUSIPs and names"""
        sym, name, sector = resolve_ticker("037833100", "APPLE INC")
        self.assertEqual(sym, "AAPL")
        self.assertIn("苹果", name)

        sym2, name2, _ = resolve_ticker("722304102", "PDD HOLDINGS INC")
        self.assertEqual(sym2, "PDD")
        self.assertIn("拼多多", name2)

        sym3, name3, _ = resolve_ticker("", "NVIDIA CORPORATION")
        self.assertEqual(sym3, "NVDA")

    def test_holdings_overview(self):
        """Verify holdings overview API returns valid managers and whale consensus"""
        res = HoldingsService.get_overview()
        self.assertEqual(res.get("status"), "ok")
        data = res.get("data", {})
        managers = data.get("managers", [])
        self.assertGreaterEqual(len(managers), 6)

        # Check each manager summary
        for m in managers:
            self.assertIn("id", m)
            self.assertIn("name", m)
            self.assertGreater(m.get("total_value", 0), 0)
            self.assertGreater(len(m.get("top3_holdings", [])), 0)

        # Check whale consensus
        consensus = data.get("consensus", [])
        self.assertGreaterEqual(len(consensus), 3)
        for c in consensus:
            self.assertTrue(c["symbol"])
            self.assertGreaterEqual(c["holders_count"], 2)
            self.assertGreater(len(c["holders"]), 1)

    def test_manager_detail_duan(self):
        """Verify detail for Duan Yongping"""
        detail = HoldingsService.get_manager_detail("duan")
        self.assertIsNotNone(detail)
        self.assertEqual(detail["status"], "ok")
        mgr = detail["data"]["manager"]
        self.assertEqual(mgr["name"], "段永平")
        holdings = detail["data"]["holdings"]
        self.assertGreaterEqual(len(holdings), 5)
        top1 = holdings[0]
        self.assertEqual(top1["symbol"], "AAPL")
        self.assertGreater(top1["weight"], 30.0)


if __name__ == "__main__":
    unittest.main()
