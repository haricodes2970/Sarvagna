# Scraping

Sarvagna scrapes module notes and stores them in Qdrant for retrieval.

## Sources
Current search domains:
- vtucircle.com
- azdocuments.in
- takeiteasyengineers.com

The Scraper Agent builds search URLs like:
https://www.<domain>/search?q=<subject_name>+module+<n>+notes
If a module topic is available from the syllabus, it uses:
<subject_name> <module_topic> notes

## Apify Actor
- Actor: apify/website-content-crawler
- Crawler type: cheerio
- Max crawling depth: 3
- Output format: markdown
- Falls back to item.text when markdown is not provided

## Fallback Logic
- Apify is tried first.
- If Apify fails or returns insufficient content, Playwright is used to fetch page text.
- Up to 3 total retries with a backoff delay of 2 seconds times the attempt number.
- A scrape is considered valid if the text length exceeds 100 characters.

## Syllabus Assisted Scraping
If branch and semester are provided, the scraper loads module topics from backend/services/syllabus_loader.py and uses that topic as the search keyword. The syllabus JSON files live in backend/data/syllabus.

## Storage
Scraped text is chunked and embedded by Chunker Agent and stored in Qdrant. See docs/AI_PIPELINE.md for chunking details.
