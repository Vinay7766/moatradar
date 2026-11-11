"""Safe parser and sanitizer for uploaded custom PM evidence documents."""

import io
from pathlib import Path

from app.tools.security import sanitize_evidence_text

MAX_DOCUMENT_BYTES = 2 * 1024 * 1024  # 2 MB
MAX_DOCUMENT_CHARS = 25_000
ALLOWED_DOCUMENT_EXTENSIONS = frozenset({".md", ".txt", ".pdf"})


class DocumentParseError(ValueError):
    """Raised when an uploaded document fails validation or text extraction."""


def _decode_text_bytes(content_bytes: bytes) -> str:
    """Decode plain-text or Markdown bytes as UTF-8, falling back to Latin-1."""
    try:
        text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = content_bytes.decode("latin-1")
    return text.lstrip("\ufeff")


def _extract_pdf_bytes(content_bytes: bytes) -> str:
    """Lazily import pypdf and extract text across all pages of a PDF payload."""
    try:
        import pypdf
    except ImportError as exc:
        raise DocumentParseError(
            "PDF parsing requires the optional 'pypdf' dependency, which is not installed."
        ) from exc

    try:
        reader = pypdf.PdfReader(io.BytesIO(content_bytes))
        page_texts = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise DocumentParseError(f"Invalid or unreadable PDF document: {exc}") from exc

    return "\n".join(page_texts)


def extract_document_text(filename: str, content_bytes: bytes) -> str:
    """Validate, extract, and sanitize text from a .md, .txt, or .pdf upload."""
    ext = Path(filename.strip()).suffix.lower()
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_DOCUMENT_EXTENSIONS))
        raise DocumentParseError(
            f"Unsupported file extension {ext or '(none)'!r}; allowed types: {allowed}."
        )

    if not content_bytes:
        raise DocumentParseError("Uploaded document is empty.")

    if len(content_bytes) > MAX_DOCUMENT_BYTES:
        raise DocumentParseError("Document exceeds the maximum allowed size of 2 MB.")

    raw_text = (
        _extract_pdf_bytes(content_bytes)
        if ext == ".pdf"
        else _decode_text_bytes(content_bytes)
    )

    cleaned = sanitize_evidence_text(raw_text, max_chars=MAX_DOCUMENT_CHARS)
    if not cleaned:
        raise DocumentParseError("Document contains no extractable text.")
    return cleaned
