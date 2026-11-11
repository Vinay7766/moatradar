"""Unit tests for zero-key live data collection tools."""

import socket
from typing import Self

import httpx
import pytest
import respx

from app.tools.community import search_github_repos, search_hacker_news, search_reddit
from app.tools.registry import collect_competitor_evidence
from app.tools.security import UnsafeUrlError
from app.tools.web_scraper import ScrapedPage, fetch_clean_page
from app.tools.web_search import SearchHit, search_web


@pytest.fixture(autouse=True)
def mock_public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_getaddrinfo(host: str, port: object, *args: object, **kwargs: object) -> list:
        if host in {"localhost", "127.0.0.1", "::1"}:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


def test_search_web_normalizes_ddgs_results(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeDDGS:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def text(self, query: str, max_results: int = 5) -> list[dict]:
            return [
                {
                    "title": "Acme Pricing",
                    "href": "https://acme.example.com/pricing",
                    "body": "Starter plan starts at $19/user/month.",
                }
            ]

    monkeypatch.setattr("app.tools.web_search.DDGS", FakeDDGS)
    hits = search_web("Acme pricing", max_results=3)
    assert len(hits) == 1
    assert hits[0].url == "https://acme.example.com/pricing"
    assert "$19" in hits[0].snippet


def test_search_web_handles_ddgs_exception_gracefully(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ddgs.exceptions import DDGSException

    class FailingDDGS:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def text(self, query: str, max_results: int = 5) -> list[dict]:
            raise DDGSException("No results found.")

    monkeypatch.setattr("app.tools.web_search.DDGS", FailingDDGS)
    hits = search_web('"Plane" pricing plans tiers', max_results=4)
    assert hits == []


def test_search_web_retries_unquoted_when_quoted_raises_ddgs_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from ddgs.exceptions import DDGSException

    seen_queries: list[str] = []

    class FallbackDDGS:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def text(self, query: str, max_results: int = 5) -> list[dict]:
            seen_queries.append(query)
            if '"' in query:
                raise DDGSException("No results found.")
            return [{"title": "Plane Pricing", "href": "https://plane.so/pricing", "body": "Free and Pro tiers."}]

    monkeypatch.setattr("app.tools.web_search.DDGS", FallbackDDGS)
    hits = search_web('"Plane" pricing plans tiers', max_results=4)
    assert seen_queries == ['"Plane" pricing plans tiers', "Plane pricing plans tiers"]
    assert len(hits) == 1
    assert hits[0].url == "https://plane.so/pricing"


@respx.mock
async def test_fetch_clean_page_extracts_html_text() -> None:
    respx.get("https://acme.example.com/pricing").mock(
        return_value=httpx.Response(
            200,
            text="""
            <html><head><title>Acme Pricing</title></head>
            <body>
              <nav>Menu</nav>
              <main>
                <h1>Simple Pricing</h1>
                <p>Pro plan is $49 per seat monthly with SSO included.</p>
              </main>
            </body></html>
            """,
            headers={"content-type": "text/html"},
        )
    )
    page = await fetch_clean_page("https://acme.example.com/pricing")
    assert page is not None
    assert "Pro plan is $49 per seat monthly" in page.content
    assert page.title == "Acme Pricing"


async def test_fetch_clean_page_rejects_ssrf_url() -> None:
    with pytest.raises(UnsafeUrlError):
        await fetch_clean_page("http://127.0.0.1:8000/admin")


@respx.mock
async def test_search_hacker_news_parses_algolia_hits() -> None:
    respx.get("https://hn.algolia.com/api/v1/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "hits": [
                    {
                        "objectID": "12345",
                        "title": "Ask HN: Alternatives to Klue?",
                        "url": "",
                        "story_text": "Enterprise pricing is way too high for startups.",
                        "points": 84,
                        "num_comments": 32,
                    }
                ]
            },
        )
    )
    items = await search_hacker_news("Klue", limit=5)
    assert len(items) == 1
    assert items[0].source_type == "hn"
    assert "12345" in items[0].url
    assert "too high" in items[0].snippet


@respx.mock
async def test_search_reddit_falls_back_to_ddgs_when_rate_limited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    respx.get("https://www.reddit.com/search.json").mock(return_value=httpx.Response(429))

    def fake_search_web(query: str, max_results: int = 5) -> list[SearchHit]:
        return [
            SearchHit(
                title="Reddit thread on Acme",
                url="https://www.reddit.com/r/SaaS/comments/abc/acme/",
                snippet="Support response time has been slow lately.",
            )
        ]

    monkeypatch.setattr("app.tools.community.search_web", fake_search_web)
    items = await search_reddit("Acme", limit=3)
    assert len(items) == 1
    assert items[0].source_type == "reddit"
    assert "reddit.com" in items[0].url


@respx.mock
async def test_search_github_repos_parses_api() -> None:
    respx.get("https://api.github.com/search/repositories").mock(
        return_value=httpx.Response(
            200,
            json={
                "items": [
                    {
                        "full_name": "acme/open-ci",
                        "html_url": "https://github.com/acme/open-ci",
                        "description": "Open-source competitive tracker",
                        "stargazers_count": 1420,
                        "language": "Python",
                    }
                ]
            },
        )
    )
    items = await search_github_repos("open-ci", limit=3)
    assert len(items) == 1
    assert items[0].source_type == "github"
    assert "1420" in items[0].snippet


