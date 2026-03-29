import asyncio
import logging
import re

import httpx
from apify_client import ApifyClientAsync
from playwright.async_api import async_playwright

from core.config import get_settings
from services.syllabus_loader import get_modules

logger = logging.getLogger(__name__)
settings = get_settings()

_SCRAPE_URLS = [
    "vtucircle.com",
    "azdocuments.in",
    "takeiteasyengineers.com",
]

_MAX_RETRIES = 3
_RETRY_DELAY = 2  # seconds


def _build_search_urls(subject_name: str, module_number: int, module_topic: str | None = None) -> list[str]:
    if module_topic:
        query = f"{subject_name} {module_topic} notes"
    else:
        query = f"{subject_name} module {module_number} notes"
    return [f"https://www.{domain}/search?q={query.replace(' ', '+')}" for domain in _SCRAPE_URLS]


async def _scrape_via_apify(subject_name: str, module_number: int, module_topic: str | None = None) -> str | None:
    client = ApifyClientAsync(settings.APIFY_API_KEY)
    urls = _build_search_urls(subject_name, module_number, module_topic)

    run_input = {
        "startUrls": [{"url": url} for url in urls],
        "maxCrawlingDepth": 3,
        "crawlerType": "cheerio",
        "outputFormat": "markdown",
        "saveFiles": True,
    }

    try:
        run = await client.actor("apify/website-content-crawler").call(run_input=run_input, timeout_secs=120)
        dataset = client.dataset(run["defaultDatasetId"])
        items = []
        async for item in dataset.iterate_items():
            if item.get("markdown"):
                items.append(item["markdown"])
            elif item.get("text"):
                items.append(item["text"])
        return "\n\n".join(items) if items else None
    except Exception as exc:
        logger.warning("Apify scrape failed: %s", exc)
        return None


async def _scrape_via_playwright(subject_name: str, module_number: int, module_topic: str | None = None) -> str | None:
    urls = _build_search_urls(subject_name, module_number, module_topic)
    texts: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        for url in urls:
            try:
                await page.goto(url, wait_until="networkidle", timeout=30_000)
                text = await page.evaluate("() => document.body.innerText")
                if text:
                    texts.append(text.strip())
            except Exception as exc:
                logger.warning("Playwright failed for %s: %s", url, exc)

        await browser.close()

    return "\n\n".join(texts) if texts else None


async def scrape_subject(
    subject_name: str,
    module_number: int,
    branch: str = "",
    semester: int = 0,
) -> str:
    """
    Scrape content for a subject module. Tries Apify first, falls back to
    Playwright. Retries up to _MAX_RETRIES times total.

    If branch and semester are provided, looks up the module topic from the
    syllabus and uses it as a targeted search keyword instead of the generic
    "module N" query.

    Returns scraped text or raises RuntimeError if all attempts fail.
    """
    # Resolve syllabus topic for this module to make search more targeted
    module_topic: str | None = None
    if branch and semester:
        modules = get_modules(branch, semester, subject_name)
        if modules and 1 <= module_number <= len(modules):
            module_topic = modules[module_number - 1]
            logger.info("Syllabus topic for module %d: '%s'", module_number, module_topic)
        else:
            logger.info("No syllabus topic found for '%s' module %d, using generic query", subject_name, module_number)

    last_error: Exception | None = None

    for attempt in range(1, _MAX_RETRIES + 1):
        logger.info("Scrape attempt %d/%d for '%s' module %d", attempt, _MAX_RETRIES, subject_name, module_number)

        try:
            text = await _scrape_via_apify(subject_name, module_number, module_topic)
            if text and len(text.strip()) > 100:
                logger.info("Apify succeeded on attempt %d", attempt)
                return text.strip()

            logger.info("Apify returned no content, falling back to Playwright")
            text = await _scrape_via_playwright(subject_name, module_number, module_topic)
            if text and len(text.strip()) > 100:
                logger.info("Playwright succeeded on attempt %d", attempt)
                return text.strip()

            raise RuntimeError("Both Apify and Playwright returned insufficient content")

        except Exception as exc:
            last_error = exc
            logger.warning("Attempt %d failed: %s", attempt, exc)
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_DELAY * attempt)

    raise RuntimeError(
        f"All {_MAX_RETRIES} scrape attempts failed for '{subject_name}' module {module_number}"
    ) from last_error
