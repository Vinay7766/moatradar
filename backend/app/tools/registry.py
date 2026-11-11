"""Unified async evidence collector combining zero-key web & community tools."""

import asyncio
import logging

from app.schemas.intelligence import SourceCitationInput
from app.tools.community import search_github_repos, search_hacker_news, search_reddit
from app.tools.pricing_playwright import fetch_pricing_page_playwright
from app.tools.security import UnsafeUrlError
from app.tools.web_scraper import fetch_clean_page
from app.tools.web_search import async_search_web

logger = logging.getLogger(__name__)


def _unwrap_results(label: str, competitor_name: str, result: object) -> list:
    """Return gathered list results or log and degrade to [] on unexpected failure."""
    if isinstance(result, BaseException):
        logger.warning(
            "Source collector %s failed for %r: %s", label, competitor_name, result
        )
        return []
    return list(result)  # type: ignore[arg-type]


def deduplicate_citations(citations: list[SourceCitationInput]) -> list[SourceCitationInput]:
    """Deduplicate citations by normalized URL while preserving insertion order."""
    seen: set[str] = set()
    unique: list[SourceCitationInput] = []
    for item in citations:
        norm_url = item.url.strip().rstrip("/")
        if not norm_url or norm_url in seen:
            continue
        seen.add(norm_url)
        unique.append(item)
    return unique


async def collect_competitor_evidence(
    competitor_name: str, website: str = ""
) -> list[SourceCitationInput]:
    """Concurrently collect web, pricing, HN, Reddit, and GitHub evidence for one competitor."""
    features_task = async_search_web(f"{competitor_name} features product capabilities", max_results=4)
    pricing_task = async_search_web(f"{competitor_name} pricing plans tiers", max_results=4)
    reviews_task = async_search_web(
        f"{competitor_name} reviews complaints pros cons G2", max_results=4
    )
    news_task = async_search_web(f"{competitor_name} product launch changelog news 2025 2026", max_results=3)
    hn_task = search_hacker_news(competitor_name, competitor_name=competitor_name, limit=4)
    reddit_task = search_reddit(f"{competitor_name} review OR alternative OR pricing", competitor_name=competitor_name, limit=4)
    gh_task = search_github_repos(competitor_name, competitor_name=competitor_name, limit=2)

    raw_results = await asyncio.gather(
        features_task,
        pricing_task,
        reviews_task,
        news_task,
        hn_task,
        reddit_task,
        gh_task,
        return_exceptions=True,
    )
    feature_hits = _unwrap_results("features", competitor_name, raw_results[0])
    pricing_hits = _unwrap_results("pricing", competitor_name, raw_results[1])
    review_hits = _unwrap_results("reviews", competitor_name, raw_results[2])
    news_hits = _unwrap_results("news", competitor_name, raw_results[3])
    hn_items = _unwrap_results("hackernews", competitor_name, raw_results[4])
    reddit_items = _unwrap_results("reddit", competitor_name, raw_results[5])
    gh_items = _unwrap_results("github", competitor_name, raw_results[6])

    citations: list[SourceCitationInput] = []
    for hit in feature_hits + review_hits + news_hits:
        citations.append(
            SourceCitationInput(
                competitor_name=competitor_name,
                source_type="web",
                title=hit.title,
                url=hit.url,
                snippet=hit.snippet,
            )
        )
    for hit in pricing_hits:
        citations.append(
            SourceCitationInput(
                competitor_name=competitor_name,
                source_type="pricing_page",
                title=hit.title,
                url=hit.url,
                snippet=hit.snippet,
            )
        )

    # Scrape candidate homepage + top pricing URL safely for deeper primary evidence
    scrape_targets: list[tuple[str, str]] = []
    if website:
        scrape_targets.append((website, "web"))
        base = website.rstrip("/")
        scrape_targets.append((f"{base}/pricing", "pricing_page"))
    elif pricing_hits:
        scrape_targets.append((pricing_hits[0].url, "pricing_page"))

    async def _safe_scrape(target_url: str, source_type: str) -> SourceCitationInput | None:
        try:
            page = await fetch_clean_page(target_url)
            if source_type == "pricing_page" and (
                page is None or len(page.content) < 200
            ):
                pw_page = await fetch_pricing_page_playwright(target_url)
                if pw_page is not None and (
                    page is None or len(pw_page.content) >= len(page.content)
                ):
                    page = pw_page
            if page is None or not page.content:
                return None
            return SourceCitationInput(
                competitor_name=competitor_name,
                source_type=source_type,  # type: ignore[arg-type]
                title=page.title,
                url=page.url,
                snippet=page.content[:1800],
            )
        except UnsafeUrlError:
            return None

    scraped_results = await asyncio.gather(
        *[_safe_scrape(u, st) for u, st in scrape_targets[:3]]
    )
    for item in scraped_results:
        if item is not None:
            citations.append(item)

    citations.extend(hn_items)
    citations.extend(reddit_items)
    citations.extend(gh_items)

    return deduplicate_citations(citations)
