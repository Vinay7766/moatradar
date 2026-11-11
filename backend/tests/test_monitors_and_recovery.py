"""Tests for fault pinpointing, 1-click mission retry, and scheduled workspace monitors."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Self

import pytest
from fastapi.testclient import TestClient

from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.main import create_app
from app.schemas.intelligence import CompetitorCandidate
from app.services.mission_runner import MissionRunner
from app.services.monitor_scheduler import MonitorScheduler
from app.tools.security import UnsafeUrlError


async def test_mission_runner_pinpoints_last_node_on_uncaught_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = Database(str(tmp_path / "fail.db"))
    db.init_db()
    vs = DossierVectorStore(str(tmp_path / "chroma_fail"))
    ws = db.create_workspace("WS", "SignalPulse", "Agentic CI workbench", "B2B SaaS PMs")
    run = db.create_run(ws["id"], thread_id="t-fail-1", llm_provider="gemini", llm_model="gemini-2.5-flash")

    runner = MissionRunner(db=db, vector_store=vs)

    class _FailingGraph:
        async def __aenter__(self) -> Self:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def ainvoke(self, graph_input: Any, config: Any = None) -> Any:
            from app.schemas.intelligence import AgentEventPayload

            ev = AgentEventPayload(
                run_id=run["id"],
                node_name="specialist_research",
                event_type="tool_call",
                message="Analyzing Klue...",
                metadata={"node_status": "started", "competitor_name": "Klue"},
            )
            db.save_event(ev)
            await runner.publish_event(ev)
            raise RuntimeError("Upstream DuckDuckGo timeout")

    monkeypatch.setattr("app.services.mission_runner.build_intelligence_graph", lambda **kw: _FailingGraph())

    await runner._run_graph(run["id"], run["thread_id"], {"run_id": run["id"]})

    updated = db.get_run(run["id"])
    assert updated is not None
    assert updated["status"] == "failed"
    assert updated["error_message"] is not None
    assert "specialist_research" in updated["error_message"]
    assert "Upstream DuckDuckGo timeout" in updated["error_message"]

    events = db.list_events(run["id"])
    err_events = [e for e in events if e["event_type"] == "error"]
    assert len(err_events) == 1
    assert err_events[0]["node_name"] == "specialist_research"
    assert err_events[0]["metadata"]["failed_node"] == "specialist_research"
    assert err_events[0]["metadata"]["error_detail"] == "Upstream DuckDuckGo timeout"
    assert err_events[0]["metadata"]["recoverable"] is True
    assert err_events[0]["metadata"]["competitor_name"] == "Klue"


def test_retry_endpoint_skips_competitor_and_uses_ephemeral_byok(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = Database(str(tmp_path / "retry.db"))
    db.init_db()
    vs = DossierVectorStore(str(tmp_path / "chroma_retry"))
    app = create_app(db_override=db, vector_store_override=vs)

    ws = db.create_workspace("WS", "SignalPulse", "Agentic CI workbench", "B2B SaaS PMs")
    run = db.create_run(ws["id"], thread_id="t-retry-1", llm_provider="gemini", llm_model="gemini-2.5-flash")
    db.save_approved_competitors(
        run["id"],
        [
            CompetitorCandidate(name="Klue", website="https://klue.com", category="direct"),
            CompetitorCandidate(name="Crayon", website="https://crayon.co", category="direct"),
        ],
    )
    db.update_run_status(run["id"], "failed", error_message="Timeout on Crayon", completed=True)

    captured: list[dict[str, Any]] = []

    async def fake_retry_mission(
        run_id: str,
        skip_competitors: list[str] | None = None,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        runtime_settings: Any = None,
    ) -> None:
        captured.append(
            {
                "run_id": run_id,
                "skip_competitors": skip_competitors,
                "llm_provider": llm_provider,
                "llm_model": llm_model,
                "runtime_settings": runtime_settings,
            }
        )

    with TestClient(app) as client:
        monkeypatch.setattr(client.app.state.runner, "retry_mission", fake_retry_mission)  # type: ignore[attr-defined]
        res = client.post(
            f"/api/missions/{run['id']}/retry",
            headers={"X-LLM-API-Key": "AIza-retry-ephem"},
            json={
                "skip_competitors": ["Crayon"],
                "llm_provider": "gemini",
                "llm_model": "gemini-2.5-pro",
            },
        )
        assert res.status_code == 202
        assert "AIza-retry-ephem" not in res.text
        assert len(captured) == 1
        assert captured[0]["skip_competitors"] == ["Crayon"]
        assert captured[0]["runtime_settings"].get_api_key("gemini") == "AIza-retry-ephem"
        assert "AIza-retry-ephem" not in str(db.get_run(run["id"]))
        assert "AIza-retry-ephem" not in str(db.list_events(run["id"]))


def test_workspace_monitor_crud_and_ssrf_validation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = Database(str(tmp_path / "mon.db"))
    db.init_db()
    vs = DossierVectorStore(str(tmp_path / "chroma_mon"))
    app = create_app(db_override=db, vector_store_override=vs)

    with TestClient(app) as client:
        ws = client.post(
            "/api/workspaces",
            json={
                "name": "Monitor WS",
                "product_name": "SignalPulse",
                "product_description": "Automated PM competitive intelligence desk",
                "target_segment": "B2B SaaS Product Managers",
            },
        ).json()["workspace"]

        default_mon = client.get(f"/api/workspaces/{ws['id']}/monitor")
        assert default_mon.status_code == 200
        assert default_mon.json()["monitor"]["interval"] == "off"

        ssrf_res = client.put(
            f"/api/workspaces/{ws['id']}/monitor",
            json={
                "interval": "daily",
                "webhook_url": "http://127.0.0.1:8080/internal-hook",
                "llm_provider": "ollama",
                "llm_model": "gemma4:12b",
            },
        )
        assert ssrf_res.status_code == 400

        monkeypatch.setattr("app.api.routes.validate_public_url", lambda url: url)
        ok_res = client.put(
            f"/api/workspaces/{ws['id']}/monitor",
            json={
                "interval": "weekly",
                "webhook_url": "https://hooks.example.com/ci-alerts",
                "llm_provider": "ollama",
                "llm_model": "gemma4:12b",
            },
        )
        assert ok_res.status_code == 200
        mon = ok_res.json()["monitor"]
        assert mon["interval"] == "weekly"
        assert mon["webhook_url"] == "https://hooks.example.com/ci-alerts"
        assert mon["next_run_at"] is not None


async def test_monitor_scheduler_handles_missing_provider_and_webhook_dispatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = Database(str(tmp_path / "sched.db"))
    db.init_db()
    vs = DossierVectorStore(str(tmp_path / "chroma_sched"))
    runner = MissionRunner(db=db, vector_store=vs)
    scheduler = MonitorScheduler(db=db, runner=runner, poll_interval_seconds=60.0)

    ws = db.create_workspace("Sched WS", "SignalPulse", "Agentic CI workbench", "B2B SaaS PMs")
    past_due = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    db.upsert_workspace_monitor(
        workspace_id=ws["id"],
        interval="daily",
        webhook_url="https://hooks.example.com/ci",
        llm_provider="gemini",
        llm_model="gemini-2.5-flash",
        next_run_at=past_due,
    )

    monkeypatch.setattr("app.config.settings.gemini_api_key", "")
    triggered = await scheduler.run_due_monitors()
    assert triggered == 1
    mon = db.get_workspace_monitor(ws["id"])
    assert mon["last_status"] == "skipped_no_provider"
    assert mon["next_run_at"] > past_due

    # Verify dispatch_webhook enforces SSRF check before posting
    def _block_local(url: str) -> str:
        raise UnsafeUrlError("Blocked local URL")

    monkeypatch.setattr("app.services.monitor_scheduler.validate_public_url", _block_local)
    sent = await scheduler.dispatch_webhook("http://127.0.0.1/hook", {"headline": "Test"})
    assert sent is False


async def test_mission_runner_retry_recovers_failed_run_end_to_end(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import Settings
    from tests.test_graph_critic import _async_return, _FakeChatModel

    db = Database(str(tmp_path / "retry_e2e.db"))
    db.init_db()
    vs = DossierVectorStore(str(tmp_path / "chroma_retry_e2e"))
    ws = db.create_workspace("Retry WS", "SignalPulse", "Agentic CI workbench", "B2B SaaS PMs")
    run = db.create_run(ws["id"], thread_id="t-retry-e2e", llm_provider="gemini", llm_model="gemini-2.5-flash")
    db.save_approved_competitors(
        run["id"],
        [
            CompetitorCandidate(name="Klue", website="https://klue.com", category="direct"),
            CompetitorCandidate(name="Crayon", website="https://crayon.co", category="direct"),
        ],
    )
    db.update_run_status(run["id"], "failed", error_message="Crayon timed out", completed=True)

    counter = {"calls": 1}  # Make critic pass cleanly on retry
    monkeypatch.setattr("app.agents.nodes.create_chat_model", lambda *a, **kw: _FakeChatModel(counter))
    monkeypatch.setattr(
        "app.agents.nodes.collect_competitor_evidence",
        lambda name, website="": _async_return([]),
    )

    runner = MissionRunner(db=db, vector_store=vs)
    ephem = Settings(gemini_api_key="ephem-retry-secret")
    await runner.retry_mission(
        run_id=run["id"],
        skip_competitors=["Crayon"],
        llm_provider="gemini",
        llm_model="gemini-2.5-flash",
        runtime_settings=ephem,
    )
    task = runner._tasks[run["id"]]
    await task

    recovered = db.get_run(run["id"])
    assert recovered is not None
    assert recovered["status"] == "completed"
    assert recovered["error_message"] is None
    assert [c["name"] for c in recovered["approved_competitors"]] == ["Klue"]
    assert db.get_snapshot_by_run(run["id"]) is not None
    assert "ephem-retry-secret" not in str(db.list_events(run["id"]))
