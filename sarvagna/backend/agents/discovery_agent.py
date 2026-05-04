"""
Content Discovery Agent — searches public academic repositories for
PDF resources matching a given topic/subject.

Sources:
  1. Internet Archive (archive.org) — vast open-access text collection
  2. OpenStax — free peer-reviewed textbooks for common CS/ECE subjects
"""
import asyncio
import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": "Sarvagna/1.0 (academic research tool)"}
ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php"
ARCHIVE_META = "https://archive.org/metadata/{identifier}"
ARCHIVE_DL = "https://archive.org/download/{identifier}/{filename}"

# Curated OpenStax catalog — title, subjects, direct PDF slug
_OPENSTAX_CATALOG = [
    {"title": "University Physics Vol 1",   "subjects": ["physics", "mechanics"],        "pdf": "University_Physics_Volume_1"},
    {"title": "University Physics Vol 2",   "subjects": ["physics", "electromagnetism"], "pdf": "University_Physics_Volume_2"},
    {"title": "University Physics Vol 3",   "subjects": ["physics", "optics", "quantum"],"pdf": "University_Physics_Volume_3"},
    {"title": "Calculus Vol 1",             "subjects": ["calculus", "maths", "math"],   "pdf": "Calculus_Volume_1"},
    {"title": "Calculus Vol 2",             "subjects": ["calculus", "maths", "math"],   "pdf": "Calculus_Volume_2"},
    {"title": "Introductory Statistics",    "subjects": ["statistics", "probability"],   "pdf": "Statistics"},
    {"title": "Introduction to Python",     "subjects": ["python", "programming"],       "pdf": "Introduction_to_Python_Programming"},
    {"title": "Computer Science Principles","subjects": ["cs", "computer science", "programming"], "pdf": "Computer_Science_Principles"},
    {"title": "Principles of Economics",    "subjects": ["economics", "micro", "macro"], "pdf": "Principles_of_Economics_3e"},
    {"title": "Organic Chemistry",          "subjects": ["chemistry", "organic"],        "pdf": "Organic_Chemistry"},
    {"title": "Anatomy and Physiology",     "subjects": ["biology", "anatomy"],          "pdf": "Anatomy_and_Physiology_2e"},
    {"title": "Introduction to Sociology",  "subjects": ["sociology"],                   "pdf": "Introduction_to_Sociology_3e"},
]


@dataclass
class ResourceResult:
    title: str
    url: str
    source: str
    description: str = ""

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "url": self.url,
            "source": self.source,
            "description": self.description,
        }


def _openstax_search(topic: str) -> list[ResourceResult]:
    t = topic.lower()
    results: list[ResourceResult] = []
    for book in _OPENSTAX_CATALOG:
        if any(s in t or t in s for s in book["subjects"]):
            results.append(ResourceResult(
                title=book["title"],
                url=f"https://assets.openstax.org/oscms-prodcms/media/documents/{book['pdf']}.pdf",
                source="openstax.org",
                description="Free peer-reviewed OpenStax textbook (CC BY 4.0)",
            ))
    return results


async def _archive_meta_pdf(client: httpx.AsyncClient, identifier: str) -> str | None:
    """Return direct PDF download URL for an Archive.org item, or None."""
    try:
        resp = await client.get(
            ARCHIVE_META.format(identifier=identifier),
            headers=HEADERS,
            timeout=8,
        )
        resp.raise_for_status()
        files = resp.json().get("files", [])
        pdf_files = [f for f in files if (f.get("name") or "").lower().endswith(".pdf")]
        if not pdf_files:
            return None
        filename = pdf_files[0]["name"]
        return ARCHIVE_DL.format(identifier=identifier, filename=filename)
    except Exception as e:
        logger.debug("Archive meta fetch failed for %s: %s", identifier, e)
        return None


async def _archive_search(topic: str, fetch_limit: int = 4) -> list[ResourceResult]:
    params = {
        "q": f"({topic}) AND mediatype:texts AND language:English",
        "fl[]": ["identifier", "title", "description"],
        "output": "json",
        "rows": fetch_limit + 4,   # fetch extra to account for items without PDFs
        "sort[]": "downloads desc",
    }
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=12) as client:
            resp = await client.get(ARCHIVE_SEARCH, params=params)
            resp.raise_for_status()
            docs = resp.json().get("response", {}).get("docs", [])

            # Fetch PDF URLs for all candidates concurrently
            tasks = [_archive_meta_pdf(client, d["identifier"]) for d in docs if d.get("identifier")]
            pdf_urls = await asyncio.gather(*tasks)

        results: list[ResourceResult] = []
        for doc, url in zip(docs, pdf_urls):
            if not url:
                continue
            desc = doc.get("description") or ""
            if isinstance(desc, list):
                desc = " ".join(desc)
            results.append(ResourceResult(
                title=doc.get("title", doc["identifier"]),
                url=url,
                source="archive.org",
                description=str(desc)[:200],
            ))
            if len(results) >= fetch_limit:
                break
        return results
    except Exception as e:
        logger.warning("Archive.org search failed: %s", e)
        return []


async def find_academic_resources(topic: str, limit: int = 3) -> list[ResourceResult]:
    """
    Search Archive.org + OpenStax for academic PDFs matching topic.
    Returns up to `limit` ResourceResult objects, best sources first.
    """
    openstax = _openstax_search(topic)
    archive = await _archive_search(topic, fetch_limit=limit)

    # OpenStax first (higher quality / more reliable), then Archive.org
    combined: list[ResourceResult] = []
    seen_urls: set[str] = set()
    for r in openstax + archive:
        if r.url not in seen_urls:
            combined.append(r)
            seen_urls.add(r.url)
        if len(combined) >= limit:
            break

    logger.info("Discovery '%s': %d results (%d openstax, %d archive)",
                topic, len(combined), len(openstax), len(archive))
    return combined