async def test_collect_competitor_evidence_deduplicates_urls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.schemas.intelligence import SourceCitationInput

    async def fake_search(query: str, max_results: int = 5) -> list[SearchHit]:
        return [
            SearchHit(
                title="Acme Features",
                url="https://acme.example.com/features",
                snippet="Workflow automation and AI triage.",
            ),
            SearchHit(
                title="Acme Pricing",
                url="https://acme.example.com/pricing",
                snippet="Free tier + $29/mo Pro.",
            ),
        ]

    async def fake_scrape(url: str) -> object | None:
        return None

    async def fake_hn(
        query: str, competitor_name: str | None = None, limit: int = 5
    ) -> list[SourceCitationInput]:
        return [
            SourceCitationInput(
                competitor_name=competitor_name or "Acme",
                source_type="hn",
                title="HN review",
                url="https://news.ycombinator.com/item?id=99",
                snippet="Great UI, clunky CSV export.",
            )
        ]

    async def fake_reddit(
        query: str, competitor_name: str | None = None, limit: int = 5
    ) -> list[SourceCitationInput]:
        return []

    async def fake_gh(
        query: str, competitor_name: str | None = None, limit: int = 3
    ) -> list[SourceCitationInput]:
        return []

    monkeypatch.setattr("app.tools.registry.async_search_web", fake_search)
    monkeypatch.setattr("app.tools.registry.fetch_clean_page", fake_scrape)
    monkeypatch.setattr("app.tools.registry.fetch_pricing_page_playwright", fake_scrape)
    monkeypatch.setattr("app.tools.registry.search_hacker_news", fake_hn)
    monkeypatch.setattr("app.tools.registry.search_reddit", fake_reddit)
    monkeypatch.setattr("app.tools.registry.search_github_repos", fake_gh)

    citations = await collect_competitor_evidence("Acme", "https://acme.example.com")
    urls = [c.url for c in citations]
    assert len(urls) == len(set(urls))
    assert "https://acme.example.com/pricing" in urls
    assert "https://news.ycombinator.com/item?id=99" in urls


async def test_collect_competitor_evidence_falls_back_to_playwright_for_short_pricing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search(query: str, max_results: int = 5) -> list[SearchHit]:
        return []

    async def fake_scrape(url: str) -> ScrapedPage | None:
        if url.endswith("/pricing"):
            return ScrapedPage(url=url, title="Pricing", content="Enable JS to view pricing.")
        return None

    pw_calls: list[str] = []

    async def fake_playwright(url: str) -> ScrapedPage | None:
        pw_calls.append(url)
        return ScrapedPage(
            url=url,
            title="Acme Pricing Rendered",
            content="Starter Free, Pro $39/user/mo with SSO, Enterprise custom pricing.",
        )

    async def fake_empty(*args: object, **kwargs: object) -> list:
        return []

    monkeypatch.setattr("app.tools.registry.async_search_web", fake_search)
    monkeypatch.setattr("app.tools.registry.fetch_clean_page", fake_scrape)
    monkeypatch.setattr("app.tools.registry.fetch_pricing_page_playwright", fake_playwright)
    monkeypatch.setattr("app.tools.registry.search_hacker_news", fake_empty)
    monkeypatch.setattr("app.tools.registry.search_reddit", fake_empty)
    monkeypatch.setattr("app.tools.registry.search_github_repos", fake_empty)

    citations = await collect_competitor_evidence("Acme", "https://acme.example.com")
    assert pw_calls == ["https://acme.example.com/pricing"]
    pricing_citations = [c for c in citations if c.url == "https://acme.example.com/pricing"]
    assert len(pricing_citations) == 1
    assert "$39/user/mo" in pricing_citations[0].snippet


async def test_collect_competitor_evidence_catches_unsafe_url_from_playwright(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search(query: str, max_results: int = 5) -> list[SearchHit]:
        return []

    async def fake_scrape(url: str) -> ScrapedPage | None:
        return None

    async def fake_playwright(url: str) -> ScrapedPage | None:
        raise UnsafeUrlError("Blocked redirect to private IP")

    async def fake_empty(*args: object, **kwargs: object) -> list:
        return []

    monkeypatch.setattr("app.tools.registry.async_search_web", fake_search)
    monkeypatch.setattr("app.tools.registry.fetch_clean_page", fake_scrape)
    monkeypatch.setattr("app.tools.registry.fetch_pricing_page_playwright", fake_playwright)
    monkeypatch.setattr("app.tools.registry.search_hacker_news", fake_empty)
    monkeypatch.setattr("app.tools.registry.search_reddit", fake_empty)
    monkeypatch.setattr("app.tools.registry.search_github_repos", fake_empty)

    citations = await collect_competitor_evidence("Acme", "https://acme.example.com")
    assert citations == []
