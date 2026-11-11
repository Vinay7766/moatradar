"""Tests for ChromaDB vector store indexing and retrieval."""

from pathlib import Path

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
