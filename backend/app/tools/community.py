"""Zero-key community signal collectors (Hacker News Algolia, Reddit JSON, GitHub)."""

import logging

import httpx

from app.config import settings
from app.schemas.intelligence import SourceCitationInput
from app.tools.security import sanitize_evidence_text
from app.tools.web_search import search_web

logger = logging.getLogger(__name__)

_COMMUNITY_HEADERS = {
    "User-Agent": "CMIDeskBot/1.0 (Academic Research Project; Python httpx)",
    "Accept": "application/json",
}


async def search_hacker_news(
    query: str, competitor_name: str | None = None, limit: int = 5
) -> list[SourceCitationInput]:
    """Query public Hacker News Algolia API for discussions and user sentiment."""
    comp = competitor_name or query
    url = "https://hn.algolia.com/api/v1/search"
    params = {"query": query, "hitsPerPage": limit}
    items: list[SourceCitationInput] = []

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            resp = await client.get(url, params=params, headers=_COMMUNITY_HEADERS)
            if resp.status_code != 200:
                return []
            data = resp.json()
            for hit in data.get("hits", [])[:limit]:
                object_id = hit.get("objectID")
                hn_url = f"https://news.ycombinator.com/item?id={object_id}" if object_id else hit.get("url", "")
                title = hit.get("title") or hit.get("story_title") or f"HN discussion on {comp}"
                body = hit.get("story_text") or hit.get("comment_text") or ""
                points = hit.get("points")
                comments = hit.get("num_comments")
                meta_prefix = ""
                if points is not None or comments is not None:
                    meta_prefix = f"[points={points or 0}, comments={comments or 0}] "
                snippet = sanitize_evidence_text(meta_prefix + (body or title), max_chars=900)
                if hn_url:
                    items.append(
                        SourceCitationInput(
                            competitor_name=comp,
                            source_type="hn",
                            title=sanitize_evidence_text(title, max_chars=220),
                            url=hn_url,
                            snippet=snippet,
                        )
                    )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("HN Algolia search failed for %r: %s", query, exc)
        return []
    return items


async def search_reddit(
    query: str, competitor_name: str | None = None, limit: int = 5
) -> list[SourceCitationInput]:
    """Query public Reddit JSON search; fall back to DuckDuckGo site:reddit.com on throttle."""
    comp = competitor_name or query
    url = "https://www.reddit.com/search.json"
    params = {"q": query, "limit": limit, "sort": "relevance"}
    items: list[SourceCitationInput] = []

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            resp = await client.get(url, params=params, headers=_COMMUNITY_HEADERS)
            if resp.status_code == 200:
                children = resp.json().get("data", {}).get("children", [])
                for child in children[:limit]:
                    post = child.get("data", {})
                    permalink = post.get("permalink")
                    post_url = (
                        f"https://www.reddit.com{permalink}"
                        if permalink
                        else post.get("url", "")
                    )
                    title = post.get("title") or f"Reddit discussion on {comp}"
                    selftext = post.get("selftext") or ""
                    sub = post.get("subreddit_name_prefixed") or ""
                    score = post.get("score")
                    snippet = sanitize_evidence_text(
                        f"[{sub}, score={score}] {selftext or title}", max_chars=900
                    )
                    if post_url:
                        items.append(
                            SourceCitationInput(
                                competitor_name=comp,
                                source_type="reddit",
                                title=sanitize_evidence_text(title, max_chars=220),
                                url=post_url,
                                snippet=snippet,
                            )
                        )
                if items:
                    return items
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Reddit JSON fallback triggered for %r: %s", query, exc)

    # Fallback to DuckDuckGo site:reddit.com when Reddit throttles unauthenticated requests
    ddg_hits = search_web(f"site:reddit.com {query}", max_results=limit)
    for hit in ddg_hits:
        items.append(
            SourceCitationInput(
                competitor_name=comp,
                source_type="reddit",
                title=hit.title,
                url=hit.url,
                snippet=hit.snippet,
            )
        )
    return items


async def search_github_repos(
    query: str, competitor_name: str | None = None, limit: int = 3
) -> list[SourceCitationInput]:
    """Query public GitHub repository search API for OSS traction signals."""
    comp = competitor_name or query
    url = "https://api.github.com/search/repositories"
    params = {"q": query, "sort": "stars", "order": "desc", "per_page": limit}
    items: list[SourceCitationInput] = []

    try:
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            resp = await client.get(url, params=params, headers=_COMMUNITY_HEADERS)
            if resp.status_code != 200:
                return []
            for repo in resp.json().get("items", [])[:limit]:
                html_url = repo.get("html_url")
                if not html_url:
                    continue
                full_name = repo.get("full_name") or comp
                stars = repo.get("stargazers_count", 0)
                lang = repo.get("language") or "Unknown"
                desc = repo.get("description") or ""
                snippet = sanitize_evidence_text(
                    f"[stars={stars}, lang={lang}] {desc}", max_chars=800
                )
                items.append(
                    SourceCitationInput(
                        competitor_name=comp,
                        source_type="github",
                        title=sanitize_evidence_text(full_name, max_chars=220),
                        url=html_url,
                        snippet=snippet,
                    )
                )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("HN Algolia search failed for %r: %s", query, exc)
        return []
    return items
