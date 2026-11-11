"""Tests for ChromaDB vector store indexing and retrieval."""

from pathlib import Path
from typing import Any

import pytest

from app.db.vector_store import DossierVectorStore
from app.schemas.intelligence import (
    CompetitorBattlecard,
    DossierPayload,
    PricingTierSnapshot,
    SwotAnalysis,
    VocSentimentItem,
)


def test_vector_store_indexes_and_queries_relevant_chunks(tmp_path: Path) -> None:
    store = DossierVectorStore(persist_dir=str(tmp_path / "chroma"))
    dossier = DossierPayload(
        executive_brief_md="B2B PM tools are consolidating around automated telemetry.",
        market_trends=["AI-native research workflows"],
        feature_matrix=[],
        pricing_matrix=[
            PricingTierSnapshot(
                competitor_name="Klue",
                billing_model="Annual enterprise",
                free_tier="No",
                entry_price="$15,000/yr",
                mid_tier="$25,000/yr",
                enterprise_tier="Custom",
                key_packaging_gates=["Salesforce integration"],
                pricing_url="https://klue.com/pricing",
                citation_urls=["https://klue.com/pricing"],
            )
        ],
        battlecards=[
            CompetitorBattlecard(
                competitor_name="Klue",
                website="https://klue.com",
                positioning="Enterprise sales enablement",
                target_icp="Enterprise revenue teams",
                key_differentiators=["Battlecards"],
                swot=SwotAnalysis(
                    strengths=["CRM push"],
                    weaknesses=["High annual cost"],
                    opportunities=[],
                    threats=[],
                ),
                how_to_win=["Offer transparent monthly self-serve pricing"],
                landmines_to_avoid=[],
                citation_urls=["https://klue.com"],
            )
        ],
        voc_insights=[
            VocSentimentItem(
                competitor_name="Klue",
                sentiment="complaint",
                platform="reddit",
                theme="Onboarding complexity",
                evidence_quote="Requires a dedicated product marketer to maintain cards.",
                source_url="https://reddit.com/r/ProductMarketing/example",
            )
        ],
        momentum_signals=[],
        opportunities=[],
    )

    count = store.index_dossier(workspace_id="ws-1", run_id="run-1", dossier=dossier, citations=[])
    assert count >= 3

    results = store.query_workspace(workspace_id="ws-1", query="Why do users complain about Klue onboarding?", top_k=3)
    assert len(results) >= 1
    combined_text = " ".join(r["text"] for r in results).lower()
    assert "klue" in combined_text


async def test_vector_store_and_rag_support_custom_uploads_and_ephemeral_settings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.agents.rag_chat import answer_workspace_question
    from app.config import Settings

    store = DossierVectorStore(persist_dir=str(tmp_path / "chroma_custom"))
    count = store.index_custom_document(
        workspace_id="ws-custom",
        doc_id="doc-123",
        filename="sales-notes.md",
        text="Enterprise prospects repeatedly cite Crayon setup fees as a switching trigger.",
    )
    assert count >= 1

    chunks = store.query_workspace(
        workspace_id="ws-custom",
        query="What triggers switching from Crayon?",
        top_k=3,
    )
    assert len(chunks) >= 1
    assert chunks[0]["source_type"] == "custom_upload"

    captured_settings: list[Any] = []

    class _FakeRagLlm:
        async def ainvoke(self, messages: Any) -> Any:
            class _Resp:
                content = "Prospects cite Crayon setup fees [1]."

            return _Resp()

    def _fake_create_chat_model(provider: Any, model_name: str, temperature: float = 0.2, app_settings: Any = None) -> Any:
        captured_settings.append(app_settings)
        return _FakeRagLlm()

    monkeypatch.setattr("app.agents.rag_chat.create_chat_model", _fake_create_chat_model)
    ephem = Settings(gemini_api_key="ephem-rag-key")
    res = await answer_workspace_question(
        vector_store=store,
        workspace_id="ws-custom",
        question="Why do prospects switch from Crayon?",
        llm_provider="gemini",
        llm_model="gemini-2.5-flash",
        app_settings=ephem,
    )
    assert "Crayon" in res.answer
    assert len(res.citations) >= 1
    assert captured_settings[0] is ephem

    store.delete_custom_document("ws-custom", "doc-123")
    assert store.query_workspace(workspace_id="ws-custom", query="Crayon setup fees", top_k=3) == []
