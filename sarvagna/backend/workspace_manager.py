"""
workspace_manager.py — Local batch-sync utility for Sarvagna.

Scans a local directory for PDFs OR downloads remote URLs (from
/discovery/recommend) and triggers the standard SHA-256 upload flow.

Usage — local sync:
    python workspace_manager.py --dir ./my_notes --token <JWT> [--subject-id 3]
    python workspace_manager.py --dir ./my_notes --token <JWT> --dry-run

Usage — remote import (single URL or comma-separated list):
    python workspace_manager.py --remote-urls "https://example.com/a.pdf,https://b.pdf" \\
        --token <JWT> [--subject-id 3]

Usage — auto-discover + import via /discovery/recommend:
    python workspace_manager.py --discover "machine learning" --token <JWT>

The .sarvagna/metadata.json file (gitignored) acts as a local cache
so repeated runs skip files already confirmed indexed.

Production source of truth: PostgreSQL uploaded_files.file_hash column.
"""
import argparse
import asyncio
import hashlib
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("workspace_manager")

SARVAGNA_DIR = Path(".sarvagna")
METADATA_FILE = SARVAGNA_DIR / "metadata.json"
PDF_GLOB = "**/*.pdf"


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_metadata() -> dict:
    SARVAGNA_DIR.mkdir(exist_ok=True)
    if not METADATA_FILE.exists():
        schema = {
            "_schema_version": "1.0",
            "file_registry": [],
            "mastery_map": [],
            "exam_profiles": [],
        }
        METADATA_FILE.write_text(json.dumps(schema, indent=2))
        return schema
    return json.loads(METADATA_FILE.read_text())


def _save_metadata(meta: dict) -> None:
    METADATA_FILE.write_text(json.dumps(meta, indent=2))


def _already_indexed(meta: dict, sha: str) -> bool:
    return any(r["sha256_hash"] == sha for r in meta["file_registry"])


def _register_file(meta: dict, path: Path, sha: str, subject_id: int | None) -> None:
    meta["file_registry"].append({
        "file_path": str(path.resolve()),
        "sha256_hash": sha,
        "last_indexed_at": datetime.now(timezone.utc).isoformat(),
        "university_context": {
            "branch": None,
            "semester": None,
            "subject_id": subject_id,
        },
    })


async def _upload_file(
    client: httpx.AsyncClient,
    base_url: str,
    token: str,
    path: Path,
    subject_id: int | None,
) -> dict:
    with open(path, "rb") as f:
        data = f.read()
    files = {"file": (path.name, data, "application/pdf")}
    params = {}
    if subject_id is not None:
        params["subject_id"] = str(subject_id)
    resp = await client.post(
        f"{base_url}/upload/pdf",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data=params,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


async def sync_local_files(
    scan_dir: str = ".",
    base_url: str = "http://localhost:8080",
    token: str = "",
    subject_id: int | None = None,
    dry_run: bool = False,
) -> dict[str, list[str]]:
    """
    Scan scan_dir for PDFs. Upload any not yet indexed.
    Returns {"uploaded": [...], "skipped": [...], "failed": [...]}.
    """
    root = Path(scan_dir).resolve()
    if not root.exists():
        raise ValueError(f"Directory not found: {root}")

    pdfs = sorted(root.glob(PDF_GLOB))
    if not pdfs:
        logger.info("No PDFs found in %s", root)
        return {"uploaded": [], "skipped": [], "failed": []}

    meta = _load_metadata()
    results: dict[str, list[str]] = {"uploaded": [], "skipped": [], "failed": []}

    async with httpx.AsyncClient() as client:
        for pdf in pdfs:
            sha = _sha256_file(pdf)
            rel = str(pdf.relative_to(root))

            if _already_indexed(meta, sha):
                logger.info("SKIP  %s (hash cached locally)", rel)
                results["skipped"].append(rel)
                continue

            if dry_run:
                logger.info("DRY   %s  sha=%s", rel, sha[:8])
                results["uploaded"].append(f"[dry-run] {rel}")
                continue

            try:
                res = await _upload_file(client, base_url, token, pdf, subject_id)
                chunk_count = res.get("chunk_count", 0)
                logger.info("OK    %s  →  %d chunks", rel, chunk_count)
                _register_file(meta, pdf, sha, subject_id)
                _save_metadata(meta)
                results["uploaded"].append(rel)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 409:
                    logger.info("DUP   %s (server: already indexed)", rel)
                    _register_file(meta, pdf, sha, subject_id)
                    _save_metadata(meta)
                    results["skipped"].append(rel)
                else:
                    logger.error("FAIL  %s  →  %s", rel, e.response.text[:120])
                    results["failed"].append(rel)
            except Exception as e:
                logger.error("FAIL  %s  →  %s", rel, e)
                results["failed"].append(rel)

    logger.info(
        "Done. uploaded=%d  skipped=%d  failed=%d",
        len(results["uploaded"]),
        len(results["skipped"]),
        len(results["failed"]),
    )
    return results


async def _download_pdf(url: str) -> tuple[bytes, str]:
    """Download remote PDF; return (bytes, suggested_filename)."""
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "Sarvagna/1.0"})
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "pdf" not in content_type and not url.lower().endswith(".pdf"):
            raise ValueError(f"URL does not point to a PDF (content-type: {content_type})")
        filename = url.split("/")[-1].split("?")[0] or "remote.pdf"
        if not filename.endswith(".pdf"):
            filename += ".pdf"
        return resp.content, filename


