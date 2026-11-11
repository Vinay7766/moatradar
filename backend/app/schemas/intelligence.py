"""Pydantic v2 data contracts for MoatRadar."""

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from app.config import SupportedProvider


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format."""
    return datetime.now(UTC).isoformat()


SourceType = Literal["web", "pricing_page", "hn", "reddit", "github", "custom_upload"]
MonitorInterval = Literal["off", "daily", "weekly"]
MissionStatus = Literal[
    "discovering",
    "awaiting_approval",
    "researching",
    "verifying",
    "synthesizing",
    "completed",
    "failed",
]


class CompetitorCandidate(BaseModel):
    """Candidate competitor discovered or edited by the PM."""

    name: str = Field(min_length=1, max_length=120)
    website: str = Field(default="", max_length=300)
    category: Literal["direct", "adjacent", "substitute"] = "direct"
    rationale: str = Field(default="", max_length=500)


class SourceCitationInput(BaseModel):
    """Verified external evidence item collected by zero-key tools."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    competitor_name: str
    source_type: SourceType
    title: str
    url: str
    snippet: str
    fetched_at: str = Field(default_factory=utc_now_iso)


class DomainFinding(BaseModel):
    """Structured findings returned by a specialist research agent."""

    competitor_name: str
    domain: Literal["product", "pricing", "voc", "momentum"]
    summary: str
    bullet_points: list[str] = Field(default_factory=list)
    citation_urls: list[str] = Field(default_factory=list)
    gaps_noted: list[str] = Field(default_factory=list)


class ResearchGap(BaseModel):
    """Actionable gap identified by the Critic agent for re-research."""

    competitor_name: str
    domain: Literal["product", "pricing", "voc", "momentum"]
    issue: str
    suggested_query: str


class CriticReport(BaseModel):
    """Output of the Critic/Verifier reflection loop."""

    grounding_score: float = Field(ge=0.0, le=1.0)
    completeness_score: float = Field(ge=0.0, le=1.0)
    passed: bool
    ungrounded_claims: list[str] = Field(default_factory=list)
    gaps: list[ResearchGap] = Field(default_factory=list)
    notes: str = ""


class FeatureComparisonRow(BaseModel):
    """One capability row across competitors in the Feature Matrix."""

    capability: str
    category: str = "Core"
    importance: Literal["high", "medium", "low"] = "medium"
    competitor_support: dict[str, str] = Field(
        default_factory=dict,
        description="Map of competitor name -> status/notes (e.g. 'Yes — native', 'Partial', 'No')",
    )
    citation_urls: list[str] = Field(default_factory=list)


class PricingTierSnapshot(BaseModel):
    """Pricing and packaging entry for a competitor."""

    competitor_name: str
    billing_model: str
    free_tier: str
    entry_price: str
    mid_tier: str
    enterprise_tier: str
    key_packaging_gates: list[str] = Field(default_factory=list)
    pricing_url: str = ""
    citation_urls: list[str] = Field(default_factory=list)


class SwotAnalysis(BaseModel):
    """SWOT block for a competitor battlecard."""

    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    opportunities: list[str] = Field(default_factory=list)
    threats: list[str] = Field(default_factory=list)


class CompetitorBattlecard(BaseModel):
    """PM & GTM battlecard for a single competitor."""

    competitor_name: str
    website: str = ""
    positioning: str
    target_icp: str
    key_differentiators: list[str] = Field(default_factory=list)
    swot: SwotAnalysis
    how_to_win: list[str] = Field(default_factory=list)
    landmines_to_avoid: list[str] = Field(default_factory=list)
    citation_urls: list[str] = Field(default_factory=list)


class VocSentimentItem(BaseModel):
    """Voice-of-Customer praise, complaint, or switching trigger."""

    competitor_name: str
    sentiment: Literal["complaint", "praise", "switching_trigger"]
    platform: Literal["hacker_news", "reddit", "github", "web_review"]
    theme: str
    evidence_quote: str
    source_url: str


class OpportunityItem(BaseModel):
    """Prioritized white-space or roadmap opportunity for the PM."""

    title: str
    problem_evidence: str
    recommended_feature_or_bet: str
    impact_score: int = Field(ge=1, le=10)
    effort_score: int = Field(ge=1, le=10)
    horizon: Literal["Now (0-3m)", "Next (3-6m)", "Later (6-12m)"]
    citation_urls: list[str] = Field(default_factory=list)


