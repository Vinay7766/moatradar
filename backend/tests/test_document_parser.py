"""Unit tests for custom PM evidence document parsing and sanitization."""

import sys
from types import SimpleNamespace

import pytest

from app.tools.document_parser import DocumentParseError, extract_document_text


def test_extract_document_text_parses_utf8_markdown() -> None:
    raw = b"# Q4 Win/Loss Notes\n\nProspect switched from Acme due to\x00   SSO paywall.\n"
    text = extract_document_text("q4-notes.md", raw)
    assert "Q4 Win/Loss Notes" in text
    assert "SSO paywall." in text
    assert "\x00" not in text
    assert "   " not in text


def test_extract_document_text_falls_back_to_latin1_for_txt() -> None:
    raw = "Café tier costs £49/mo".encode("latin-1")
    text = extract_document_text("notes.TXT", raw)
    assert "Café tier costs £49/mo" in text


def test_extract_document_text_rejects_unsupported_extension() -> None:
    with pytest.raises(DocumentParseError, match="Unsupported"):
        extract_document_text("deck.docx", b"binary payload")


def test_extract_document_text_rejects_oversized_file() -> None:
    oversized = b"a" * (2 * 1024 * 1024 + 1)
    with pytest.raises(DocumentParseError, match="2 MB"):
        extract_document_text("big.md", oversized)


def test_extract_document_text_rejects_empty_or_whitespace_only() -> None:
    with pytest.raises(DocumentParseError, match="empty"):
        extract_document_text("empty.txt", b"")
    with pytest.raises(DocumentParseError, match="empty|extractable"):
        extract_document_text("whitespace.txt", b"   \n\t\x00  ")


def test_extract_document_text_truncates_at_25000_chars() -> None:
    long_text = ("word " * 7000).encode("utf-8")
    result = extract_document_text("long.md", long_text)
    assert len(result) <= 25000
    assert result.endswith("...")


def test_extract_document_text_pdf_missing_pypdf_raises_clear_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(sys.modules, "pypdf", None)
    with pytest.raises(DocumentParseError, match="pypdf"):
        extract_document_text("battlecard.pdf", b"%PDF-1.4 fake")


def test_extract_document_text_pdf_extracts_pages_via_pypdf(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakePage:
        def __init__(self, content: str) -> None:
            self._content = content

        def extract_text(self) -> str:
            return self._content

    class FakePdfReader:
        def __init__(self, stream: object) -> None:
            self.pages = [FakePage("Page 1: Enterprise pricing"), FakePage("Page 2: SOC2")]

    monkeypatch.setitem(sys.modules, "pypdf", SimpleNamespace(PdfReader=FakePdfReader))
    text = extract_document_text("battlecard.PDF", b"%PDF-1.4 valid")
    assert "Page 1: Enterprise pricing" in text
    assert "Page 2: SOC2" in text


def test_extract_document_text_pdf_invalid_or_empty_raises_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class BrokenPdfReader:
        def __init__(self, stream: object) -> None:
            raise ValueError("corrupt xref table")

    monkeypatch.setitem(sys.modules, "pypdf", SimpleNamespace(PdfReader=BrokenPdfReader))
    with pytest.raises(DocumentParseError, match="PDF"):
        extract_document_text("corrupt.pdf", b"not a pdf")

    class EmptyPdfReader:
        def __init__(self, stream: object) -> None:
            self.pages = [SimpleNamespace(extract_text=lambda: "   ")]

    monkeypatch.setitem(sys.modules, "pypdf", SimpleNamespace(PdfReader=EmptyPdfReader))
    with pytest.raises(DocumentParseError, match="empty|extractable"):
        extract_document_text("blank.pdf", b"%PDF-1.4 blank")
