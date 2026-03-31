"""Scraper agent — Wikipedia API (primary) + httpx/DDG (fallback)."""
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

_WEB_TIMEOUT = httpx.Timeout(8.0, connect=4.0)
_MAX_PAGES = 3


# ---------------------------------------------------------------------------
# Wikipedia API  (fast, reliable, no scraping needed)
# ---------------------------------------------------------------------------

async def _wikipedia_search(query: str, limit: int = 3) -> list[str]:
    """Return page titles matching the query via Wikipedia search API."""
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "format": "json",
        "srlimit": limit,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://en.wikipedia.org/w/api.php", params=params
            )
            data = resp.json()
            return [r["title"] for r in data.get("query", {}).get("search", [])]
    except Exception as exc:
        logger.warning("Wikipedia search error: %s", exc)
        return []


async def _wikipedia_extract(title: str, max_chars: int = 12000) -> str | None:
    """Fetch plaintext extract of a Wikipedia article."""
    params = {
        "action": "query",
        "prop": "extracts",
        "explaintext": True,
        "titles": title,
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://en.wikipedia.org/w/api.php", params=params
            )
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
    """
    Search Wikipedia for subject + topic, fetch up to 2 articles,
    and combine their text.
    """
    queries = [
        f"{subject} {topic}",
        subject,
        topic,
    ]

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
# DDG + web fallback
# ---------------------------------------------------------------------------

def _extract_ddg_url(href: str) -> str | None:
    """Resolve a DDG redirect href (//duckduckgo.com/l/?uddg=...) to the real URL."""
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


async def _search_ddg(query: str) -> list[str]:
    """Return up to _MAX_PAGES URLs from DuckDuckGo HTML search."""
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    urls: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=_WEB_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                seen: set[str] = set()
                for a in soup.select("a.result__a, a.result__url"):
                    real_url = _extract_ddg_url(a.get("href", ""))
                    if real_url and real_url not in seen and len(urls) < _MAX_PAGES:
                        urls.append(real_url)
                        seen.add(real_url)
                logger.info("DDG found %d URLs for: %s", len(urls), query)
    except Exception as exc:
        logger.warning("DDG search error: %s", exc)
    return urls


_JUNK_IMG = re.compile(
    r"icon|logo|favicon|avatar|button|banner|ad[_\-/]|sponsor|pixel|tracking|spacer|1x1|blank|emoji|badge|arrow",
    re.I,
)


def _extract_images(target, base_url: str) -> list[str]:
    """Extract up to 6 content images from the main content area."""
    images: list[str] = []
    seen: set[str] = set()
    for img in target.find_all("img", src=True):
        src = img.get("src", "").strip()
        if not src:
            continue
        # Resolve protocol-relative and absolute-path URLs
        if src.startswith("//"):
            src = "https:" + src
        elif src.startswith("/"):
            parsed = urlparse(base_url)
            src = f"{parsed.scheme}://{parsed.netloc}{src}"
        elif not src.startswith("http"):
            continue
        # Skip tiny icons, logos, tracking pixels
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
    """Remove chrome (nav/footer/scripts), return (text, image_urls)."""
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
    if len(text) < 300:
        return False
    junk = ["404", "page not found", "no results", "captcha",
            "access denied", "forbidden", "just a moment"]
    low = text.lower()
    if any(j in low for j in junk):
        return False
    keywords = [w for w in subject_name.lower().split() if len(w) > 3]
    return bool(keywords) and any(kw in low for kw in keywords)


async def _fetch_text(client: httpx.AsyncClient, url: str) -> tuple[str, list[str]] | None:
    try:
        resp = await asyncio.wait_for(
            client.get(url, follow_redirects=True),
            timeout=8.0,
        )
        ct = resp.headers.get("content-type", "")
        if resp.status_code == 200 and "text/html" in ct:
            return _clean_html(resp.text, base_url=str(resp.url))
    except Exception as exc:
        logger.warning("Fetch error for %s: %s", url, exc)
    return None


async def _fetch_web_content(subject_name: str, query: str) -> tuple[str, list[str]]:
    """DDG search + fetch pages. Returns (combined_text, image_urls)."""
    urls = await _search_ddg(query)
    if not urls:
        return "", []
    texts: list[str] = []
    all_images: list[str] = []
    seen_images: set[str] = set()
    async with httpx.AsyncClient(timeout=_WEB_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(*[_fetch_text(client, u) for u in urls])
    for result in results:
        if result is None:
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
    1. Wikipedia API  — fast, always available, covers all academic topics
    2. DDG web scrape — fallback for VTU-specific notes
    """
    # Resolve module topic from syllabus
    module_topic: str = ""
    if branch and semester:
        modules = get_modules(branch, semester, subject_name)
        if modules and 1 <= module_number <= len(modules):
            module_topic = modules[module_number - 1]
            logger.info("Module topic: '%s'", module_topic)

    topic_label = module_topic or f"module {module_number}"
    short_topic = " ".join(module_topic.split()[:4]) if module_topic else ""
    web_query = f"VTU {subject_name} {short_topic} notes".strip()

    # ── 1. Wikipedia (primary) ──────────────────────────────────────────────
    logger.info("Trying Wikipedia for: %s / %s", subject_name, topic_label)
    wiki_text = await _fetch_wikipedia_content(subject_name, module_topic or subject_name)
    if wiki_text and len(wiki_text) > 500:
        logger.info("Wikipedia success: %d chars", len(wiki_text))
        # Supplement with web pages for text + images
        try:
            web_text, web_images = await asyncio.wait_for(
                _fetch_web_content(subject_name, web_query), timeout=12.0
            )
            combined_text = (wiki_text + "\n\n===\n\n" + web_text) if web_text else wiki_text
            logger.info("Web supplement: %d chars, %d images", len(web_text), len(web_images))
            return combined_text, web_images
        except asyncio.TimeoutError:
            logger.info("Web supplement timed out — using Wikipedia only")
        return wiki_text, []

    # ── 2. Web fallback (DDG) ───────────────────────────────────────────────
    logger.info("Wikipedia insufficient, trying web fallback")
    try:
        web_text, web_images = await asyncio.wait_for(
            _fetch_web_content(subject_name, web_query), timeout=20.0
        )
        if web_text and len(web_text) > 100:
            logger.info("Web fallback success: %d chars, %d images", len(web_text), len(web_images))
            return web_text, web_images
    except asyncio.TimeoutError:
        logger.warning("Web fallback timed out for '%s' module %d", subject_name, module_number)

    raise RuntimeError(
        f"No content found for '{subject_name}' module {module_number}"
    )
