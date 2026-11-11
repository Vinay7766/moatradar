"""Tests for the evaluation harness grounding & completeness scoring."""

from app.schemas.intelligence import (
    CompetitorBattlecard,
    DossierPayload,
    FeatureComparisonRow,
    OpportunityItem,
    PricingTierSnapshot,
    SwotAnalysis,
    VocSentimentItem,
)
from eval.run_eval import evaluate_dossier_grounding


def test_evaluate_dossier_grounding_computes_exact_rates() -> None:
    dossier = DossierPayload(
        executive_brief_md="## Brief\nSummary text.",
        market_trends=["Trend 1"],
        feature_matrix=[
            FeatureComparisonRow(capability="A", competitor_support={"X": "Yes"}, citation_urls=["https://x.com/a"]),
            FeatureComparisonRow(capability="B", competitor_support={"X": "No"}, citation_urls=["https://x.com/b"]),
            FeatureComparisonRow(capability="C", competitor_support={"X": "Yes"}, citation_urls=["https://hallucinated.com/c"]),
        ],
        pricing_matrix=[
            PricingTierSnapshot(
                competitor_name="X",
                billing_model="Seat",
                free_tier="Yes",
                entry_price="$10",
                mid_tier="$30",
                enterprise_tier="Custom",
                pricing_url="https://x.com/pricing",
                citation_urls=["https://x.com/pricing"],
            )
        ],
        battlecards=[
            CompetitorBattlecard(
                competitor_name="X",
                website="https://x.com",
                positioning="Dev-first",
                target_icp="Teams",
                swot=SwotAnalysis(strengths=["Fast"], weaknesses=["Limited"]),
                citation_urls=["https://x.com"],
            )
        ],
        voc_insights=[
            VocSentimentItem(
                competitor_name="X",
                sentiment="complaint",
                platform="hacker_news",
                theme="Export",
                evidence_quote="CSV export missing",
                source_url="https://news.ycombinator.com/item?id=1",
            )
        ],
        momentum_signals=[],
        opportunities=[
            OpportunityItem(
                title="CSV Export",
                problem_evidence="Users ask on HN",
                recommended_feature_or_bet="Ship CSV export",
                impact_score=8,
                effort_score=2,
                horizon="Now (0-3m)",
                citation_urls=["https://news.ycombinator.com/item?id=1"],
            )
        ],
    )
    collected = {
        "https://x.com/a",
        "https://x.com/b",
        "https://x.com/pricing",
        "https://x.com",
        "https://news.ycombinator.com/item?id=1",
    }
    res = evaluate_dossier_grounding(dossier, collected)
    assert res["deliverable_completeness_rate"] == 1.0
    assert res["verified_url_count"] == 7
    assert res["referenced_url_count"] == 8
    assert res["citation_grounding_rate"] == 0.875
