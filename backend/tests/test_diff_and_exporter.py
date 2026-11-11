"""Tests for SQLite persistence, longitudinal snapshot diffing, and dossier exporters."""

from pathlib import Path

from app.agents.diff_engine import compute_snapshot_diff
from app.db.database import Database
from app.schemas.intelligence import (
    AgentEventPayload,
    CompetitorBattlecard,
    CompetitorCandidate,
    DossierPayload,
    FeatureComparisonRow,
    PricingTierSnapshot,
    SourceCitationInput,
    SwotAnalysis,
    VocSentimentItem,
)
from app.services.exporter import export_dossier_markdown


def _sample_dossier(entry_price: str = "$29/mo", extra_competitor: bool = False) -> DossierPayload:
    battlecards = [
        CompetitorBattlecard(
            competitor_name="AlphaCI",
            website="https://alphaci.example.com",
            positioning="Enterprise sales battlecards",
            target_icp="Mid-market B2B SaaS",
            key_differentiators=["Salesforce sync"],
            swot=SwotAnalysis(
                strengths=["Strong CRM integration"],
                weaknesses=["Expensive onboarding"],
                opportunities=["Self-serve tier"],
                threats=["Agile AI-native tools"],
            ),
            how_to_win=["Highlight instant zero-setup onboarding"],
            landmines_to_avoid=["Do not claim native Gong sync yet"],
            citation_urls=["https://alphaci.example.com"],
        )
    ]
    pricing = [
        PricingTierSnapshot(
            competitor_name="AlphaCI",
            billing_model="Per seat",
            free_tier="No",
            entry_price=entry_price,
            mid_tier="$79/mo",
            enterprise_tier="Custom",
            key_packaging_gates=["SSO", "API access"],
            pricing_url="https://alphaci.example.com/pricing",
            citation_urls=["https://alphaci.example.com/pricing"],
        )
    ]
    if extra_competitor:
        battlecards.append(
            CompetitorBattlecard(
                competitor_name="BetaTrack",
                website="https://betatrack.example.com",
                positioning="Lightweight web monitoring",
                target_icp="Startup PMs",
                key_differentiators=["Pricing alerts"],
                swot=SwotAnalysis(
                    strengths=["Fast setup"],
                    weaknesses=["Shallow VoC"],
                    opportunities=["Deeper community mining"],
                    threats=["Incumbents"],
                ),
                how_to_win=["Win on citation verification"],
                landmines_to_avoid=[],
                citation_urls=["https://betatrack.example.com"],
            )
        )

    return DossierPayload(
        executive_brief_md="## Executive Summary\nMarket is shifting toward agentic CI.",
        market_trends=["Teams reject $20k+ annual contracts"],
        feature_matrix=[
            FeatureComparisonRow(
                capability="Live Pricing Tracking",
                category="Monitoring",
                importance="high",
                competitor_support={"AlphaCI": "Yes"},
                citation_urls=["https://alphaci.example.com"],
            )
        ],
        pricing_matrix=pricing,
        battlecards=battlecards,
        voc_insights=[
            VocSentimentItem(
                competitor_name="AlphaCI",
                sentiment="complaint",
                platform="reddit",
                theme="Pricing opacity",
                evidence_quote="Requires sales call for any pricing.",
                source_url="https://reddit.com/r/SaaS/123",
            )
        ],
        momentum_signals=[],
        opportunities=[],
    )


def test_sqlite_crud_and_snapshot_diff(tmp_path: Path) -> None:
    db = Database(str(tmp_path / "test.db"))
    db.init_db()

    ws = db.create_workspace(
        name="PM CI Desk",
        product_name="SignalPulse",
        product_description="Zero-setup competitive intelligence for PMs",
        target_segment="B2B SaaS PMs",
    )
    run1 = db.create_run(
        workspace_id=ws["id"],
        thread_id="thread-1",
        llm_provider="gemini",
        llm_model="gemini-2.5-flash",
    )
    db.save_discovered_competitors(
        run1["id"],
        [CompetitorCandidate(name="AlphaCI", website="https://alphaci.example.com")],
    )
    db.save_citations(
        run1["id"],
        [
            SourceCitationInput(
                competitor_name="AlphaCI",
                source_type="pricing_page",
                title="AlphaCI Pricing",
                url="https://alphaci.example.com/pricing",
                snippet="$29/mo starter",
            )
        ],
    )
    db.save_event(
        AgentEventPayload(
            run_id=run1["id"],
            node_name="discovery",
            event_type="status",
            message="Discovered 1 competitor",
        )
    )
    d1 = _sample_dossier(entry_price="$29/mo", extra_competitor=False)
    snap1 = db.save_snapshot(run_id=run1["id"], workspace_id=ws["id"], dossier=d1, diff_summary=None)

    d2 = _sample_dossier(entry_price="$39/mo", extra_competitor=True)
    diff = compute_snapshot_diff(
        previous_snapshot_id=snap1["id"],
        previous_created_at=snap1["created_at"],
        previous_dossier=d1,
        current_dossier=d2,
    )
    assert diff.has_changes is True
    targets = {(c.category, c.target, c.change_type) for c in diff.changes}
    assert ("competitors", "BetaTrack", "added") in targets
    assert ("pricing", "AlphaCI", "modified") in targets

    md = export_dossier_markdown(
        product_name="SignalPulse",
        dossier=d2,
        diff_summary=diff,
        citations=[],
    )
    assert "# Competitive Market Intelligence Dossier: SignalPulse" in md
    assert "BetaTrack" in md
    assert "$39/mo" in md
