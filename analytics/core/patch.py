"""
API 请求伪装补丁
用于绕过反爬虫限制
"""

import os
import random
import socket
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
import requests
from .logger import logger

# 受信国内金融数据源域名（海外节点容易被拦截、丢包或封锁的目标源）
DOMESTIC_PROXIED_DOMAINS = (
    "eastmoney.com",
    "sina.com.cn",
    "sinajs.cn",
    "tencent.com",
    "gtimg.cn",
    "163.com",
    "cninfo.com.cn",
    "sse.com.cn",
    "szse.cn",
    "cls.cn",
    "akshare.xyz",
    "chinabond.com.cn",
    "chinamoney.com.cn",
    "csindex.com.cn",
    "xueqiu.com",
)

# 常见浏览器 UA (扩充列表)
USER_AGENTS = [
    # macOS - Chrome / Safari / Edge / Firefox
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/124.0",

    # Windows - Chrome / Edge / Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/121.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    
    # Linux - Chrome / Firefox
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
]

# 原始请求方法
_original_request = requests.Session.request

def _patched_request(self, method, url, *args, **kwargs):
    """
    打补丁后的请求方法
    自动添加随机 UA 和常用 Headers
    """
    headers = kwargs.get("headers", {})
    
    # 如果没有 UA，随机添加一个
    if "User-Agent" not in headers:
        headers["User-Agent"] = random.choice(USER_AGENTS)
    
    # 添加其他常用 Headers 伪装成真实浏览器
    if "Accept" not in headers:
        headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
    
    if "Accept-Language" not in headers:
        headers["Accept-Language"] = "zh-CN,zh;q=0.9,en;q=0.8"
    
    if "Accept-Encoding" not in headers:
        headers["Accept-Encoding"] = "gzip, deflate"
        
    if "Connection" not in headers:
        headers["Connection"] = "keep-alive"
        
    if "Cache-Control" not in headers:
        headers["Cache-Control"] = "max-age=0"

    # 针对东方财富的特定伪装 (仅在未显式指定时注入，避免覆盖第三方库自备的正确 Referer/Origin)
    if "eastmoney.com" in url or "em" in url:
        if "Referer" not in headers:
            headers["Referer"] = "https://quote.eastmoney.com/center/gridlist.html"
        if "Origin" not in headers:
            headers["Origin"] = "https://quote.eastmoney.com"

    if "Upgrade-Insecure-Requests" not in headers:
        headers["Upgrade-Insecure-Requests"] = "1"

    kwargs["headers"] = headers
    
    # 增加超时设置 (如果未设置)
    if "timeout" not in kwargs:
        kwargs["timeout"] = 15

    # 4. 判断是否需要通过 Cloudflare Worker 进行透明中继加速 (仅在配置了中继且目标为国内受信源时生效)
    proxy_url = os.getenv("CF_WORKER_PROXY_URL")
    proxy_secret = os.getenv("CF_WORKER_SECRET_KEY")

    should_proxy = False
    full_target_url = url
    if proxy_url and proxy_secret and not str(url).startswith(proxy_url):
        try:
            parsed_url = urlparse(str(url))
            hostname = (parsed_url.hostname or "").lower()
            if any(hostname == d or hostname.endswith("." + d) for d in DOMESTIC_PROXIED_DOMAINS):
                should_proxy = True
                params = kwargs.pop("params", None)
                if params:
                    q = dict(parse_qsl(parsed_url.query))
                    if isinstance(params, dict):
                        q.update(params)
                    elif isinstance(params, (list, tuple)):
                        q.update(dict(params))
                    new_query = urlencode(q)
                    full_target_url = urlunparse((
                        parsed_url.scheme,
                        parsed_url.netloc,
                        parsed_url.path,
                        parsed_url.params,
                        new_query,
                        parsed_url.fragment
                    ))
        except Exception:
            should_proxy = False

    if should_proxy:
        headers["X-Target-URL"] = full_target_url
        headers["X-Proxy-Secret"] = proxy_secret
        try:
            resp = _original_request(self, method, proxy_url, *args, **kwargs)
            if resp.status_code in (200, 304):
                return resp
            logger.warning(f"⚠️ [Proxy] Worker 代理返回状态码 {resp.status_code}，降级走直连: {full_target_url}")
        except Exception as proxy_err:
            logger.warning(f"⚠️ [Proxy] Worker 代理中继异常: {proxy_err}，降级走直连: {full_target_url}")
        
        # 降级：若代理未返回 200 或网络异常，移除代理请求头，回退直连
        headers.pop("X-Target-URL", None)
        headers.pop("X-Proxy-Secret", None)
        
    return _original_request(self, method, full_target_url, *args, **kwargs)

def apply_patches():
    """应用所有补丁"""
    logger.info("正在应用 API 伪装与网络防护补丁...")

    # 1. 设置进程级默认 Socket 超时 (15秒)
    # 防止第三方库 (如 akshare/urllib/requests) 在海外服务器请求国内金融源因跨境丢包/黑洞导致底层连接永久挂死
    socket.setdefaulttimeout(15.0)
    logger.info("已设置全局 Socket 默认超时: 15s")
    
    # 2. Monkey Patch requests.Session.request
    requests.Session.request = _patched_request
    logger.info("已注入随机 User-Agent 和浏览器 Headers")
    
    logger.info("API 伪装与防护补丁已生效")
