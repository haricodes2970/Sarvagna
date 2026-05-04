import logging

logger = logging.getLogger(__name__)


def extract_text_ocr(file_bytes: bytes) -> str:
    """
    Convert scanned PDF pages to images then OCR with pytesseract.
    Falls back gracefully if system deps (poppler/tesseract) not installed.
    """
    try:
        import pytesseract
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(file_bytes, dpi=200)
        pages: list[str] = []
        for img in images:
            text = pytesseract.image_to_string(img, lang="eng")
            pages.append(text)
        result = "\n".join(pages).strip()
        logger.info("OCR extracted %d chars from %d pages", len(result), len(images))
        return result
    except ImportError as e:
        logger.warning("OCR deps not available (%s), skipping", e)
        return ""
    except Exception as e:
        logger.error("OCR failed: %s", e)
        return ""
