"""
SEC EDGAR 13F-HR 信息披露解析器
"""

import urllib.request
import json
from xml.etree import ElementTree as ET
from typing import Dict, Any, List, Optional
from .ticker_map import resolve_ticker
from ...core.logger import logger

SEC_HEADERS = {"User-Agent": "XDataAnalytics contact@xerafun.com"}


def fetch_sec_filings_list(cik: str) -> List[Dict[str, str]]:
    """获取指定 CIK 最近的 13F 申报列表"""
    url = f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"
    req = urllib.request.Request(url, headers=SEC_HEADERS)
    with urllib.request.urlopen(req, timeout=12) as resp:
        sub = json.loads(resp.read().decode("utf-8"))
    
    recent = sub.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accs = recent.get("accessionNumber", [])
    
    res = []
    for f, d, a in zip(forms, dates, accs):
        if "13F" in f:
            res.append({"form": f, "filing_date": d, "accession": a})
    return res


def fetch_13f_holdings_from_sec(cik: str, accession: str) -> List[Dict[str, Any]]:
    """从 SEC EDGAR 归档库下载并解析对应 13F 的 XML 信息表"""
    acc_clean = accession.replace("-", "")
    idx_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/index.json"
    req_idx = urllib.request.Request(idx_url, headers=SEC_HEADERS)
    with urllib.request.urlopen(req_idx, timeout=12) as r_idx:
        idx_data = json.loads(r_idx.read().decode("utf-8"))
    
    xml_name = None
    for it in idx_data.get("directory", {}).get("item", []):
        nm = it.get("name", "")
        if nm.endswith(".xml") and "primary" not in nm.lower():
            xml_name = nm
            break
            
    if not xml_name:
        raise ValueError(f"未找到 13F XML 信息表: CIK {cik}, Acc {accession}")

    xml_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/{xml_name}"
    req_xml = urllib.request.Request(xml_url, headers=SEC_HEADERS)
    with urllib.request.urlopen(req_xml, timeout=15) as r_xml:
        xml_bytes = r_xml.read()

    root = ET.fromstring(xml_bytes)
    for elem in root.iter():
        if "}" in elem.tag:
            elem.tag = elem.tag.split("}", 1)[1]

    raw_items = []
    for row in root.findall(".//infoTable"):
        issuer = (row.findtext("nameOfIssuer") or "").strip().upper()
        cusip = (row.findtext("cusip") or "").strip()
        val = int(row.findtext("value") or 0)
        shrs = int(row.findtext(".//sshPrnamt") or 0)
        title = (row.findtext("titleOfClass") or "").strip()
        raw_items.append({"name": issuer, "cusip": cusip, "value": val, "shares": shrs, "title": title})

    # 合并同标的不同子公司/账户的持仓行
    agg: Dict[str, Dict[str, Any]] = {}
    for r in raw_items:
        ticker, cn_name, sector = resolve_ticker(r["cusip"], r["name"])
        key = ticker
        if key not in agg:
            agg[key] = {
                "symbol": ticker,
                "name": cn_name,
                "raw_name": r["name"],
                "cusip": r["cusip"],
                "sector": sector,
                "value": 0,
                "shares": 0
            }
        agg[key]["value"] += r["value"]
        agg[key]["shares"] += r["shares"]

    holdings = list(agg.values())
    holdings.sort(key=lambda x: x["value"], reverse=True)
    return holdings
