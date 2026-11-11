"""Background scheduler for recurring workspace competitive monitors and diff webhooks."""

import asyncio
import contextlib
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx

from app.config import settings
from app.db.database import Database
from app.schemas.intelligence import CompetitorCandidate, utc_now_iso
from app.services.mission_runner import MissionRunner
from app.tools.security import UnsafeUrlError, validate_public_url

logger = logging.getLogger(__name__)


def compute_next_run_at(interval: str, now: datetime | None = None) -> str | None:
    """Compute the next ISO-8601 UTC timestamp for a monitor interval."""
    base = now or datetime.now(UTC)
    if interval == "daily":
        return (base + timedelta(days=1)).isoformat()
    if interval == "weekly":
        return (base + timedelta(days=7)).isoformat()
    return None


class MonitorScheduler:
    """Lightweight asyncio loop that triggers due workspace monitors using server credentials."""

    def __init__(
        self,
        db: Database,
        runner: MissionRunner,
        poll_interval_seconds: float = 60.0,
    ) -> None:
        self.db = db
        self.runner = runner
        self.poll_interval_seconds = poll_interval_seconds
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        """Start the background monitor loop if not already running."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        """Stop the background monitor loop cleanly on shutdown."""
        if self._task is not None and not self._task.done():
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        self._task = None

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self.run_due_monitors()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Scheduled monitor poll cycle encountered an error")
            await asyncio.sleep(self.poll_interval_seconds)

    async def dispatch_webhook(self, webhook_url: str, payload: dict[str, Any]) -> bool:
        """SSRF-validate webhook_url and deliver structured diff alert JSON."""
        clean_url = webhook_url.strip()
        if not clean_url:
            return False
        try:
            safe_url = validate_public_url(clean_url)
        except UnsafeUrlError:
            logger.warning("Blocked unsafe monitor webhook URL")
            return False

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(safe_url, json=payload)
                resp.raise_for_status()
            return True
        except httpx.HTTPError:
            logger.warning("Failed to deliver monitor webhook to %s", safe_url)
            return False

    async def trigger_monitor(
        self, monitor: dict[str, Any], now: datetime | None = None
    ) -> dict[str, Any]:
        """Run one due workspace monitor using server env keys or local Ollama only."""
        ts = now or datetime.now(UTC)
        now_iso = ts.isoformat()
        ws_id = monitor["workspace_id"]
        interval = str(monitor.get("interval") or "off")
        next_run_at = compute_next_run_at(interval, now=ts)

        ws = self.db.get_workspace(ws_id)
        if not ws:
            self.db.update_monitor_run_result(
                ws_id,
                last_run_at=now_iso,
                next_run_at=next_run_at,
                last_status="skipped_missing_workspace",
            )
            return self.db.get_workspace_monitor(ws_id)

        provider = (monitor.get("llm_provider") or settings.default_llm_provider or "").strip()
        model = (monitor.get("llm_model") or settings.default_llm_model or "").strip()

        if not provider or not model:
            self.db.update_monitor_run_result(
                ws_id,
                last_run_at=now_iso,
                next_run_at=next_run_at,
                last_status="skipped_no_provider",
                last_diff_headline="Monitor skipped: no server LLM provider/model configured.",
            )
            return self.db.get_workspace_monitor(ws_id)

        unavailable = settings.provider_unavailable_reason(
            provider, model  # type: ignore[arg-type]
        )
        if unavailable:
            self.db.update_monitor_run_result(
                ws_id,
                last_run_at=now_iso,
                next_run_at=next_run_at,
                last_status="skipped_no_provider",
                last_diff_headline=unavailable,
            )
            return self.db.get_workspace_monitor(ws_id)

        seed_competitors: list[CompetitorCandidate] = []
        latest_run_id = ws.get("latest_run_id")
        if latest_run_id:
            prev_run = self.db.get_run(str(latest_run_id))
            if prev_run and prev_run.get("approved_competitors"):
                seed_competitors = [
                    CompetitorCandidate.model_validate(c)
                    for c in prev_run["approved_competitors"]
                ]

        if not seed_competitors:
            latest_snap = self.db.get_latest_snapshot_for_workspace(ws_id)
            if latest_snap and latest_snap.get("dossier", {}).get("battlecards"):
                seed_competitors = [
                    CompetitorCandidate(
                        name=bc["competitor_name"],
                        website=bc.get("website", ""),
                        category="direct",
                    )
                    for bc in latest_snap["dossier"]["battlecards"][:4]
                    if bc.get("competitor_name")
                ]

        thread_id = f"monitor-{uuid4()}"
        run = self.db.create_run(
            workspace_id=ws_id,
            thread_id=thread_id,
            llm_provider=provider,
            llm_model=model,
            status="researching" if seed_competitors else "discovering",
        )
        if seed_competitors:
            self.db.save_approved_competitors(run["id"], seed_competitors)

        initial_state = {
            "run_id": run["id"],
            "workspace_id": ws_id,
            "product_name": ws["product_name"],
            "product_description": ws["product_description"],
            "target_segment": ws["target_segment"],
            "seed_competitors": [c.name for c in seed_competitors],
            "llm_provider": provider,
            "llm_model": model,
            "discovered_competitors": seed_competitors,
            "approved_competitors": seed_competitors,
            "research_findings": [],
            "citations": [],
            "critic_report": None,
            "research_gaps": [],
            "iteration_count": 0,
            "dossier": None,
            "diff_summary": None,
        }

        await self.runner.start_mission(run["id"], initial_state, runtime_settings=settings)
        task = self.runner._tasks.get(run["id"])
        if task is not None:
            await asyncio.shield(task)

        completed_run = self.db.get_run(run["id"])
        snap = self.db.get_snapshot_by_run(run["id"])
        diff_headline = (
            (snap.get("diff_summary") or {}).get("headline")
            if snap
            else (completed_run or {}).get("error_message")
        )
        status = (completed_run or {}).get("status", "failed")
        self.db.update_monitor_run_result(
            ws_id,
            last_run_at=utc_now_iso(),
            next_run_at=next_run_at,
            last_status=status,
            last_diff_headline=diff_headline,
        )

        webhook_url = monitor.get("webhook_url")
        if webhook_url and snap and (snap.get("diff_summary") or {}).get("has_changes"):
            await self.dispatch_webhook(
                webhook_url,
                {
                    "event": "workspace_monitor_diff",
                    "workspace_id": ws_id,
                    "workspace_name": ws["name"],
                    "run_id": run["id"],
                    "status": status,
                    "diff_summary": snap.get("diff_summary"),
                },
            )

        return self.db.get_workspace_monitor(ws_id)

    async def run_due_monitors(self, now: datetime | None = None) -> int:
        """Find all due monitors and execute them sequentially."""
        ts = now or datetime.now(UTC)
        due = self.db.list_due_monitors(ts.isoformat())
        count = 0
        for mon in due:
            await self.trigger_monitor(mon, now=ts)
            count += 1
        return count
