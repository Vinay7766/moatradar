"""Tests for LLM factory, LangGraph HITL + Critic reflection loop, and RAG chat."""

from pathlib import Path
from typing import Any

import pytest
from langgraph.types import Command

from app.agents.graph import build_intelligence_graph
from app.agents.rag_chat import answer_workspace_question
from app.config import Settings
from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.llm.factory import LlmConfigurationError, create_chat_model
from app.schemas.intelligence import (
    CompetitorBattlecard,
    CompetitorCandidate,
    CriticReport,
    DomainFinding,
    DossierPayload,
    FeatureComparisonRow,
    MomentumSignal,
    OpportunityItem,
    PricingTierSnapshot,
    ResearchGap,
    SourceCitationInput,
    SwotAnalysis,
    VocSentimentItem,
)
from app.tools.web_search import SearchHit


def test_llm_factory_requires_configured_key() -> None:
    empty_settings = Settings(gemini_api_key="", openai_api_key="", anthropic_api_key="", groq_api_key="")
    with pytest.raises(LlmConfigurationError):
        create_chat_model("gemini", "gemini-2.5-flash", app_settings=empty_settings)


def test_llm_factory_supports_ollama_without_api_key() -> None:
    from langchain_ollama import ChatOllama

    ollama_settings = Settings(
        gemini_api_key="",
        openai_api_key="",
        anthropic_api_key="",
        groq_api_key="",
        ollama_base_url="http://127.0.0.1:11434/",
    )
    model = create_chat_model("ollama", "llama3.2", app_settings=ollama_settings)
    assert isinstance(model, ChatOllama)
    assert model.model == "llama3.2"
    assert model.base_url == "http://127.0.0.1:11434"

    disabled_settings = Settings(ollama_base_url="")
    with pytest.raises(LlmConfigurationError):
        create_chat_model("ollama", "llama3.2", app_settings=disabled_settings)


def test_settings_with_overrides_is_ephemeral() -> None:
    base = Settings(
        gemini_api_key="",
        openai_api_key="",
        anthropic_api_key="",
        groq_api_key="",
        ollama_base_url="http://127.0.0.1:11434",
    )
    ephemeral = base.with_overrides(
        provider="gemini",
        api_key="byok-temp-key",
        ollama_base_url="http://127.0.0.1:11435",
    )
    assert ephemeral.get_api_key("gemini") == "byok-temp-key"
    assert ephemeral.ollama_base_url == "http://127.0.0.1:11435"
    assert base.get_api_key("gemini") == ""
    assert base.ollama_base_url == "http://127.0.0.1:11434"


