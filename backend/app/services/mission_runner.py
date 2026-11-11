"""Background LangGraph mission runner with live SSE pub/sub event streaming."""

import asyncio
import logging
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

from langgraph.types import Command

from app.agents.graph import build_intelligence_graph
from app.agents.nodes import (
    clear_runtime_settings,
    get_runtime_settings,
    redact_secrets,
    register_runtime_settings,
    reset_runtime_settings_context,
    set_runtime_settings_context,
)
from app.config import Settings
from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.schemas.intelligence import AgentEventPayload, CompetitorCandidate

logger = logging.getLogger(__name__)


class MissionRunner:
    """Coordinates async mission execution, HITL resume, 1-click retry, and SSE broadcasting."""

    def __init__(self, db: Database, vector_store: DossierVectorStore) -> None:
        self.db = db
        self.vector_store = vector_store
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._last_node: dict[str, str] = {}
        self._last_competitor: dict[str, str] = {}

    async def publish_event(self, event: AgentEventPayload) -> None:
        """Broadcast an AgentEventPayload to all active SSE subscribers for run_id."""
        if event.event_type != "error" and event.node_name != "orchestrator":
            self._last_node[event.run_id] = event.node_name
            comp_name = event.metadata.get("competitor_name")
            if isinstance(comp_name, str) and comp_name.strip():
                self._last_competitor[event.run_id] = comp_name.strip()
        payload = event.model_dump()
        for queue in list(self._subscribers.get(event.run_id, set())):
            await queue.put(payload)

    async def _handle_run_failure(
        self,
        run_id: str,
        exc: Exception,
        runtime_settings: Settings | None = None,
    ) -> None:
        failed_node = self._last_node.get(run_id, "orchestrator")
        failed_competitor = self._last_competitor.get(run_id)
        err_detail = redact_secrets(str(exc), runtime_settings)
        logger.exception("Mission %s failed in node %s", run_id, failed_node)
        err_msg = f"Mission execution failed in '{failed_node}': {err_detail}"
        self.db.update_run_status(
            run_id, status="failed", error_message=err_msg, completed=True
        )
        err_metadata: dict[str, Any] = {
            "node_status": "failed",
            "failed_node": failed_node,
            "error_detail": err_detail,
            "recoverable": True,
        }
        if failed_competitor:
            err_metadata["competitor_name"] = failed_competitor
        err_event = AgentEventPayload(
            run_id=run_id,
            node_name=failed_node,
            event_type="error",
            message=err_msg,
            metadata=err_metadata,
        )
        self.db.save_event(err_event)
        await self.publish_event(err_event)

    async def _run_graph(
        self,
        run_id: str,
        thread_id: str,
        graph_input: Any,
        runtime_settings: Settings | None = None,
    ) -> None:
        config = {"configurable": {"thread_id": thread_id}}
        effective_settings = runtime_settings or get_runtime_settings(run_id)
        if runtime_settings is not None:
            register_runtime_settings(run_id, runtime_settings)
        token = set_runtime_settings_context(effective_settings)
        try:
            async with build_intelligence_graph(
                db=self.db,
                vector_store=self.vector_store,
                event_callback=self.publish_event,
            ) as graph:
                await graph.ainvoke(graph_input, config=config)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            await self._handle_run_failure(run_id, exc, effective_settings)
        finally:
            reset_runtime_settings_context(token)
            run = self.db.get_run(run_id)
            if run and run["status"] in {"completed", "failed"}:
                clear_runtime_settings(run_id)

    async def _run_retry_graph(
        self,
        run_id: str,
        thread_id: str,
        initial_state: dict[str, Any],
        updates: dict[str, Any],
        runtime_settings: Settings | None = None,
    ) -> None:
        config = {"configurable": {"thread_id": thread_id}}
        effective_settings = runtime_settings or get_runtime_settings(run_id)
        if runtime_settings is not None:
            register_runtime_settings(run_id, runtime_settings)
        token = set_runtime_settings_context(effective_settings)
        try:
            async with build_intelligence_graph(
                db=self.db,
                vector_store=self.vector_store,
                event_callback=self.publish_event,
            ) as graph:
                snapshot = await graph.aget_state(config)
                if snapshot is not None and getattr(snapshot, "next", None):
                    await graph.aupdate_state(config, updates)
                    await graph.ainvoke(None, config=config)
                else:
                    fresh_config = {"configurable": {"thread_id": f"{thread_id}-retry-{uuid4().hex[:6]}"}}
                    await graph.ainvoke(initial_state, config=fresh_config)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            await self._handle_run_failure(run_id, exc, effective_settings)
        finally:
            reset_runtime_settings_context(token)
            run = self.db.get_run(run_id)
            if run and run["status"] in {"completed", "failed"}:
                clear_runtime_settings(run_id)

    async def start_mission(
        self,
        run_id: str,
        initial_state: dict[str, Any],
        runtime_settings: Settings | None = None,
    ) -> None:
        """Spawn background execution until the HITL discovery interrupt."""
        thread_id = initial_state["run_id"]
        run = self.db.get_run(run_id)
        if run:
            thread_id = run["thread_id"]
        if runtime_settings is not None:
            register_runtime_settings(run_id, runtime_settings)
        task = asyncio.create_task(
            self._run_graph(run_id, thread_id, initial_state, runtime_settings=runtime_settings)
        )
        self._tasks[run_id] = task

    async def resume_mission(
        self,
        run_id: str,
        approved_competitors: list[dict[str, Any]],
        runtime_settings: Settings | None = None,
    ) -> None:
        """Resume a paused mission from the HITL interrupt with approved competitors."""
        run = self.db.get_run(run_id)
        if not run:
            raise ValueError(f"Unknown mission run {run_id}")
        if runtime_settings is not None:
            register_runtime_settings(run_id, runtime_settings)
        task = asyncio.create_task(
            self._run_graph(
                run_id,
                run["thread_id"],
                Command(resume=approved_competitors),
                runtime_settings=runtime_settings,
            )
        )
        self._tasks[run_id] = task

    async def retry_mission(
        self,
        run_id: str,
        skip_competitors: list[str] | None = None,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        runtime_settings: Settings | None = None,
    ) -> None:
        """Recover a failed or stalled mission from checkpoint or fresh discovery."""
        run = self.db.get_run(run_id)
        if not run:
            raise ValueError(f"Unknown mission run {run_id}")
        ws = self.db.get_workspace(run["workspace_id"])
        if not ws:
            raise ValueError(f"Unknown workspace {run['workspace_id']}")

        existing_task = self._tasks.get(run_id)
        if existing_task and not existing_task.done():
            existing_task.cancel()

        provider = llm_provider or run["llm_provider"]
        model = llm_model or run["llm_model"]
        skip_set = {s.strip().lower() for s in (skip_competitors or []) if s.strip()}

        raw_approved = run.get("approved_competitors") or []
        approved_candidates = [CompetitorCandidate.model_validate(c) for c in raw_approved]
        remaining_approved = [
            c for c in approved_candidates if c.name.strip().lower() not in skip_set
        ]
        if approved_candidates and not remaining_approved:
            raise ValueError(
                "Cannot skip all approved competitors; at least one competitor is required."
            )

        next_status = "researching" if remaining_approved else "discovering"
        self.db.reset_run_for_retry(
            run_id=run_id,
            status=next_status,  # type: ignore[arg-type]
            llm_provider=provider,
            llm_model=model,
            approved_competitors=remaining_approved if approved_candidates else None,
        )

        retry_node = self._last_node.get(run_id) or next_status
        retry_event = AgentEventPayload(
            run_id=run_id,
            node_name=retry_node,
            event_type="status",
            message=(
                f"Retrying mission from '{retry_node}' using {provider}/{model}"
                + (f" (skipping: {', '.join(skip_competitors or [])})" if skip_set else "")
                + "."
            ),
            metadata={
                "node_status": "retrying",
                "skipped_competitors": list(skip_competitors or []),
                "llm_provider": provider,
                "llm_model": model,
            },
        )
        self.db.save_event(retry_event)
        await self.publish_event(retry_event)

        if runtime_settings is not None:
            register_runtime_settings(run_id, runtime_settings)

        seed_names = [c.name for c in remaining_approved] if remaining_approved else []
        initial_state = {
            "run_id": run_id,
            "workspace_id": ws["id"],
            "product_name": ws["product_name"],
            "product_description": ws["product_description"],
            "target_segment": ws["target_segment"],
            "seed_competitors": seed_names,
            "llm_provider": provider,
            "llm_model": model,
            "discovered_competitors": [
                CompetitorCandidate.model_validate(c)
                for c in (run.get("discovered_competitors") or [])
            ],
            "approved_competitors": remaining_approved,
            "research_findings": [],
            "citations": [],
            "critic_report": None,
            "research_gaps": [],
            "iteration_count": 0,
            "dossier": None,
            "diff_summary": None,
        }
        updates: dict[str, Any] = {
            "llm_provider": provider,
            "llm_model": model,
        }
        if remaining_approved:
            updates["approved_competitors"] = remaining_approved

        task = asyncio.create_task(
            self._run_retry_graph(
                run_id=run_id,
                thread_id=run["thread_id"],
                initial_state=initial_state,
                updates=updates,
                runtime_settings=runtime_settings,
            )
        )
        self._tasks[run_id] = task

    async def subscribe(self, run_id: str) -> AsyncIterator[dict[str, Any]]:
        """Yield historical events followed by live events for run_id."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[run_id].add(queue)
        seen_ids: set[str] = set()

        try:
            for existing in self.db.list_events(run_id):
                seen_ids.add(existing["id"])
                yield existing

            while True:
                run = self.db.get_run(run_id)
                if run and run["status"] in {"completed", "failed"} and queue.empty():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    if event["id"] not in seen_ids:
                        seen_ids.add(event["id"])
                        yield event
                    if event.get("event_type") in {"completed", "error"}:
                        break
                except TimeoutError:
                    yield {"event_type": "heartbeat", "run_id": run_id}
        finally:
            self._subscribers[run_id].discard(queue)

    async def shutdown(self) -> None:
        """Cancel any active background mission tasks on app shutdown."""
        for run_id, task in list(self._tasks.items()):
            if not task.done():
                task.cancel()
            clear_runtime_settings(run_id)