async def _upload_bytes(
    base_url: str,
    token: str,
    content: bytes,
    filename: str,
    subject_id: int | None,
) -> dict:
    files = {"file": (filename, content, "application/pdf")}
    params = {}
    if subject_id is not None:
        params["subject_id"] = str(subject_id)
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{base_url}/upload/pdf",
            headers={"Authorization": f"Bearer {token}"},
            files=files,
            data=params,
        )
        resp.raise_for_status()
        return resp.json()


async def import_remote_pdfs(
    urls: list[str],
    base_url: str = "http://localhost:8080",
    token: str = "",
    subject_id: int | None = None,
    dry_run: bool = False,
) -> dict[str, list[str]]:
    """
    Download remote PDF URLs and upload via the standard ingestion pipeline.
    SHA-256 dupe check happens server-side (409 = already indexed).
    Local .sarvagna/metadata.json is also updated for cache consistency.
    """
    meta = _load_metadata()
    results: dict[str, list[str]] = {"uploaded": [], "skipped": [], "failed": []}

    for url in urls:
        label = url[:80]
        if dry_run:
            logger.info("DRY   %s", label)
            results["uploaded"].append(f"[dry-run] {url}")
            continue

        try:
            logger.info("FETCH %s", label)
            content, filename = await _download_pdf(url)
        except Exception as e:
            logger.error("FETCH-FAIL %s → %s", label, e)
            results["failed"].append(url)
            continue

        sha = hashlib.sha256(content).hexdigest()
        if _already_indexed(meta, sha):
            logger.info("SKIP  %s (hash cached)", label)
            results["skipped"].append(url)
            continue

        try:
            res = await _upload_bytes(base_url, token, content, filename, subject_id)
            logger.info("OK    %s → %d chunks", filename, res.get("chunk_count", 0))
            _register_file(meta, Path(filename), sha, subject_id)
            _save_metadata(meta)
            results["uploaded"].append(url)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 409:
                logger.info("DUP   %s (server: already indexed)", filename)
                _register_file(meta, Path(filename), sha, subject_id)
                _save_metadata(meta)
                results["skipped"].append(url)
            else:
                logger.error("FAIL  %s → %s", filename, e.response.text[:120])
                results["failed"].append(url)
        except Exception as e:
            logger.error("FAIL  %s → %s", filename, e)
            results["failed"].append(url)

    logger.info("Remote import done. uploaded=%d skipped=%d failed=%d",
                len(results["uploaded"]), len(results["skipped"]), len(results["failed"]))
    return results