class _FakeStructuredModel:
    """Deterministic structured output stub for testing graph routing without external LLM billing."""

    def __init__(self, schema: type, critic_call_counter: dict[str, int]) -> None:
        self.schema = schema
        self.critic_call_counter = critic_call_counter

    async def ainvoke(self, messages: Any) -> Any:
        name = self.schema.__name__
        if name == "_DiscoveryOutput":
            return self.schema(
                competitors=[
                    CompetitorCandidate(
                        name="Klue",
                        website="https://klue.com",
                        category="direct",
                        rationale="Leading enterprise CI battlecards platform",
                    ),
                    CompetitorCandidate(
                        name="Crayon",
                        website="https://crayon.co",
                        category="direct",
                        rationale="Broad digital footprint CI monitoring",
                    ),
                ]
            )
        if name == "_SpecialistBatchOutput":
            return self.schema(
                findings=[
                    DomainFinding(
                        competitor_name="Klue",
                        domain="product",
                        summary="Sales battlecards and win-loss tracking.",
                        bullet_points=["Salesforce & Slack sync"],
                        citation_urls=["https://klue.com"],
                        gaps_noted=[],
                    ),
                    DomainFinding(
                        competitor_name="Klue",
                        domain="pricing",
                        summary="Quote-only annual enterprise pricing.",
                        bullet_points=["Starts at enterprise tier"],
                        citation_urls=["https://klue.com/pricing"],
                        gaps_noted=[],
                    ),
                ]
            )
        if name == "CriticReport":
            self.critic_call_counter["calls"] += 1
            if self.critic_call_counter["calls"] == 1:
                return CriticReport(
                    grounding_score=0.55,
                    completeness_score=0.6,
                    passed=False,
                    ungrounded_claims=["Missing VoC complaint quotes"],
                    gaps=[
                        ResearchGap(
                            competitor_name="Klue",
                            domain="voc",
                            issue="Need real user complaint citations",
                            suggested_query="Klue competitive intelligence complaints reddit",
                        )
                    ],
                    notes="Triggering targeted re-research.",
                )
            return CriticReport(
                grounding_score=0.92,
                completeness_score=0.95,
                passed=True,
                ungrounded_claims=[],
                gaps=[],
                notes="All claims grounded with citations.",
            )
        if name == "DossierPayload":
            return DossierPayload(
                executive_brief_md="## Executive Brief\nPM teams seek agile, transparent CI.",
                market_trends=["Shift toward self-serve AI CI desks"],
                feature_matrix=[
                    FeatureComparisonRow(
                        capability="Live Pricing Tracking",
                        category="Monitoring",
                        importance="high",
                        competitor_support={"Klue": "Yes"},
                        citation_urls=["https://klue.com"],
                    )
                ],
                pricing_matrix=[
                    PricingTierSnapshot(
                        competitor_name="Klue",
                        billing_model="Annual contract",
                        free_tier="No",
                        entry_price="Quote-only",
                        mid_tier="Quote-only",
                        enterprise_tier="Custom",
                        key_packaging_gates=["Seats + CRM sync"],
                        pricing_url="https://klue.com/pricing",
                        citation_urls=["https://klue.com/pricing"],
                    )
                ],
                battlecards=[
                    CompetitorBattlecard(
                        competitor_name="Klue",
                        website="https://klue.com",
                        positioning="Enterprise battlecard leader",
                        target_icp="Enterprise B2B sales",
                        key_differentiators=["Win-loss"],
                        swot=SwotAnalysis(
                            strengths=["CRM push"],
                            weaknesses=["High cost"],
                            opportunities=["Mid-market"],
                            threats=["Agentic CI"],
                        ),
                        how_to_win=["Transparent self-serve pricing"],
                        landmines_to_avoid=[],
                        citation_urls=["https://klue.com"],
                    )
                ],
                voc_insights=[
                    VocSentimentItem(
                        competitor_name="Klue",
                        sentiment="complaint",
                        platform="reddit",
                        theme="Cost & maintenance",
                        evidence_quote="Requires dedicated PMM headcount.",
                        source_url="https://reddit.com/r/ProductMarketing/1",
                    )
                ],
                momentum_signals=[
                    MomentumSignal(
                        competitor_name="Klue",
                        signal_type="launch",
                        headline="Compete Agent release",
                        takeaway="Doubling down on AI digests",
                        source_url="https://klue.com",
                    )
                ],
                opportunities=[
                    OpportunityItem(
                        title="Zero-setup Citation Verifier",
                        problem_evidence="Teams distrust unverified AI summaries",
                        recommended_feature_or_bet="Critic loop with clickable source quotes",
                        impact_score=9,
                        effort_score=4,
                        horizon="Now (0-3m)",
                        citation_urls=["https://klue.com"],
                    )
                ],
            )
        raise AssertionError(f"Unexpected schema {name}")


class _FakeChatModel:
    def __init__(self, critic_call_counter: dict[str, int]) -> None:
        self.critic_call_counter = critic_call_counter

    def with_structured_output(self, schema: type) -> _FakeStructuredModel:
        return _FakeStructuredModel(schema, self.critic_call_counter)

    async def ainvoke(self, messages: Any) -> Any:
        class _Msg:
            content = "Klue's main complaint on Reddit is high enterprise pricing [1]."

        return _Msg()


