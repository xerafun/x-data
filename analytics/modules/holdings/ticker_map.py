"""
CUSIP / Issuer Name to Ticker, Chinese Name, and Sector Mapping
"""

from typing import Dict, Tuple

# Mapping from CUSIP to (Ticker, Chinese Name, Sector)
CUSIP_MAP: Dict[str, Tuple[str, str, str]] = {
    "037833100": ("AAPL", "苹果公司", "消费科技"),
    "025816109": ("AXP", "美国运通", "金融服务"),
    "191216100": ("KO", "可口可乐", "必选消费"),
    "02079K305": ("GOOGL", "谷歌 A", "互联网科技"),
    "02079K107": ("GOOG", "谷歌 C", "互联网科技"),
    "060505104": ("BAC", "美国银行", "传统金融"),
    "166764100": ("CVX", "雪佛龙", "传统能源"),
    "674599105": ("OXY", "西方石油", "传统能源"),
    "H1467J104": ("CB", "安达保险", "保险金融"),
    "615369105": ("MCO", "穆迪", "金融评级"),
    "500754106": ("KHC", "卡夫亨氏", "食品消费"),
    "084670702": ("BRK.B", "伯克希尔 B", "多元投资"),
    "722304102": ("PDD", "拼多多", "电商零售"),
    "88160R101": ("TSLA", "特斯拉", "新能源汽车"),
    "67066G104": ("NVDA", "英伟达", "算力芯片"),
    "594918104": ("MSFT", "微软", "云计算与AI"),
    "G25457105": ("CRDO", "Credo Technology", "高速互联芯片"),
    "91324P102": ("UNH", "联合健康", "医疗健康"),
    "254687106": ("DIS", "迪士尼", "娱乐传媒"),
    "27579R104": ("EWBC", "华美银行", "商业银行"),
    "227046109": ("CROX", "卡骆驰", "服装鞋履"),
    "88034P109": ("TME", "腾讯音乐", "数字流媒体"),
    "69608A108": ("PLTR", "Palantir", "AI软件与大数据"),
    "717081103": ("PFE", "辉瑞制药", "医药制造"),
    "406216101": ("HAL", "哈里伯顿", "油服设备"),
    "60855R100": ("MOH", "莫利纳医疗", "医疗保险"),
    "550021109": ("LULU", "露露柠檬", "运动服饰"),
    "78442P106": ("SLM", "SLM金融", "消费信贷"),
    "116794207": ("BRKR", "布鲁克仪器", "科学分析仪器"),
    "78462F103": ("SPY", "标普500 ETF", "宽基指数"),
    "464287200": ("IVV", "Core标普500 ETF", "宽基指数"),
    "11135F101": ("AVGO", "博通", "半导体通信"),
    "023135106": ("AMZN", "亚马逊", "云与电商"),
    "512807306": ("LRCX", "拉姆研究", "半导体设备"),
    "922908363": ("VOO", "先锋标普500 ETF", "宽基指数"),
    "007903107": ("AMD", "超微半导体", "算力芯片"),
    "464286772": ("IEMG", "核心新兴市场 ETF", "新兴市场"),
    "52490G102": ("LEGN", "传奇生物", "创新生物药"),
    "36118L106": ("FUTU", "富途控股", "金融科技券商"),
    "04272N102": ("AVBP", "ArriVent", "创新生物药"),
    "573874104": ("MRVL", "美满电子", "网络与存储芯片"),
    "92763W103": ("VIPS", "唯品会", "特卖电商"),
    "482497104": ("BEKE", "贝壳", "居住产业平台"),
    "23285D109": ("CTKB", "赛泰克生物", "流式细胞仪器"),
    "010911105": ("ALMR", "Alamar", "蛋白质组诊断"),
    "01609W102": ("BABA", "阿里巴巴", "电商与云计算"),
    "30303M102": ("META", "Meta", "社交网络与AI"),
    "457642205": ("INOD", "Innodata", "AI数据工程"),
    "833445109": ("SNOW", "Snowflake", "云数据仓库"),
    "871607107": ("SNPS", "新思科技", "EDA软件"),
    "88023B103": ("TEM", "Tempus AI", "精准医疗AI"),
    "172573107": ("CRCL", "Circle Internet", "加密金融基础设施")
}

