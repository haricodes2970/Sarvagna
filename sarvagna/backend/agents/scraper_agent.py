"""
scraper_agent.py — Web scraper + Deep PDF Extractor for Sarvagna.

scrape_content()    — original: fetch HTML from topic URLs, return text chunks
deep_scrape_pdfs()  — new: find all academic PDF links on a page, download
                      concurrently, return (bytes, filename) tuples ready for
                      the standard upload pipeline.
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
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Sarvagna/1.0)"}
TIMEOUT = 15.0
PDF_DOWNLOAD_TIMEOUT = 60.0
MAX_CONCURRENT_DOWNLOADS = 4

# Keywords in href / link text that suggest academic PDFs
_ACADEMIC_KEYWORDS = {
    "notes", "qp", "question", "paper", "textbook", "model", "syllabus",
    "lecture", "module", "unit", "assignment", "lab", "manual", "study",
    "material", "resource", "previous", "year", "exam", "vtu",
    "download", "pdf", "subject", "semester", "sem", "cse", "ece", "me",
    "cv", "is", "ch", "scheme", "regulation", "cbcs", "18cs", "21cs",
    "18ec", "21ec", "18me", "21me", "scheme", "question-bank", "qbank",
}

# Hosts that require authentication — skip their PDF links
_BLOCKED_HOSTS = {
    "drive.google.com",
    "docs.google.com",
    "accounts.google.com",
    "dropbox.com",
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


def _is_blocked(url: str) -> bool:
    try:
        host = urllib.parse.urlparse(url).netloc.lower().lstrip("www.")
        return any(blocked in host for blocked in _BLOCKED_HOSTS)
    except Exception:
        return True


def _is_academic(href: str, link_text: str) -> bool:
    combined = (href + " " + link_text).lower()
    return any(kw in combined for kw in _ACADEMIC_KEYWORDS)


def _has_pdf(abs_url: str) -> bool:
    """True if URL points to a PDF (path or query string)."""
    parsed = urllib.parse.urlparse(abs_url)
    path = parsed.path.lower()
    query = parsed.query.lower()
    return path.endswith(".pdf") or ".pdf" in query


_PDF_URL_RE = re.compile(r'https?://[^\s\'"<>]+\.pdf(?:[?#][^\s\'"<>]*)?', re.IGNORECASE)


def _resolve_pdf_links(
    html: str,
    base_url: str,
    academic_only: bool = True,
) -> list[tuple[str, str]]:
    """
    Parse PDF links from HTML via <a> tags AND raw URL extraction from JS/text.

    academic_only=True  → filter by _is_academic() (used by deep_scrape_pdfs)
    academic_only=False → return all PDF links (used by scrape-links preview)
    """
    soup = BeautifulSoup(html, "lxml")
    seen: set[str] = set()
    results: list[tuple[str, str]] = []

    def _add(abs_url: str, label: str) -> None:
        if abs_url in seen:
            return
        if _is_blocked(abs_url):
            logger.debug("Skipping blocked host: %s", abs_url)
            return
        if academic_only and not _is_academic(abs_url, label):
            logger.debug("Skipping non-academic: %s", abs_url)
            return
        seen.add(abs_url)
        results.append((abs_url, label))

    # Pass 1: <a href> tags
    for tag in soup.find_all("a", href=True):
        href: str = tag["href"].strip()
        label: str = tag.get_text(strip=True)
        abs_url = urllib.parse.urljoin(base_url, href)
        if _has_pdf(abs_url):
            _add(abs_url, label)

    # Pass 2: raw PDF URLs in JS / data attributes / script text
    # catches JS-rendered pages that embed URLs in inline scripts
    raw_text = html
    for match in _PDF_URL_RE.finditer(raw_text):
        candidate = match.group(0).rstrip(".,;)")
        if not _is_blocked(candidate):
            _add(candidate, urllib.parse.urlparse(candidate).path.split("/")[-1])

    return results


async def _download_pdf(
    semaphore: asyncio.Semaphore,
    client: httpx.AsyncClient,
    url: str,
) -> ScrapedPDF | None:
    """Download one PDF, enforcing concurrency limit via semaphore."""
    async with semaphore:
        try:
            resp = await client.get(
                url,
                timeout=PDF_DOWNLOAD_TIMEOUT,
                follow_redirects=True,
                headers=HEADERS,
            )
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if "pdf" not in content_type and not url.lower().split("?")[0].endswith(".pdf"):
                logger.warning("Non-PDF content-type at %s: %s", url, content_type)
                return None

            content = resp.content
            if len(content) < 1024:
                # Suspiciously small — likely a login redirect page
                return None

            filename = url.split("/")[-1].split("?")[0] or "document.pdf"
            if not filename.endswith(".pdf"):
                filename += ".pdf"

            sha = hashlib.sha256(content).hexdigest()
            logger.info("Downloaded PDF: %s (%d bytes, sha=%s)", filename, len(content), sha[:8])
            return ScrapedPDF(url=url, filename=filename, content=content, sha256=sha)

        except Exception as e:
            logger.warning("PDF download failed for %s: %s", url, e)
            return None


async def deep_scrape_pdfs(
    page_url: str,
    max_pdfs: int = 5,
) -> list[ScrapedPDF]:
    """
    Fetch page_url, find all academic PDF links, download concurrently.

    Returns up to max_pdfs ScrapedPDF objects sorted by filename.
    Skips login-required hosts. Uses semaphore to cap concurrent downloads.
    """
    if _is_blocked(page_url):
        logger.info("deep_scrape_pdfs: blocked host — %s", page_url)
        return []

    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(page_url)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        logger.warning("deep_scrape_pdfs: page fetch failed for %s: %s", page_url, e)
        return []

    links = _resolve_pdf_links(html, page_url)
    if not links:
        logger.info("deep_scrape_pdfs: no academic PDF links found on %s", page_url)
        return []

    logger.info("deep_scrape_pdfs: found %d candidate PDF links on %s", len(links), page_url)

    # Cap candidates before downloading
    links = links[:max_pdfs * 2]

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)
    async with httpx.AsyncClient(follow_redirects=True) as client:
        tasks = [_download_pdf(semaphore, client, url) for url, _ in links]
        results = await asyncio.gather(*tasks)

    pdfs = [r for r in results if r is not None][:max_pdfs]
    logger.info("deep_scrape_pdfs: successfully downloaded %d PDFs from %s", len(pdfs), page_url)
    return pdfs


# ── Legacy helpers kept for existing callers ──────────────────────────────────

async def _fetch_with_retry(client: httpx.AsyncClient, url: str) -> str | None:
    for attempt in range(MAX_RETRIES):
        try:
            response = await client.get(url, timeout=TIMEOUT, follow_redirects=True)
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


async def scrape_content(
    subject_name: str,
    module_title: str,
    topics: list[str],
) -> list[str]:
    query = _build_query(subject_name, module_title, topics)
    urls = _build_urls(query, topics)
    all_chunks: list[str] = []

    async with httpx.AsyncClient(headers=HEADERS) as client:
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