class MomentumSignal(BaseModel):
    """Recent launch, community traction, or market movement."""

    competitor_name: str
    signal_type: Literal["launch", "community", "open_source", "news"]
    headline: str
    takeaway: str
    source_url: str


class DossierPayload(BaseModel):
    """Complete structured PM competitive intelligence dossier."""

    executive_brief_md: str
    market_trends: list[str] = Field(default_factory=list)
    feature_matrix: list[FeatureComparisonRow] = Field(default_factory=list)
    pricing_matrix: list[PricingTierSnapshot] = Field(default_factory=list)
    battlecards: list[CompetitorBattlecard] = Field(default_factory=list)
    voc_insights: list[VocSentimentItem] = Field(default_factory=list)
    momentum_signals: list[MomentumSignal] = Field(default_factory=list)
    opportunities: list[OpportunityItem] = Field(default_factory=list)


class DiffChangeItem(BaseModel):
    """Single detected change between current and previous snapshot."""

    category: Literal["competitors", "pricing", "features", "voc", "opportunities"]
    target: str
    change_type: Literal["added", "removed", "modified"]
    summary: str


class DiffSummary(BaseModel):
    """Longitudinal diff against prior snapshot."""

    previous_snapshot_id: str | None = None
    previous_created_at: str | None = None
    has_changes: bool = False
    headline: str = "Initial baseline snapshot."
    changes: list[DiffChangeItem] = Field(default_factory=list)


# --- API Request / Response Models ---


class WorkspaceCreateRequest(BaseModel):
    """Request to create a PM workspace."""

    name: str = Field(min_length=2, max_length=120)
    product_name: str = Field(min_length=2, max_length=120)
    product_description: str = Field(min_length=10, max_length=2000)
    target_segment: str = Field(min_length=2, max_length=300)


class MissionStartRequest(BaseModel):
    """Request to launch an intelligence mission."""

    workspace_id: str | None = None
    product_name: str = Field(min_length=2, max_length=120)
    product_description: str = Field(min_length=10, max_length=2000)
    target_segment: str = Field(min_length=2, max_length=300)
    seed_competitors: list[str] = Field(default_factory=list, max_length=6)
    llm_provider: SupportedProvider
    llm_model: str = Field(min_length=1, max_length=120)


class HitlApproveRequest(BaseModel):
    """PM approval payload for discovered competitors."""

    competitors: list[CompetitorCandidate] = Field(min_length=1, max_length=6)


class MissionRetryRequest(BaseModel):
    """Recovery request to retry a failed or stalled mission."""

    skip_competitors: list[str] = Field(default_factory=list, max_length=6)
    llm_provider: SupportedProvider | None = None
    llm_model: str | None = Field(default=None, min_length=1, max_length=120)


class WorkspaceMonitorUpdateRequest(BaseModel):
    """Update scheduled workspace monitor configuration."""

    interval: MonitorInterval
    webhook_url: str | None = Field(default=None, max_length=500)
    llm_provider: SupportedProvider | Literal[""] | None = None
    llm_model: str | None = Field(default=None, max_length=120)


class OllamaCheckRequest(BaseModel):
    """Request to check whether an Ollama model is locally available."""

    model: str = Field(min_length=1, max_length=120)


class RagChatRequest(BaseModel):
    """Follow-up question over workspace dossiers."""

    question: str = Field(min_length=3, max_length=1000)
    llm_provider: SupportedProvider
    llm_model: str = Field(min_length=1, max_length=120)


class RagCitation(BaseModel):
    """Citation returned with a RAG answer."""

    competitor_name: str
    section: str
    url: str
    excerpt: str


class RagChatResponse(BaseModel):
    """Response from Ask the Desk RAG analyst."""

    answer: str
    citations: list[RagCitation] = Field(default_factory=list)


class AgentEventPayload(BaseModel):
    """Real-time trace event persisted and streamed via SSE."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    run_id: str
    node_name: str
    event_type: Literal[
        "status",
        "tool_call",
        "tool_result",
        "hitl_interrupt",
        "critic_review",
        "retry_loop",
        "completed",
        "error",
    ]
    message: str
    metadata: dict = Field(default_factory=dict)
    timestamp: str = Field(default_factory=utc_now_iso)
