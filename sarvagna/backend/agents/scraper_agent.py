"""
Scraper agent — VTU sites (primary) → Wikipedia → DuckDuckGo (fallback).

Priority:
  1. Scrape all 5 VTU-specific sites in parallel
  2. If combined content >= 500 chars → use it
  3. Else → Wikipedia API
  4. Else → DuckDuckGo HTML search
"""
import asyncio
import logging
import re
from urllib.parse import quote_plus, urlparse, parse_qs, unquote

import httpx
from bs4 import BeautifulSoup

from core.config import get_settings
from services.syllabus_loader import get_modules

logger = logging.getLogger(__name__)
settings = get_settings()

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

_WEB_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
_PAGE_TIMEOUT = 10.0   # per-page asyncio.wait_for timeout
_MIN_CONTENT = 300     # chars below which a page is considered junk

_JUNK_IMG = re.compile(
    r"icon|logo|favicon|avatar|button|banner|ad[_\-/]|sponsor|pixel|tracking|spacer|1x1|blank|emoji|badge|arrow",
    re.I,
)

# ---------------------------------------------------------------------------
# VTU site search URLs  (all WordPress-style ?s= search)
# ---------------------------------------------------------------------------

_VTU_SITES: list[tuple[str, str]] = [
    ("vtucircle",          "https://vtucircle.com/?s={q}"),
    ("vtuadda",            "https://vtuadda.com/?s={q}"),
    ("vtudeveloper",       "https://vtudeveloper.in/?s={q}"),
    ("vturesource",        "https://vturesource.com/?s={q}"),
    ("takeiteasy",         "https://takeiteasyengineers.com/?s={q}"),
]


# ---------------------------------------------------------------------------
# Shared HTML helpers
# ---------------------------------------------------------------------------

def _extract_images(target, base_url: str) -> list[str]:
    images: list[str] = []
    seen: set[str] = set()
    for img in target.find_all("img", src=True):
        src = img.get("src", "").strip()
        if not src:
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            parsed = urlparse(base_url)
            src = f"{parsed.scheme}://{parsed.netloc}{src}"
        elif not src.startswith("http"):
            continue
        if _JUNK_IMG.search(src):
            continue
        if src.lower().endswith((".gif", ".svg", ".ico", ".webp")):
            continue
        alt = img.get("alt", "").lower()
        if _JUNK_IMG.search(alt):
            continue
        if src not in seen:
            seen.add(src)
            images.append(src)
        if len(images) >= 6:
            break
    return images