# Mapping from common name keywords to (Ticker, Chinese Name, Sector)
NAME_KEYWORD_MAP: Dict[str, Tuple[str, str, str]] = {
    "APPLE": ("AAPL", "苹果公司", "消费科技"),
    "AMERICAN EXPRESS": ("AXP", "美国运通", "金融服务"),
    "COCA COLA": ("KO", "可口可乐", "必选消费"),
    "ALPHABET": ("GOOGL", "谷歌", "互联网科技"),
    "BANK OF AMER": ("BAC", "美国银行", "传统金融"),
    "CHEVRON": ("CVX", "雪佛龙", "传统能源"),
    "OCCIDENTAL": ("OXY", "西方石油", "传统能源"),
    "CHUBB": ("CB", "安达保险", "保险金融"),
    "MOODY": ("MCO", "穆迪", "金融评级"),
    "KRAFT HEINZ": ("KHC", "卡夫亨氏", "食品消费"),
    "BERKSHIRE": ("BRK.B", "伯克希尔 B", "多元投资"),
    "PDD": ("PDD", "拼多多", "电商零售"),
    "TESLA": ("TSLA", "特斯拉", "新能源汽车"),
    "NVIDIA": ("NVDA", "英伟达", "算力芯片"),
    "MICROSOFT": ("MSFT", "微软", "云计算与AI"),
    "CREDO": ("CRDO", "Credo Technology", "高速互联芯片"),
    "UNITEDHEALTH": ("UNH", "联合健康", "医疗健康"),
    "DISNEY": ("DIS", "迪士尼", "娱乐传媒"),
    "EAST WEST": ("EWBC", "华美银行", "商业银行"),
    "CROCS": ("CROX", "卡骆驰", "服装鞋履"),
    "TENCENT MUSIC": ("TME", "腾讯音乐", "数字流媒体"),
    "PALANTIR": ("PLTR", "Palantir", "AI软件与大数据"),
    "PFIZER": ("PFE", "辉瑞制药", "医药制造"),
    "HALLIBURTON": ("HAL", "哈里伯顿", "油服设备"),
    "MOLINA": ("MOH", "莫利纳医疗", "医疗保险"),
    "LULULEMON": ("LULU", "露露柠檬", "运动服饰"),
    "BRUKER": ("BRKR", "布鲁克仪器", "科学分析仪器"),
    "BROADCOM": ("AVGO", "博通", "半导体通信"),
    "AMAZON": ("AMZN", "亚马逊", "云与电商"),
    "LAM RESEARCH": ("LRCX", "拉姆研究", "半导体设备"),
    "LEGEND BIOTECH": ("LEGN", "传奇生物", "创新生物药"),
    "FUTU": ("FUTU", "富途控股", "金融科技券商"),
    "ARRIVENT": ("AVBP", "ArriVent", "创新生物药"),
    "MARVELL": ("MRVL", "美满电子", "网络与存储芯片"),
    "VIPSHOP": ("VIPS", "唯品会", "特卖电商"),
    "ALIBABA": ("BABA", "阿里巴巴", "电商与云计算"),
    "SPDR S&P 500": ("SPY", "标普500 ETF", "宽基指数"),
    "PG&E": ("PCG", "太平洋煤气电力", "公共事业")
}

def resolve_ticker(cusip: str, name: str) -> Tuple[str, str, str]:
    """
    解析标的 CUSIP 或公司名称返回 (Ticker, 中文名, 所属行业)
    """
    clean_cusip = (cusip or "").strip()
    if clean_cusip in CUSIP_MAP:
        return CUSIP_MAP[clean_cusip]
    
    clean_name = (name or "").strip().upper()
    for kw, item in NAME_KEYWORD_MAP.items():
        if kw in clean_name:
            return item
    
    # Fallback to sanitized uppercase acronym
    words = [w for w in clean_name.replace(",", " ").replace(".", " ").replace("&", " ").split() if w not in ("INC", "CORP", "LTD", "PLC", "CO", "DEL", "HLDG", "HLDGS", "THE", "SPONSORED", "ADS", "CL", "A", "B", "C")]
    raw_sym = words[0][:5] if words else clean_name[:5]
    fallback_sym = "".join(c for c in raw_sym if c.isalnum() or c == ".")
    return (fallback_sym, clean_name.title(), "其他通用")
