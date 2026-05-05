"""
scraper_agent.py — Web scraper + Deep PDF Extractor for Sarvagna.

scrape_content()    — original: fetch HTML from topic URLs, return text chunks
deep_scrape_pdfs()  — new: find all academic PDF links on a page, download
                      concurrently, return ScrapedPDF objects ready for the
                      standard upload pipeline.
resolve_all_links() — preview: return every link on a page (PDF + download +
                      drive + raw) for the scrape-links endpoint.
"""
import asyncio
import hashlib
import logging
import re
import urllib.parse
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64
MAX_RETRIES = 3
PDF_DOWNLOAD_TIMEOUT = 60.0
MAX_CONCURRENT_DOWNLOADS = 4

# ── Browser impersonation headers ─────────────────────────────────────────────

_DESKTOP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.google.com/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Upgrade-Insecure-Requests": "1",
}

_MOBILE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
        "Version/17.0 Mobile/15E148 Safari/604.1"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}

# Legacy alias used by deep_scrape_pdfs download client
HEADERS = _DESKTOP_HEADERS

# ── Keyword sets ──────────────────────────────────────────────────────────────

_ACADEMIC_KEYWORDS = {
    "notes", "qp", "question", "paper", "textbook", "model", "syllabus",
    "lecture", "module", "unit", "assignment", "lab", "manual", "study",
    "material", "resource", "previous", "year", "exam", "vtu",
    "download", "pdf", "subject", "semester", "sem", "cse", "ece", "me",
    "cv", "is", "ch", "scheme", "regulation", "cbcs", "18cs", "21cs",
    "18ec", "21ec", "18me", "21me", "question-bank", "qbank",
}

# Keywords in link TEXT that suggest a downloadable/viewable resource
_DOWNLOAD_TEXT_KEYWORDS = {
    "download", "view", "drive", "open", "get", "access", "click here",
    "pdf", "notes", "material", "file", "document", "read",
}

# ── Blocked auto-download hosts (auth required) ───────────────────────────────
# These are excluded from deep_scrape_pdfs but shown in preview.

_BLOCKED_HOSTS = {
    "drive.google.com",
    "docs.google.com",
    "accounts.google.com",
    "onedrive.live.com",
    "sharepoint.com",
    "box.com",
    "wetransfer.com",
}


@dataclass
class ScrapedPDF:
    url: str
    filename: str
    content: bytes
    sha256: str


# ── Page fetch with mobile fallback ──────────────────────────────────────────

