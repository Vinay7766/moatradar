"""LangGraph StateGraph compilation with SQLite checkpointing for HITL."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph

from app.agents.nodes import EventCallback, make_nodes
from app.agents.state import IntelligenceState
from app.config import settings
from app.db.database import Database
from app.db.vector_store import DossierVectorStore


def _route_after_critic(state: IntelligenceState) -> str:
    """Route back to targeted re-research if Critic failed and retries remain."""
    report = state.get("critic_report")
    iteration = state.get("iteration_count", 0)
    if (
        report is not None
        and not report.passed
        and report.gaps
        and iteration < settings.max_critic_iterations
    ):
        return "targeted_research"
    return "synthesizer"


@asynccontextmanager
async def build_intelligence_graph(
    db: Database,
    vector_store: DossierVectorStore,
    checkpoint_path: str | None = None,
    event_callback: EventCallback | None = None,
) -> AsyncIterator[Any]:
    """Compile the stateful LangGraph workflow backed by AsyncSqliteSaver."""
    cp_path = checkpoint_path or str(Path(db.db_path).with_name("checkpoints.db"))
    Path(cp_path).parent.mkdir(parents=True, exist_ok=True)

    nodes = make_nodes(db=db, vector_store=vector_store, event_callback=event_callback)
    builder = StateGraph(IntelligenceState)

    for name, fn in nodes.items():
        builder.add_node(name, fn)

    builder.add_edge(START, "discovery")
    builder.add_edge("discovery", "hitl_approval")
    builder.add_edge("hitl_approval", "specialist_research")
    builder.add_edge("specialist_research", "critic_verifier")
    builder.add_conditional_edges(
        "critic_verifier",
        _route_after_critic,
        {
            "targeted_research": "targeted_research",
            "synthesizer": "synthesizer",
        },
    )
    builder.add_edge("targeted_research", "critic_verifier")
    builder.add_edge("synthesizer", "memory_indexer")
    builder.add_edge("memory_indexer", END)

    async with AsyncSqliteSaver.from_conn_string(cp_path) as checkpointer:
        graph = builder.compile(checkpointer=checkpointer)
        yield graph
