"""
Scrape and chunk content for a VTU subject into Qdrant.

Usage (run from backend/):
    python scripts/scrape_subject.py
"""
import asyncio
import sys
import os

# Make sure backend root is on the path when running from scripts/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from agents.scraper_agent import scrape_subject
from agents.chunker_agent import chunk_and_store


async def main():
    subject_name = "Machine Learning"
    branch = "AIML"
    semester = 5  # ML is semester 5 in aiml_syllabus.json

    print(f"Starting scrape for '{subject_name}' (Branch: {branch}, Semester: {semester})")
    print("=" * 60)

    total_chunks = 0
    for module_number in range(1, 6):
        print(f"\n[Module {module_number}] Scraping...")
        try:
            content = await scrape_subject(
                subject_name=subject_name,
                module_number=module_number,
                branch=branch,
                semester=semester,
            )
            if content:
                print(f"[Module {module_number}] Scraped {len(content)} chars. Chunking + embedding...")
                chunks = await chunk_and_store(content, subject_name, module_number)
                total_chunks += chunks
                print(f"[Module {module_number}] Stored {chunks} chunks in Qdrant.")
            else:
                print(f"[Module {module_number}] No content scraped.")
        except Exception as exc:
            print(f"[Module {module_number}] ERROR: {exc}")

    print("\n" + "=" * 60)
    print(f"Done. Total chunks stored: {total_chunks}")


if __name__ == "__main__":
    asyncio.run(main())