async def _fetch_page(url: str) -> str:
    """
    Fetch page HTML using desktop UA.
    If response < 1000 chars (bot-block / JS splash), retry with mobile UA.
    Returns raw HTML string (may be empty on total failure).
    """
    for headers in (_DESKTOP_HEADERS, _MOBILE_HEADERS):
        try:
            async with httpx.AsyncClient(
                headers=headers, timeout=10, follow_redirects=True, verify=False
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                html = resp.text
                if len(html) >= 1000:
                    logger.info("fetch_page: %d chars from %s", len(html), url)
                    return html
                logger.info("fetch_page: page too small (%d chars), retrying with alt UA", len(html))
        except Exception as e:
            logger.warning("fetch_page error with %s UA: %s", headers.get("User-Agent", "")[:30], e)
    return ""


# ── Link resolution helpers ───────────────────────────────────────────────────

def _is_blocked(url: str) -> bool:
    try:
        host = urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
        return any(blocked in host for blocked in _BLOCKED_HOSTS)
    except Exception:
        return True


def _is_academic(href: str, link_text: str) -> bool:
    combined = (href + " " + link_text).lower()
    return any(kw in combined for kw in _ACADEMIC_KEYWORDS)


def _is_download_link(href: str, link_text: str) -> bool:
    combined = (href + " " + link_text).lower()
    return any(kw in combined for kw in _DOWNLOAD_TEXT_KEYWORDS)


def _has_pdf(abs_url: str) -> bool:
    parsed = urllib.parse.urlparse(abs_url)
    return parsed.path.lower().endswith(".pdf") or ".pdf" in parsed.query.lower()


_PDF_URL_RE = re.compile(r'https?://[^\s\'"<>]+\.pdf(?:[?#][^\s\'"<>]*)?', re.IGNORECASE)


def _resolve_pdf_links(
    html: str,
    base_url: str,
    academic_only: bool = True,
) -> list[tuple[str, str]]:
    """
    Pass 1: <a href> tags ending in .pdf
    Pass 2: raw .pdf URLs embedded in JS/script/data attrs
    academic_only=True  → also filter by _is_academic()
    academic_only=False → all PDF URLs (user picks in preview)
    """
    soup = BeautifulSoup(html, "lxml")
    seen: set[str] = set()
    results: list[tuple[str, str]] = []

    def _add(abs_url: str, label: str) -> None:
        if abs_url in seen:
            return
        if _is_blocked(abs_url):
            return
        if academic_only and not _is_academic(abs_url, label):
            return
        seen.add(abs_url)
        results.append((abs_url, label))

    # Pass 1: <a href>
    for tag in soup.find_all("a", href=True):
        href: str = tag["href"].strip()
        label: str = tag.get_text(strip=True)
        abs_url = urllib.parse.urljoin(base_url, href)
        if _has_pdf(abs_url):
            _add(abs_url, label)

    # Pass 2: raw PDF URLs in page source (JS-rendered pages embed them as strings)
    for match in _PDF_URL_RE.finditer(html):
        candidate = match.group(0).rstrip(".,;)")
        if not _is_blocked(candidate):
            _add(candidate, urllib.parse.urlparse(candidate).path.split("/")[-1])

    return results


def resolve_all_links(
    html: str,
    base_url: str,
) -> list[tuple[str, str, str]]:
    """
    Returns (url, title, link_type) for ALL links on the page:
      'pdf'      — direct .pdf URL
      'download' — any link whose text/href contains download/drive/view keywords
      'page'     — everything else (raw fallback, for debug)

    Order: pdf first, download second, page last.
    Blocked hosts (drive.google.com etc.) are INCLUDED here so the user can
    see and open them manually — they're only excluded from auto-download.
    """
    soup = BeautifulSoup(html, "lxml")
    seen: set[str] = set()
    pdf_links:      list[tuple[str, str, str]] = []
    download_links: list[tuple[str, str, str]] = []
    page_links:     list[tuple[str, str, str]] = []

    for tag in soup.find_all("a", href=True):
        href: str = tag["href"].strip()
        if not href or href.startswith("#") or href.startswith("javascript"):
            continue
        label: str = tag.get_text(strip=True) or href
        abs_url = urllib.parse.urljoin(base_url, href)
        try:
            urllib.parse.urlparse(abs_url)  # validate
        except Exception:
            continue
        if abs_url in seen:
            continue
        seen.add(abs_url)

        if _has_pdf(abs_url):
            pdf_links.append((abs_url, label, "pdf"))
        elif _is_download_link(href, label):
            download_links.append((abs_url, label, "download"))
        else:
            page_links.append((abs_url, label, "page"))

    # Also add raw .pdf URLs from JS source (pass 2)
    for match in _PDF_URL_RE.finditer(html):
        candidate = match.group(0).rstrip(".,;)")
        if candidate not in seen:
            seen.add(candidate)
            fname = urllib.parse.urlparse(candidate).path.split("/")[-1]
            pdf_links.append((candidate, fname, "pdf"))

    return pdf_links + download_links + page_links


# ── PDF download ──────────────────────────────────────────────────────────────

def _build_query(subject_name: str, module_title: str, topics: list[str]) -> str:
    parts = [subject_name, module_title] + topics[:2]
    return " ".join(parts)


def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.find("div", class_="content") or soup.body
    return " ".join(main.get_text(separator=" ").split()) if main else ""


def _chunk_text(text: str) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunks.append(text[start:end])
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c for c in chunks if len(c.strip()) > 50]


