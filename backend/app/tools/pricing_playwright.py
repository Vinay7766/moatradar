"""Optional SSRF-safe Playwright headless browser fallback for JS-rendered pricing pages."""

import logging

from app.tools.security import UnsafeUrlError, validate_public_url
from app.tools.web_scraper import ScrapedPage, _extract_title_and_text

logger = logging.getLogger(__name__)

_MAX_HTML_BYTES = 1_500_000
_USER_AGENT = (
    "Mozilla/5.0 (compatible; CMIDeskResearchBot/1.0; "
    "+https://localhost/cmi-desk)"
)


async def fetch_pricing_page_playwright(
    url: str, timeout: float = 12.0
) -> ScrapedPage | None:
    """Render a pricing page with headless Chromium after strict SSRF validation.

    Raises UnsafeUrlError immediately if the target URL or any final redirect URL
    fails public-IP validation. Returns None cleanly when Playwright or Chromium
    is unavailable or navigation fails.
    """
    safe_url = validate_public_url(url)

    try:
        import playwright.async_api as pw_async_api
    except ImportError:
        logger.warning(
            "Playwright is not installed; skipping headless pricing scrape for %s",
            safe_url,
        )
        return None

    async_playwright = pw_async_api.async_playwright
    pw_error = getattr(pw_async_api, "Error", RuntimeError)
    browser_errors = (pw_error, TimeoutError, OSError, RuntimeError, ValueError)
    timeout_ms = max(1, int(timeout * 1000))
    browser = None
    context = None

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=_USER_AGENT)
            page = await context.new_page()

            response = await page.goto(
                safe_url, wait_until="domcontentloaded", timeout=timeout_ms
            )
            if hasattr(page, "wait_for_load_state"):
                try:
                    await page.wait_for_load_state(
                        "networkidle", timeout=min(3000, timeout_ms)
                    )
                except browser_errors as exc:
                    # Dynamic analytics/beacons may keep connections open; DOM is ready.
                    logger.debug("Playwright networkidle wait skipped for %s: %s", safe_url, exc)

            final_url = validate_public_url(getattr(page, "url", "") or safe_url)
            if response is not None and getattr(response, "status", 200) >= 400:
                return None

            html = (await page.content())[:_MAX_HTML_BYTES]
    except UnsafeUrlError:
        raise
    except browser_errors as exc:
        logger.warning("Playwright pricing scrape failed for %s: %s", safe_url, exc)
        return None
    finally:
        if context is not None:
            try:
                await context.close()
            except browser_errors as exc:
                logger.debug("Ignoring Playwright context close error: %s", exc)
        if browser is not None:
            try:
                await browser.close()
            except browser_errors as exc:
                logger.debug("Ignoring Playwright browser close error: %s", exc)

    if not html:
        return None

    title, body = _extract_title_and_text(html, final_url)
    if not body:
        return None
    return ScrapedPage(url=final_url, title=title, content=body)
