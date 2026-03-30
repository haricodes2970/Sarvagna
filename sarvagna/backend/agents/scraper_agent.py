"""Scraper agent — uses httpx + BeautifulSoup4 to fetch VTU study content."""
import asyncio
import logging
import re
from urllib.parse import quote_plus

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

_TIMEOUT = 20
_MAX_PAGES = 4
_MAX_RETRIES = 2


def _clean_html(html: str) -> str:
    """Remove chrome (nav/footer/scripts) and return main body text."""
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header",
                      "aside", "noscript", "form", "button", "iframe",
                      "advertisement", "ads"]):
        tag.decompose()

    # Prefer main content container
    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id=re.compile(r"content|main|post|article", re.I))
        or soup.find(class_=re.compile(r"content|main|post|entry|article", re.I))
    )
    target = main if main else (soup.find("body") or soup)
    text = target.get_text(separator="\n", strip=True)
    # Collapse excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _is_useful(text: str, subject_name: str) -> bool:
    """Return True if text looks like real academic content."""
    if len(text) < 300:
        return False
    junk = [
        "404", "page not found", "no results", "search results for",
        "captcha", "access denied", "forbidden", "just a moment",
    ]
    low = text.lower()
    if any(j in low for j in junk):
        return False
    keywords = [w for w in subject_name.lower().split() if len(w) > 3]
    return bool(keywords) and any(kw in low for kw in keywords)


async def _search_ddg(query: str) -> list[str]:
    """Return up to _MAX_PAGES URLs from DuckDuckGo HTML search."""
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    urls: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                for a in soup.select("a.result__url, .result__a"):
                    href = a.get("href", "")
                    if href.startswith("http") and len(urls) < _MAX_PAGES:
                        urls.append(href)
    except Exception as exc:
        logger.warning("DDG search error: %s", exc)
    return urls


async def _fetch_text(client: httpx.AsyncClient, url: str) -> str | None:
    """Fetch a URL and return cleaned text, or None on failure."""
    try:
        resp = await client.get(url, timeout=_TIMEOUT, follow_redirects=True)
        ct = resp.headers.get("content-type", "")
        if resp.status_code == 200 and "text/html" in ct:
            return _clean_html(resp.text)
    except Exception as exc:
        logger.warning("Fetch error for %s: %s", url, exc)
    return None


async def scrape_subject(
    subject_name: str,
    module_number: int,
    branch: str = "",
    semester: int = 0,
) -> str:
    """
    Scrape VTU study content for a subject module via httpx + BeautifulSoup.
    Uses DuckDuckGo search to find relevant pages, then fetches and cleans them.
    Returns combined text or raises RuntimeError if nothing useful is found.
    """
    # Build a targeted query using the syllabus topic if available
    module_topic: str | None = None
    if branch and semester:
        modules = get_modules(branch, semester, subject_name)
        if modules and 1 <= module_number <= len(modules):
            module_topic = modules[module_number - 1]
            logger.info("Syllabus topic for module %d: '%s'", module_number, module_topic)

    if module_topic:
        query = f"VTU {subject_name} {module_topic} notes"
    else:
        query = f"VTU {subject_name} module {module_number} notes"

    logger.info("Scraping with query: %s", query)

    for attempt in range(1, _MAX_RETRIES + 1):
        logger.info("Scrape attempt %d/%d", attempt, _MAX_RETRIES)
        urls = await _search_ddg(query)
        if not urls:
            logger.warning("No search results on attempt %d", attempt)
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(2)
            continue

        texts: list[str] = []
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            results = await asyncio.gather(*[_fetch_text(client, u) for u in urls])

        for text in results:
            if text and _is_useful(text, subject_name):
                texts.append(text)

        if texts:
            combined = "\n\n===\n\n".join(texts)
            logger.info("Scraped %d useful pages for '%s' module %d", len(texts), subject_name, module_number)
            return combined

        logger.warning("No useful content on attempt %d", attempt)
        if attempt < _MAX_RETRIES:
            await asyncio.sleep(2)

    raise RuntimeError(
        f"Scraping failed for '{subject_name}' module {module_number} after {_MAX_RETRIES} attempts"
    )