async def _download_pdf(
    semaphore: asyncio.Semaphore,
    client: httpx.AsyncClient,
    url: str,
) -> ScrapedPDF | None:
    async with semaphore:
        try:
            resp = await client.get(url, timeout=PDF_DOWNLOAD_TIMEOUT, follow_redirects=True, headers=HEADERS)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if "pdf" not in content_type and not url.lower().split("?")[0].endswith(".pdf"):
                logger.warning("Non-PDF content-type at %s: %s", url, content_type)
                return None

            content = resp.content
            if len(content) < 1024:
                return None  # login redirect

            filename = url.split("/")[-1].split("?")[0] or "document.pdf"
            if not filename.endswith(".pdf"):
                filename += ".pdf"

            sha = hashlib.sha256(content).hexdigest()
            logger.info("Downloaded PDF: %s (%d bytes)", filename, len(content))
            return ScrapedPDF(url=url, filename=filename, content=content, sha256=sha)

        except Exception as e:
            logger.warning("PDF download failed for %s: %s", url, e)
            return None


async def deep_scrape_pdfs(page_url: str, max_pdfs: int = 5) -> list[ScrapedPDF]:
    """
    Fetch page_url, find academic PDF links, download concurrently.
    Returns up to max_pdfs ScrapedPDF objects. Skips login-required hosts.
    """
    if _is_blocked(page_url):
        return []

    html = await _fetch_page(page_url)
    if not html:
        logger.warning("deep_scrape_pdfs: failed to fetch %s", page_url)
        return []

    links = _resolve_pdf_links(html, page_url, academic_only=True)
    if not links:
        logger.info("deep_scrape_pdfs: no academic PDF links on %s", page_url)
        return []

    links = links[:max_pdfs * 2]
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)
    async with httpx.AsyncClient(follow_redirects=True, verify=False, timeout=10) as client:
        tasks = [_download_pdf(semaphore, client, url) for url, _ in links]
        results = await asyncio.gather(*tasks)

    pdfs = [r for r in results if r is not None][:max_pdfs]
    logger.info("deep_scrape_pdfs: %d PDFs from %s", len(pdfs), page_url)
    return pdfs


# ── Legacy helpers ────────────────────────────────────────────────────────────

async def _fetch_with_retry(client: httpx.AsyncClient, url: str) -> str | None:
    for attempt in range(MAX_RETRIES):
        try:
            response = await client.get(url, timeout=15, follow_redirects=True)
            if response.status_code == 200:
                return response.text
        except (httpx.RequestError, httpx.TimeoutException) as e:
            logger.warning("Fetch attempt %d failed for %s: %s", attempt + 1, url, e)
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2 ** attempt)
    return None


def _build_urls(query: str, topics: list[str]) -> list[str]:
    encoded = urllib.parse.quote_plus(query)
    first_topic = urllib.parse.quote(topics[0].replace(" ", "_")) if topics else urllib.parse.quote_plus(query)
    return [
        f"https://vturesource.com/search?q={encoded}",
        f"https://www.geeksforgeeks.org/search/?q={encoded}",
        f"https://en.wikipedia.org/wiki/{first_topic}",
    ]


async def scrape_content(subject_name: str, module_title: str, topics: list[str]) -> list[str]:
    query = _build_query(subject_name, module_title, topics)
    urls = _build_urls(query, topics)
    all_chunks: list[str] = []

    async with httpx.AsyncClient(headers=_DESKTOP_HEADERS) as client:
        for url in urls:
            html = await _fetch_with_retry(client, url)
            if not html:
                continue
            text = _extract_text(html)
            if len(text) < 100:
                continue
            chunks = _chunk_text(text)
            all_chunks.extend(chunks)
            logger.info("Scraped %d chunks from %s", len(chunks), url)

    return all_chunks