async def discover_and_import(
    topic: str,
    base_url: str = "http://localhost:8080",
    token: str = "",
    subject_id: int | None = None,
    limit: int = 3,
    dry_run: bool = False,
) -> dict[str, list[str]]:
    """
    Call GET /discovery/recommend?subject=topic, then import returned PDF URLs.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{base_url}/discovery/recommend",
            params={"subject": topic, "limit": limit},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        resources = resp.json()

    urls = [r["url"] for r in resources]
    logger.info("Discovered %d resources for '%s'", len(urls), topic)
    for r in resources:
        logger.info("  • %s  [%s]", r["title"], r["source"])

    return await import_remote_pdfs(
        urls=urls,
        base_url=base_url,
        token=token,
        subject_id=subject_id,
        dry_run=dry_run,
    )


async def export_sessions(
    subject_id: int,
    base_url: str = "http://localhost:8080",
    token: str = "",
) -> None:
    """
    Fetch teaching session transcripts from /teach/export/{subject_id}
    and append new ones into .sarvagna/metadata.json under 'teaching_sessions'.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{base_url}/teach/export/{subject_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        sessions = resp.json()

    meta = _load_metadata()
    meta.setdefault("teaching_sessions", [])
    existing_ids = {s["id"] for s in meta["teaching_sessions"] if "id" in s}
    added = 0
    for s in sessions:
        if s.get("id") not in existing_ids:
            meta["teaching_sessions"].append(s)
            added += 1
    _save_metadata(meta)
    logger.info("Exported %d new session(s) for subject %d → %s", added, subject_id, METADATA_FILE)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sarvagna workspace sync")
    p.add_argument("--dir", default=None, help="Directory to scan for local PDFs")
    p.add_argument("--remote-urls", default=None, help="Comma-separated PDF URLs to import")
    p.add_argument("--discover", default=None, metavar="TOPIC",
                   help="Auto-discover resources via /discovery/recommend and import")
    p.add_argument("--export-sessions", type=int, default=None, metavar="SUBJECT_ID",
                   help="Export teaching session transcripts for subject into .sarvagna/metadata.json")
    p.add_argument("--url", default="http://localhost:8080", help="Backend base URL")
    p.add_argument("--token", default="", help="JWT bearer token")
    p.add_argument("--subject-id", type=int, default=None, help="Link uploads to subject ID")
    p.add_argument("--limit", type=int, default=3, help="Max resources for --discover (default 3)")
    p.add_argument("--dry-run", action="store_true", help="List files without uploading")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if not args.dry_run and not args.token:
        print("ERROR: --token required unless --dry-run", file=sys.stderr)
        sys.exit(1)

    if args.export_sessions is not None:
        asyncio.run(export_sessions(
            subject_id=args.export_sessions,
            base_url=args.url,
            token=args.token,
        ))
        sys.exit(0)

    if args.discover:
        results = asyncio.run(discover_and_import(
            topic=args.discover,
            base_url=args.url,
            token=args.token,
            subject_id=args.subject_id,
            limit=args.limit,
            dry_run=args.dry_run,
        ))
    elif args.remote_urls:
        urls = [u.strip() for u in args.remote_urls.split(",") if u.strip()]
        results = asyncio.run(import_remote_pdfs(
            urls=urls,
            base_url=args.url,
            token=args.token,
            subject_id=args.subject_id,
            dry_run=args.dry_run,
        ))
    else:
        scan = args.dir or "."
        results = asyncio.run(sync_local_files(
            scan_dir=scan,
            base_url=args.url,
            token=args.token,
            subject_id=args.subject_id,
            dry_run=args.dry_run,
        ))

    sys.exit(0 if not results["failed"] else 1)
