"""DuckDuckGo zero-key web search wrapper."""

import asyncio
import logging
import weakref
from dataclasses import dataclass

from ddgs import DDGS
from ddgs.exceptions import DDGSException

from app.tools.security import sanitize_evidence_text

logger = logging.getLogger(__name__)

_LOOP_SEMAPHORES: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)


def _get_search_semaphore() -> asyncio.Semaphore:
    """Return a concurrency limiter bound to the active event loop."""
    loop = asyncio.get_running_loop()
    semaphore = _LOOP_SEMAPHORES.get(loop)
    if semaphore is None:
        semaphore = asyncio.Semaphore(2)
        _LOOP_SEMAPHORES[loop] = semaphore
    return semaphore


@dataclass(slots=True)
class SearchHit:
    """Normalized web search result."""

    title: str
    url: str
    snippet: str


def _execute_ddgs_text(query: str, max_results: int) -> list[SearchHit]:
    """Run a single DuckDuckGo query, returning [] on expected search/network failures."""
    hits: list[SearchHit] = []
    try:
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=max_results)
            for row in results or []:
                url = (row.get("href") or row.get("link") or "").strip()
                title = sanitize_evidence_text(row.get("title") or url, max_chars=220)
                snippet = sanitize_evidence_text(row.get("body") or row.get("snippet") or "", max_chars=800)
                if url:
                    hits.append(SearchHit(title=title, url=url, snippet=snippet))
    except (DDGSException, OSError, RuntimeError, ValueError) as exc:
        logger.warning("DuckDuckGo search failed for %r: %s", query, exc)
        return []
    return hits


def search_web(query: str, max_results: int = 6) -> list[SearchHit]:
    """Run synchronous DuckDuckGo text search with unquoted fallback on empty results."""
    hits = _execute_ddgs_text(query, max_results)
    if not hits and '"' in query:
        relaxed_query = query.replace('"', "").strip()
        if relaxed_query:
            hits = _execute_ddgs_text(relaxed_query, max_results)
    return hits


async def async_search_web(query: str, max_results: int = 6) -> list[SearchHit]:
    """Run DuckDuckGo search in a worker thread with bounded concurrency."""
    async with _get_search_semaphore():
        return await asyncio.to_thread(search_web, query, max_results)
