"""Unit tests for SSRF-verified Playwright pricing scraper fallback."""

import builtins
import socket
import sys
from types import ModuleType, SimpleNamespace

import pytest

from app.tools.pricing_playwright import fetch_pricing_page_playwright
from app.tools.security import UnsafeUrlError


@pytest.fixture(autouse=True)
def mock_public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_getaddrinfo(host: str, port: object, *args: object, **kwargs: object) -> list:
        if host in {"localhost", "127.0.0.1", "::1"}:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo)


async def test_playwright_scraper_rejects_ssrf_before_import(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = False

    def fail_if_imported() -> object:
        nonlocal called
        called = True
        raise AssertionError("playwright should not be imported for unsafe URLs")

    monkeypatch.setitem(sys.modules, "playwright", SimpleNamespace(async_api=fail_if_imported))
    with pytest.raises(UnsafeUrlError):
        await fetch_pricing_page_playwright("http://127.0.0.1:8080/pricing")
    assert called is False


async def test_playwright_scraper_returns_none_when_playwright_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delitem(sys.modules, "playwright", raising=False)
    monkeypatch.delitem(sys.modules, "playwright.async_api", raising=False)

    real_import = builtins.__import__

    def fake_import(name: str, *args: object, **kwargs: object) -> object:
        if name == "playwright" or name.startswith("playwright."):
            raise ImportError("No module named 'playwright'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    result = await fetch_pricing_page_playwright("https://acme.example.com/pricing")
    assert result is None


async def test_playwright_scraper_extracts_rendered_pricing_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rendered_html = """
    <html>
      <head><title>Acme Pricing Plans</title></head>
      <body>
        <main>
          <h1>Pricing</h1>
          <p>Starter: Free forever. Pro: $29 per user/month with SSO and audit logs.</p>
        </main>
      </body>
    </html>
    """

    class FakePage:
        def __init__(self) -> None:
            self.url = "https://acme.example.com/pricing"

        async def goto(self, url: str, wait_until: str = "domcontentloaded", timeout: int = 12000) -> object:
            return SimpleNamespace(status=200)

        async def wait_for_load_state(self, state: str, timeout: int = 3000) -> None:
            return None

        async def content(self) -> str:
            return rendered_html

    class FakeContext:
        async def new_page(self) -> FakePage:
            return FakePage()

        async def close(self) -> None:
            return None

    class FakeBrowser:
        async def new_context(self, **kwargs: object) -> FakeContext:
            return FakeContext()

        async def close(self) -> None:
            return None

    class FakeChromium:
        async def launch(self, headless: bool = True) -> FakeBrowser:
            return FakeBrowser()

    class FakePlaywrightCM:
        async def __aenter__(self) -> object:
            return SimpleNamespace(chromium=FakeChromium())

        async def __aexit__(self, *args: object) -> None:
            return None

    fake_async_api = ModuleType("playwright.async_api")
    fake_async_api.async_playwright = lambda: FakePlaywrightCM()  # type: ignore[attr-defined]
    fake_playwright = ModuleType("playwright")
    fake_playwright.async_api = fake_async_api  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.async_api", fake_async_api)

    page = await fetch_pricing_page_playwright("https://acme.example.com/pricing", timeout=5.0)
    assert page is not None
    assert page.url == "https://acme.example.com/pricing"
    assert page.title == "Acme Pricing Plans"
    assert "$29 per user/month" in page.content


async def test_playwright_scraper_propagates_ssrf_on_redirect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    closed = False

    class FakePage:
        url = "http://127.0.0.1/internal-admin"

        async def goto(self, url: str, wait_until: str = "domcontentloaded", timeout: int = 12000) -> object:
            return SimpleNamespace(status=200)

        async def content(self) -> str:
            return "<html><body>secret</body></html>"

    class FakeContext:
        async def new_page(self) -> FakePage:
            return FakePage()

        async def close(self) -> None:
            return None

    class FakeBrowser:
        async def new_context(self, **kwargs: object) -> FakeContext:
            return FakeContext()

        async def close(self) -> None:
            nonlocal closed
            closed = True

    class FakePlaywrightCM:
        async def __aenter__(self) -> object:
            return SimpleNamespace(chromium=SimpleNamespace(launch=self._launch))

        async def _launch(self, headless: bool = True) -> FakeBrowser:
            return FakeBrowser()

        async def __aexit__(self, *args: object) -> None:
            return None

    fake_async_api = ModuleType("playwright.async_api")
    fake_async_api.async_playwright = lambda: FakePlaywrightCM()  # type: ignore[attr-defined]
    fake_playwright = ModuleType("playwright")
    fake_playwright.async_api = fake_async_api  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.async_api", fake_async_api)

    with pytest.raises(UnsafeUrlError):
        await fetch_pricing_page_playwright("https://acme.example.com/pricing")
    assert closed is True


async def test_playwright_scraper_returns_none_on_browser_launch_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingChromium:
        async def launch(self, headless: bool = True) -> object:
            raise RuntimeError("Executable doesn't exist")

    class FakePlaywrightCM:
        async def __aenter__(self) -> object:
            return SimpleNamespace(chromium=FailingChromium())

        async def __aexit__(self, *args: object) -> None:
            return None

    fake_async_api = ModuleType("playwright.async_api")
    fake_async_api.async_playwright = lambda: FakePlaywrightCM()  # type: ignore[attr-defined]
    fake_playwright = ModuleType("playwright")
    fake_playwright.async_api = fake_async_api  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "playwright", fake_playwright)
    monkeypatch.setitem(sys.modules, "playwright.async_api", fake_async_api)

    result = await fetch_pricing_page_playwright("https://acme.example.com/pricing")
    assert result is None
