"""
workspace_manager.py — Local batch-sync utility for Sarvagna.

Scans a local directory for PDFs, compares against the backend API
using SHA-256 hashes, and uploads any new or modified files.

Usage:
    python workspace_manager.py --dir ./my_notes --token <JWT> [--subject-id 3]
    python workspace_manager.py --dir ./my_notes --token <JWT> --dry-run

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


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sarvagna workspace sync")
    p.add_argument("--dir", default=".", help="Directory to scan for PDFs")
    p.add_argument("--url", default="http://localhost:8080", help="Backend base URL")
    p.add_argument("--token", default="", help="JWT bearer token")
    p.add_argument("--subject-id", type=int, default=None, help="Link uploads to subject ID")
    p.add_argument("--dry-run", action="store_true", help="List files without uploading")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    if not args.dry_run and not args.token:
        print("ERROR: --token required unless --dry-run", file=sys.stderr)
        sys.exit(1)
    results = asyncio.run(
        sync_local_files(
            scan_dir=args.dir,
            base_url=args.url,
            token=args.token,
            subject_id=args.subject_id,
            dry_run=args.dry_run,
        )
    )
    sys.exit(0 if not results["failed"] else 1)