def _clean_html(html: str, base_url: str = "") -> tuple[str, list[str]]:
    """Strip chrome, return (text, image_urls)."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header",
                     "aside", "noscript", "form", "button", "iframe"]):
        tag.decompose()
    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id=re.compile(r"content|main|post|article", re.I))
        or soup.find(class_=re.compile(r"content|main|post|entry|article", re.I))
    )
    target = main if main else (soup.find("body") or soup)
    text = target.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    images = _extract_images(target, base_url) if base_url else []
    return text, images


def _is_useful(text: str, subject_name: str) -> bool:
    if len(text) < _MIN_CONTENT:
        return False
    junk = ["404", "page not found", "no results", "captcha",
            "access denied", "forbidden", "just a moment"]
    low = text.lower()
    if any(j in low for j in junk):
        return False
    keywords = [w for w in subject_name.lower().split() if len(w) > 3]
    return bool(keywords) and any(kw in low for kw in keywords)


async def _fetch_page(
    client: httpx.AsyncClient,
    url: str,
) -> tuple[str, list[str]] | None:
    """Fetch a single URL and return (text, images) or None."""
    try:
        resp = await asyncio.wait_for(
            client.get(url, follow_redirects=True),
            timeout=_PAGE_TIMEOUT,
        )
        ct = resp.headers.get("content-type", "")
        if resp.status_code == 200 and "text/html" in ct:
            return _clean_html(resp.text, base_url=str(resp.url))
    except Exception as exc:
        logger.debug("Fetch error %s: %s", url, exc)
    return None


# ---------------------------------------------------------------------------
# VTU site scraper
# ---------------------------------------------------------------------------

async def _scrape_vtu_site(
    client: httpx.AsyncClient,
    site_name: str,
    search_url_template: str,
    query: str,
    subject_name: str,
) -> tuple[str, list[str]]:
    """
    Search one VTU site, follow up to 2 result links, return (text, images).
    Returns ("", []) if nothing useful found.
    """
    search_url = search_url_template.format(q=quote_plus(query))
    try:
        resp = await asyncio.wait_for(
            client.get(search_url, follow_redirects=True),
            timeout=_PAGE_TIMEOUT,
        )
        if resp.status_code != 200 or "text/html" not in resp.headers.get("content-type", ""):
            return "", []

        soup = BeautifulSoup(resp.text, "html.parser")
        base = str(resp.url)
        parsed_base = urlparse(base)
        site_domain = parsed_base.netloc

        # Collect links that look like article/note pages (on the same domain)
        links: list[str] = []
        seen: set[str] = set()
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href.startswith("http"):
                continue
            if urlparse(href).netloc != site_domain:
                continue
            # Skip pagination / category / tag / author pages
            if re.search(r"/page/|/category/|/tag/|/author/|\?s=|\?p=\d+$", href, re.I):
                continue
            if href not in seen:
                seen.add(href)
                links.append(href)
            if len(links) >= 3:
                break

        if not links:
            logger.debug("%s: no result links found for '%s'", site_name, query)
            return "", []

        texts: list[str] = []
        all_images: list[str] = []
        seen_images: set[str] = set()

        fetch_tasks = [_fetch_page(client, link) for link in links[:2]]
        results = await asyncio.gather(*fetch_tasks, return_exceptions=True)

        for result in results:
            if not isinstance(result, tuple):
                continue
            text, images = result
            if text and _is_useful(text, subject_name):
                texts.append(text)
                for img in images:
                    if img not in seen_images:
                        seen_images.add(img)
                        all_images.append(img)

        combined = "\n\n===\n\n".join(texts)
        if combined:
            logger.info("%s: found %d chars for '%s'", site_name, len(combined), query)
        return combined, all_images[:6]

    except asyncio.TimeoutError:
        logger.debug("%s: timed out for '%s'", site_name, query)
        return "", []
    except Exception as exc:
        logger.debug("%s: error for '%s': %s", site_name, query, exc)
        return "", []


async def _fetch_all_vtu_sites(
    subject_name: str,
    query: str,
) -> tuple[str, list[str]]:
    """
    Search all VTU sites in parallel.
    Returns combined (text, images) from every site that responded.
    """
    async with httpx.AsyncClient(
        timeout=_WEB_TIMEOUT, headers=_HEADERS, follow_redirects=True
    ) as client:
        tasks = [
            _scrape_vtu_site(client, name, url_tpl, query, subject_name)
            for name, url_tpl in _VTU_SITES
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    texts: list[str] = []
    all_images: list[str] = []
    seen_images: set[str] = set()

    for result in results:
        if not isinstance(result, tuple):
            continue
        text, images = result
        if text:
            texts.append(text)
            for img in images:
                if img not in seen_images:
                    seen_images.add(img)
                    all_images.append(img)

    return "\n\n===\n\n".join(texts), all_images[:8]


# ---------------------------------------------------------------------------
# Wikipedia fallback
# ---------------------------------------------------------------------------

async def _wikipedia_search(query: str, limit: int = 3) -> list[str]:
    params = {
        "action": "query", "list": "search",
        "srsearch": query, "format": "json", "srlimit": limit,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://en.wikipedia.org/w/api.php", params=params)
            data = resp.json()
            return [r["title"] for r in data.get("query", {}).get("search", [])]
    except Exception as exc:
        logger.warning("Wikipedia search error: %s", exc)
        return []


async def _wikipedia_extract(title: str, max_chars: int = 12000) -> str | None:
    params = {
        "action": "query", "prop": "extracts",
        "explaintext": True, "titles": title, "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://en.wikipedia.org/w/api.php", params=params)
            data = resp.json()
            pages = data.get("query", {}).get("pages", {})
            for page in pages.values():
                text = page.get("extract", "")
                if text and len(text) > 300:
                    return text[:max_chars]
    except Exception as exc:
        logger.warning("Wikipedia extract error for '%s': %s", title, exc)
    return None


async def _fetch_wikipedia_content(subject: str, topic: str) -> str:
    queries = [f"{subject} {topic}", subject, topic]
    seen_titles: set[str] = set()
    texts: list[str] = []
    for q in queries:
        if len(texts) >= 2:
            break
        titles = await _wikipedia_search(q, limit=2)
        for title in titles:
            if title in seen_titles or len(texts) >= 2:
                continue
            seen_titles.add(title)
            text = await _wikipedia_extract(title)
            if text:
                logger.info("Wikipedia: fetched '%s' (%d chars)", title, len(text))
                texts.append(f"# {title}\n\n{text}")
    return "\n\n---\n\n".join(texts)


# ---------------------------------------------------------------------------
# DuckDuckGo fallback
# ---------------------------------------------------------------------------

def _extract_ddg_url(href: str) -> str | None:
    if not href:
        return None
    if href.startswith("//"):
        href = "https:" + href
    if not href.startswith("http"):
        return None
    parsed = urlparse(href)
    if "duckduckgo.com" in parsed.netloc:
        uddg = parse_qs(parsed.query).get("uddg", [""])[0]
        return unquote(uddg) if uddg else None
    return href


async def _search_ddg(query: str, max_urls: int = 3) -> list[str]:
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    urls: list[str] = []
    try:
        async with httpx.AsyncClient(
            timeout=_WEB_TIMEOUT, headers=_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                seen: set[str] = set()
                for a in soup.select("a.result__a, a.result__url"):
                    real_url = _extract_ddg_url(a.get("href", ""))
                    if real_url and real_url not in seen and len(urls) < max_urls:
                        urls.append(real_url)
                        seen.add(real_url)
                logger.info("DDG found %d URLs for: %s", len(urls), query)
    except Exception as exc:
        logger.warning("DDG search error: %s", exc)
    return urls


async def _fetch_ddg_content(
    subject_name: str, query: str
) -> tuple[str, list[str]]:
    urls = await _search_ddg(query)
    if not urls:
        return "", []
    texts: list[str] = []
    all_images: list[str] = []
    seen_images: set[str] = set()
    async with httpx.AsyncClient(
        timeout=_WEB_TIMEOUT, headers=_HEADERS, follow_redirects=True
    ) as client:
        results = await asyncio.gather(
            *[_fetch_page(client, u) for u in urls], return_exceptions=True
        )
    for result in results:
        if not isinstance(result, tuple):
            continue
        text, images = result
        if text and _is_useful(text, subject_name):
            texts.append(text)
            for img in images:
                if img not in seen_images:
                    seen_images.add(img)
                    all_images.append(img)
    return "\n\n===\n\n".join(texts), all_images[:8]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def scrape_subject(
    subject_name: str,
    module_number: int,
    branch: str = "",
    semester: int = 0,
) -> tuple[str, list[str]]:
    """
    Fetch study content for a VTU subject module.
    Returns (text, image_urls).

    Strategy:
    1. All 5 VTU sites scraped in parallel (primary)
    2. Wikipedia API (fallback — only if VTU sites returned < 500 chars)
    3. DuckDuckGo web search (last resort — only if Wikipedia also fails)
    """
    # Resolve module topic from syllabus
    module_topic: str = ""
    if branch and semester:
        modules = get_modules(branch, semester, subject_name)
        if modules and 1 <= module_number <= len(modules):
            module_topic = modules[module_number - 1]
            logger.info("Module topic: '%s'", module_topic)

    topic_label = module_topic or f"module {module_number}"
    # Short query for VTU sites: subject + first 4 words of topic
    short_topic = " ".join(module_topic.split()[:4]) if module_topic else ""
    vtu_query = f"VTU {subject_name} {short_topic} notes".strip()
    web_query = vtu_query  # same query used for DDG

    # ── 1. VTU sites (primary) ──────────────────────────────────────────────
    logger.info("Scraping VTU sites for: %s / %s", subject_name, topic_label)
    try:
        vtu_text, vtu_images = await asyncio.wait_for(
            _fetch_all_vtu_sites(subject_name, vtu_query),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        logger.warning("VTU sites timed out for '%s' module %d", subject_name, module_number)
        vtu_text, vtu_images = "", []

    if vtu_text and len(vtu_text) >= 500:
        logger.info("VTU sites success: %d chars, %d images", len(vtu_text), len(vtu_images))
        return vtu_text, vtu_images

    logger.info(
        "VTU sites returned %d chars — trying Wikipedia fallback",
        len(vtu_text),
    )

    # ── 2. Wikipedia (fallback) ─────────────────────────────────────────────
    try:
        wiki_text = await asyncio.wait_for(
            _fetch_wikipedia_content(subject_name, module_topic or subject_name),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        logger.warning("Wikipedia timed out")
        wiki_text = ""

    if wiki_text and len(wiki_text) >= 500:
        logger.info("Wikipedia success: %d chars", len(wiki_text))
        # Merge with whatever VTU content we had (may be partial)
        combined_text = (vtu_text + "\n\n===\n\n" + wiki_text) if vtu_text else wiki_text
        return combined_text, vtu_images

    logger.info("Wikipedia insufficient — trying DuckDuckGo last resort")

    # ── 3. DuckDuckGo (last resort) ─────────────────────────────────────────
    try:
        ddg_text, ddg_images = await asyncio.wait_for(
            _fetch_ddg_content(subject_name, web_query),
            timeout=20.0,
        )
    except asyncio.TimeoutError:
        logger.warning("DDG timed out for '%s' module %d", subject_name, module_number)
        ddg_text, ddg_images = "", []

    # Merge everything we have
    parts = [p for p in [vtu_text, wiki_text, ddg_text] if p]
    all_images = vtu_images + [img for img in ddg_images if img not in set(vtu_images)]

    if parts:
        combined = "\n\n===\n\n".join(parts)
        logger.info(
            "Final combined: %d chars, %d images for '%s' module %d",
            len(combined), len(all_images), subject_name, module_number,
        )
        return combined, all_images[:8]

    raise RuntimeError(
        f"No content found for '{subject_name}' module {module_number} "
        f"from any source (VTU sites, Wikipedia, DDG)"
    )