async def test_langgraph_hitl_and_critic_loop_end_to_end(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = Database(str(tmp_path / "cmi.db"))
    db.init_db()
    vector_store = DossierVectorStore(persist_dir=str(tmp_path / "chroma"))

    ws = db.create_workspace("Test WS", "SignalDesk", "Agentic PM CI workbench", "SaaS PMs")
    run = db.create_run(ws["id"], thread_id="thread-hitl-1", llm_provider="gemini", llm_model="gemini-2.5-flash")

    counter = {"calls": 0}
    monkeypatch.setattr("app.agents.nodes.create_chat_model", lambda *a, **kw: _FakeChatModel(counter))
    monkeypatch.setattr(
        "app.agents.nodes.async_search_web",
        lambda q, max_results=5: _async_return(
            [SearchHit(title="Klue CI", url="https://klue.com", snippet="Enterprise CI platform")]
        ),
    )
    monkeypatch.setattr(
        "app.agents.nodes.collect_competitor_evidence",
        lambda name, website="": _async_return(
            [
                SourceCitationInput(
                    competitor_name=name,
                    source_type="web",
                    title=f"{name} Overview",
                    url="https://klue.com",
                    snippet="Sales battlecards and pricing.",
                ),
                SourceCitationInput(
                    competitor_name=name,
                    source_type="pricing_page",
                    title=f"{name} Pricing",
                    url="https://klue.com/pricing",
                    snippet="Quote-only annual enterprise contract.",
                ),
            ]
        ),
    )

    events: list[dict] = []

    async def _emit(ev: Any) -> None:
        events.append(ev.model_dump())

    async with build_intelligence_graph(
        db=db,
        vector_store=vector_store,
        checkpoint_path=str(tmp_path / "checkpoints.db"),
        event_callback=_emit,
    ) as graph:
        config = {"configurable": {"thread_id": run["thread_id"]}}
        initial_state = {
            "run_id": run["id"],
            "workspace_id": ws["id"],
            "product_name": ws["product_name"],
            "product_description": ws["product_description"],
            "target_segment": ws["target_segment"],
            "seed_competitors": ["Klue"],
            "llm_provider": "gemini",
            "llm_model": "gemini-2.5-flash",
            "discovered_competitors": [],
            "approved_competitors": [],
            "research_findings": [],
            "citations": [],
            "critic_report": None,
            "research_gaps": [],
            "iteration_count": 0,
            "dossier": None,
            "diff_summary": None,
        }

        paused = await graph.ainvoke(initial_state, config=config)
        assert "__interrupt__" in paused
        run_after_disc = db.get_run(run["id"])
        assert run_after_disc is not None
        assert run_after_disc["status"] == "awaiting_approval"
        assert len(run_after_disc["discovered_competitors"]) == 2

        # Resume with PM-approved list (only Klue kept)
        approved = [CompetitorCandidate(name="Klue", website="https://klue.com", category="direct")]
        resumed = await graph.ainvoke(Command(resume=[c.model_dump() for c in approved]), config=config)

        assert counter["calls"] == 2  # Critic rejected once, passed on iteration 2
        assert resumed["dossier"] is not None
        snap = db.get_snapshot_by_run(run["id"])
        assert snap is not None
        assert snap["dossier"]["battlecards"][0]["competitor_name"] == "Klue"

        # Verify structured node telemetry metadata was emitted
        statuses = [ev["metadata"].get("node_status") for ev in events if ev.get("metadata")]
        assert "started" in statuses
        assert "paused" in statuses
        assert "completed" in statuses
        specialist_done = [
            ev
            for ev in events
            if ev["node_name"] == "specialist_research"
            and ev["metadata"].get("node_status") == "completed"
            and ev["metadata"].get("competitor_name") == "Klue"
        ]
        assert specialist_done
        assert specialist_done[0]["metadata"].get("duration_ms") is not None
        assert specialist_done[0]["metadata"].get("total_tasks") == 1

    # Verify RAG follow-up Q&A works on indexed snapshot
    monkeypatch.setattr("app.agents.rag_chat.create_chat_model", lambda *a, **kw: _FakeChatModel(counter))
    rag_res = await answer_workspace_question(
        vector_store=vector_store,
        workspace_id=ws["id"],
        question="What are user complaints on Klue?",
        llm_provider="gemini",
        llm_model="gemini-2.5-flash",
    )
    assert "Klue" in rag_res.answer
    assert len(rag_res.citations) >= 1


async def _async_return(value: Any) -> Any:
    return value


async def test_critic_loop_stops_at_max_iterations(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify the LangGraph Critic loop cannot run infinitely even if Critic always fails."""
    from app.agents.graph import _route_after_critic
    from app.config import settings

    report = CriticReport(
        grounding_score=0.4,
        completeness_score=0.4,
        passed=False,
        ungrounded_claims=["Missing detail"],
        gaps=[
            ResearchGap(
                competitor_name="Klue",
                domain="pricing",
                issue="Missing price",
                suggested_query="Klue pricing",
            )
        ],
    )
    assert (
        _route_after_critic({"critic_report": report, "iteration_count": 0})  # type: ignore[arg-type]
        == "targeted_research"
    )
    assert (
        _route_after_critic(
            {"critic_report": report, "iteration_count": settings.max_critic_iterations}  # type: ignore[arg-type]
        )
        == "synthesizer"
    )


async def test_specialist_research_includes_custom_upload_citations(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.agents.nodes import make_nodes

    db = Database(str(tmp_path / "custom_node.db"))
    db.init_db()
    vs = DossierVectorStore(persist_dir=str(tmp_path / "chroma_custom_node"))
    ws = db.create_workspace("WS", "SignalPulse", "Agentic CI desk", "B2B SaaS PMs")
    run = db.create_run(ws["id"], thread_id="t-custom-1", llm_provider="gemini", llm_model="gemini-2.5-flash")
    vs.index_custom_document(
        workspace_id=ws["id"],
        doc_id="doc-winloss-1",
        filename="winloss.md",
        text="Internal call notes: Klue deals lose on multi-year lock-in.",
    )

    counter = {"calls": 0}
    monkeypatch.setattr("app.agents.nodes.create_chat_model", lambda *a, **kw: _FakeChatModel(counter))
    monkeypatch.setattr(
        "app.agents.nodes.collect_competitor_evidence",
        lambda name, website="": _async_return(
            [
                SourceCitationInput(
                    competitor_name=name,
                    source_type="web",
                    title="Klue",
                    url="https://klue.com",
                    snippet="Battlecards.",
                )
            ]
        ),
    )

    nodes = make_nodes(db=db, vector_store=vs)
    res = await nodes["specialist_research"](
        {
            "run_id": run["id"],
            "workspace_id": ws["id"],
            "product_name": ws["product_name"],
            "product_description": ws["product_description"],
            "target_segment": ws["target_segment"],
            "seed_competitors": ["Klue"],
            "llm_provider": "gemini",
            "llm_model": "gemini-2.5-flash",
            "discovered_competitors": [],
            "approved_competitors": [
                CompetitorCandidate(name="Klue", website="https://klue.com", category="direct")
            ],
            "research_findings": [],
            "citations": [],
            "critic_report": None,
            "research_gaps": [],
            "iteration_count": 0,
            "dossier": None,
            "diff_summary": None,
        }
    )
    assert any(c.source_type == "custom_upload" for c in res["citations"])
    saved = db.list_citations(run["id"])
    assert any(c["source_type"] == "custom_upload" for c in saved)


async def test_specialist_research_redacts_byok_key_from_error_events(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.agents.nodes import (
        make_nodes,
        reset_runtime_settings_context,
        set_runtime_settings_context,
    )

    db = Database(str(tmp_path / "redact_node.db"))
    db.init_db()
    vs = DossierVectorStore(persist_dir=str(tmp_path / "chroma_redact"))
    ws = db.create_workspace("WS", "SignalPulse", "Agentic CI desk", "B2B SaaS PMs")
    run = db.create_run(
        ws["id"], thread_id="t-redact-1", llm_provider="gemini", llm_model="gemini-2.5-flash"
    )

    secret_key = "AIza-super-secret-ephem-key"
    monkeypatch.setattr(
        "app.agents.nodes.collect_competitor_evidence",
        lambda name, website="": _async_return([]),
    )

    class _ExplodingStructured:
        async def ainvoke(self, messages: Any) -> Any:
            raise RuntimeError(f"401 Unauthorized for api_key={secret_key}")

    class _ExplodingLlm:
        def with_structured_output(self, schema: type) -> _ExplodingStructured:
            return _ExplodingStructured()

    monkeypatch.setattr(
        "app.agents.nodes.create_chat_model",
        lambda *a, **kw: _ExplodingLlm(),
    )

    emitted: list[dict[str, Any]] = []

    async def _capture(ev: Any) -> None:
        emitted.append(ev.model_dump())

    nodes = make_nodes(db=db, vector_store=vs, event_callback=_capture)
    token = set_runtime_settings_context(Settings(gemini_api_key=secret_key))
    try:
        with pytest.raises(RuntimeError):
            await nodes["specialist_research"](
                {
                    "run_id": run["id"],
                    "workspace_id": ws["id"],
                    "product_name": ws["product_name"],
                    "product_description": ws["product_description"],
                    "target_segment": ws["target_segment"],
                    "seed_competitors": ["Klue"],
                    "llm_provider": "gemini",
                    "llm_model": "gemini-2.5-flash",
                    "discovered_competitors": [],
                    "approved_competitors": [
                        CompetitorCandidate(
                            name="Klue", website="https://klue.com", category="direct"
                        )
                    ],
                    "research_findings": [],
                    "citations": [],
                    "critic_report": None,
                    "research_gaps": [],
                    "iteration_count": 0,
                    "dossier": None,
                    "diff_summary": None,
                }
            )
    finally:
        reset_runtime_settings_context(token)

    stored_events = db.list_events(run["id"])
    err_events = [e for e in stored_events if e["event_type"] == "error"]
    assert len(err_events) == 1
    assert secret_key not in str(stored_events)
    assert secret_key not in str(emitted)
    assert "[REDACTED]" in err_events[0]["message"]
    assert "[REDACTED]" in err_events[0]["metadata"]["error_detail"]
