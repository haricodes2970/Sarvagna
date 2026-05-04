import asyncio
import logging
import urllib.parse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64
MAX_RETRIES = 3
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; Sarvagna/1.0)"}
TIMEOUT = 15.0


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
