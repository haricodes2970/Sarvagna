"""
Structure-aware chunker for Sarvagna.

Uses pdfplumber word-level font metadata to detect section headings
(bold text or font size > 110% of page median). Each chunk is tagged
with its nearest heading so retrieval carries structural context.

Falls back to plain sliding-window chunking for non-PDF inputs.
"""
import io
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

CHUNK_SIZE = 512
CHUNK_OVERLAP = 64
MIN_CHUNK_CHARS = 50
HEADER_SIZE_RATIO = 1.10   # font must be 10% larger than median
MAX_HEADER_LEN = 120


@dataclass
class ContextualChunk:
    text: str
    section: str = "General"
    page: int = 0

    def to_dict(self) -> dict:
        return {"text": self.text, "section": self.section, "page": self.page}


# ── plain text splitting (used for TXT / MD / DOCX) ──────────────────────────

def split_text(text: str, section: str = "General", page: int = 0) -> list[ContextualChunk]:
    chunks: list[ContextualChunk] = []
    text = text.strip()
    start = 0
    while start < len(text):
        snippet = text[start: start + CHUNK_SIZE].strip()
        if len(snippet) >= MIN_CHUNK_CHARS:
            chunks.append(ContextualChunk(text=snippet, section=section, page=page))
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


# ── PDF structure-aware chunking ──────────────────────────────────────────────

def _page_median_size(words: list[dict]) -> float:
    sizes = [w.get("size") or 0 for w in words]
    sizes = [s for s in sizes if s > 0]
    if not sizes:
        return 10.0
    return sorted(sizes)[len(sizes) // 2]


def _is_heading(line_words: list[dict], median_size: float) -> bool:
    if not line_words:
        return False
    text = " ".join(w.get("text", "") for w in line_words).strip()
    if not (3 <= len(text) <= MAX_HEADER_LEN):
        return False
    if text.endswith("."):   # sentences are not headings
        return False
    avg_size = sum(w.get("size") or 0 for w in line_words) / max(len(line_words), 1)
    is_bold = any("bold" in (w.get("fontname") or "").lower() for w in line_words)
    return is_bold or avg_size >= median_size * HEADER_SIZE_RATIO


def _words_to_lines(words: list[dict]) -> dict[float, list[dict]]:
    lines: dict[float, list[dict]] = {}
    for w in words:
        y = round(w.get("top") or 0, 1)
        lines.setdefault(y, []).append(w)
    return lines


def _flush(buffer: str, section: str, page: int) -> list[ContextualChunk]:
    return split_text(f"[{section}]\n{buffer}", section=section, page=page)


def extract_contextual_chunks(file_bytes: bytes) -> list[ContextualChunk]:
    """
    Parse PDF page-by-page. Detect section headings via font metadata.
    Return ContextualChunk list where each chunk is prefixed with its heading.
    """
    try:
        import pdfplumber
    except ImportError:
        logger.warning("pdfplumber not installed, falling back to plain text split")
        return []

    chunks: list[ContextualChunk] = []
    current_section = "Introduction"
    buffer = ""
    buffer_page = 1

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                words = page.extract_words(extra_attrs=["fontname", "size"])
                if not words:
                    continue

                median = _page_median_size(words)
                lines = _words_to_lines(words)

                for y in sorted(lines):
                    line_words = lines[y]
                    line_text = " ".join(w.get("text", "") for w in line_words).strip()
                    if not line_text:
                        continue

                    if _is_heading(line_words, median):
                        if buffer.strip():
                            chunks.extend(_flush(buffer, current_section, buffer_page))
                            buffer = ""
                        current_section = line_text
                        buffer_page = page_num
                        logger.debug("Heading detected p%d: %s", page_num, line_text[:60])
                    else:
                        buffer += " " + line_text
                        buffer_page = page_num

                if buffer.strip():
                    chunks.extend(_flush(buffer, current_section, page_num))
                    buffer = ""

    except Exception as e:
        logger.error("Contextual chunking failed: %s", e)
        return []

    logger.info("Contextual chunking: %d chunks, %d unique sections",
                len(chunks),
                len({c.section for c in chunks}))
    return chunks
