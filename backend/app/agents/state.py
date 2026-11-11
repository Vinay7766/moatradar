"""LangGraph state definition for MoatRadar."""

import operator
from typing import Annotated, TypedDict

from app.schemas.intelligence import (
    CompetitorCandidate,
    CriticReport,
    DiffSummary,
    DomainFinding,
    DossierPayload,
    ResearchGap,
    SourceCitationInput,
)


class IntelligenceState(TypedDict):
    """Shared graph state across discovery, HITL, parallel research, critic, and synthesis."""

    run_id: str
    workspace_id: str
    product_name: str
    product_description: str
    target_segment: str
    seed_competitors: list[str]
    llm_provider: str
    llm_model: str

    discovered_competitors: list[CompetitorCandidate]
    approved_competitors: list[CompetitorCandidate]

    research_findings: Annotated[list[DomainFinding], operator.add]
    citations: Annotated[list[SourceCitationInput], operator.add]

    critic_report: CriticReport | None
    research_gaps: list[ResearchGap]
    iteration_count: int

    dossier: DossierPayload | None
    diff_summary: DiffSummary | None
