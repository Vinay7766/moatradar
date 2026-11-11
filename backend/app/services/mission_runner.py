"""Background LangGraph mission runner with live SSE pub/sub event streaming."""

import asyncio
import logging
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any

from langgraph.types import Command

from app.agents.graph import build_intelligence_graph
from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.schemas.intelligence import AgentEventPayload

logger = logging.getLogger(__name__)


class MissionRunner:
    """Coordinates async mission execution, HITL resume, and SSE broadcasting."""

    def __init__(self, db: Database, vector_store: DossierVectorStore) -> None:
        self.db = db
        self.vector_store = vector_store
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._tasks: dict[str, asyncio.Task[None]] = {}

    async def publish_event(self, event: AgentEventPayload) -> None:
        """Broadcast an AgentEventPayload to all active SSE subscribers for run_id."""
        payload = event.model_dump()
        for queue in list(self._subscribers.get(event.run_id, set())):
            await queue.put(payload)

    async def _run_graph(
        self,
        run_id: str,
        thread_id: str,
        graph_input: Any,
    ) -> None:
        config = {"configurable": {"thread_id": thread_id}}
        try:
            async with build_intelligence_graph(
                db=self.db,
                vector_store=self.vector_store,
                event_callback=self.publish_event,
            ) as graph:
                await graph.ainvoke(graph_input, config=config)
        except Exception as exc:
            logger.exception("Mission %s failed", run_id)
            err_msg = f"Mission execution error: {exc}"
            self.db.update_run_status(
                run_id, status="failed", error_message=err_msg, completed=True
            )
            err_event = AgentEventPayload(
                run_id=run_id,
                node_name="orchestrator",
                event_type="error",
                message=err_msg,
            )
            self.db.save_event(err_event)
            await self.publish_event(err_event)

    async def start_mission(self, run_id: str, initial_state: dict[str, Any]) -> None:
        """Spawn background execution until the HITL discovery interrupt."""
        thread_id = initial_state["run_id"]
        run = self.db.get_run(run_id)
        if run:
            thread_id = run["thread_id"]
        task = asyncio.create_task(self._run_graph(run_id, thread_id, initial_state))
        self._tasks[run_id] = task

    async def resume_mission(self, run_id: str, approved_competitors: list[dict[str, Any]]) -> None:
        """Resume a paused mission from the HITL interrupt with approved competitors."""
        run = self.db.get_run(run_id)
        if not run:
            raise ValueError(f"Unknown mission run {run_id}")
        task = asyncio.create_task(
            self._run_graph(run_id, run["thread_id"], Command(resume=approved_competitors))
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
        for task in list(self._tasks.values()):
            if not task.done():
                task.cancel()
