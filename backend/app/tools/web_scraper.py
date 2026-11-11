"""Async SSRF-safe web page scraper using httpx + trafilatura/BeautifulSoup4."""

import logging
from dataclasses import dataclass

import httpx
import trafilatura
from bs4 import BeautifulSoup

from app.config import settings
from app.tools.security import (
    UnsafeUrlError,
    sanitize_evidence_text,
    validate_public_url,
)

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; CMIDeskResearchBot/1.0; "
        "+https://localhost/cmi-desk)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
_MAX_HTML_BYTES = 1_500_000


@dataclass(slots=True)
class ScrapedPage:
    """Clean extracted web page text."""

    url: str
    title: str
    content: str


def _extract_title_and_text(html: str, url: str) -> tuple[str, str]:
    """Extract page title via BeautifulSoup and main text via trafilatura/BS4 fallback."""
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else url

    extracted = trafilatura.extract(html, include_comments=False, include_tables=True) or ""
    if len(extracted.strip()) < 120:
        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()
        extracted = soup.get_text(separator=" ", strip=True)

    return sanitize_evidence_text(title, max_chars=220), sanitize_evidence_text(
        extracted, max_chars=4500
    )


async def fetch_clean_page(url: str, timeout: float | None = None) -> ScrapedPage | None:
    """Fetch and extract clean text from a public URL. Raises UnsafeUrlError on SSRF."""
    safe_url = validate_public_url(url)
    effective_timeout = timeout or settings.http_timeout_seconds

    try:
        async with httpx.AsyncClient(
            timeout=effective_timeout,
            headers=_HEADERS,
            follow_redirects=False,
        ) as client:
            current_url = safe_url
            response: httpx.Response | None = None
            for _ in range(3):
                response = await client.get(current_url)
                if response.is_redirect and "location" in response.headers:
                    next_url = str(response.url.join(response.headers["location"]))
                    current_url = validate_public_url(next_url)
                    continue
                break

            if response is None or response.status_code >= 400:
                return None

            content_type = response.headers.get("content-type", "").lower()
            if "text/html" not in content_type and "text/plain" not in content_type:
                return None

            raw_text = response.text[:_MAX_HTML_BYTES]
            title, body = _extract_title_and_text(raw_text, current_url)
            if not body:
                return None
            return ScrapedPage(url=current_url, title=title, content=body)
    except UnsafeUrlError:
        raise
    except (httpx.HTTPError, ValueError, UnicodeDecodeError) as exc:
        logger.warning("Failed scraping %s: %s", url, exc)
        return None
