"""Dossier exporters for Markdown and JSON downloads."""

from app.schemas.intelligence import DiffSummary, DossierPayload, SourceCitationInput


def export_dossier_markdown(
    product_name: str,
    dossier: DossierPayload,
    diff_summary: DiffSummary | None,
    citations: list[SourceCitationInput],
) -> str:
    """Render a complete PM competitive intelligence dossier as clean Markdown."""
    lines: list[str] = [
        f"# Competitive Market Intelligence Dossier: {product_name}",
        "",
        dossier.executive_brief_md.strip(),
        "",
    ]

    if dossier.market_trends:
        lines.append("## Key Market Trends")
        for trend in dossier.market_trends:
            lines.append(f"- {trend}")
        lines.append("")

    if dossier.feature_matrix:
        lines.append("## Feature Comparison Matrix")
        competitors = sorted(
            {comp for row in dossier.feature_matrix for comp in row.competitor_support}
        )
        header = "| Capability | Category | Importance | " + " | ".join(competitors) + " |"
        sep = "| --- | --- | --- | " + " | ".join(["---"] * len(competitors)) + " |"
        lines.extend([header, sep])
        for row in dossier.feature_matrix:
            cells = [row.competitor_support.get(c, "N/A") for c in competitors]
            lines.append(
                f"| {row.capability} | {row.category} | {row.importance} | "
                + " | ".join(cells)
                + " |"
            )
        lines.append("")

    if dossier.pricing_matrix:
        lines.append("## Pricing & Packaging Matrix")
        lines.append("| Competitor | Model | Free Tier | Entry | Mid | Enterprise | Key Gates |")
        lines.append("| --- | --- | --- | --- | --- | --- | --- |")
        for p in dossier.pricing_matrix:
            gates = ", ".join(p.key_packaging_gates) or "—"
            lines.append(
                f"| {p.competitor_name} | {p.billing_model} | {p.free_tier} | "
                f"{p.entry_price} | {p.mid_tier} | {p.enterprise_tier} | {gates} |"
            )
        lines.append("")

    if dossier.battlecards:
        lines.append("## Competitor Battlecards & SWOT")
        for bc in dossier.battlecards:
            lines.append(f"### {bc.competitor_name} ({bc.website or 'N/A'})")
            lines.append(f"- **Positioning:** {bc.positioning}")
            lines.append(f"- **Target ICP:** {bc.target_icp}")
            if bc.swot.strengths:
                lines.append(f"- **Strengths:** {'; '.join(bc.swot.strengths)}")
            if bc.swot.weaknesses:
                lines.append(f"- **Weaknesses:** {'; '.join(bc.swot.weaknesses)}")
            if bc.how_to_win:
                lines.append(f"- **How to Win:** {'; '.join(bc.how_to_win)}")
            if bc.landmines_to_avoid:
                lines.append(f"- **Landmines:** {'; '.join(bc.landmines_to_avoid)}")
            lines.append("")

    if dossier.voc_insights:
        lines.append("## Voice of Customer (VoC) Insights")
        for voc in dossier.voc_insights:
            lines.append(
                f"- **[{voc.sentiment.upper()}] {voc.competitor_name} ({voc.platform}) — {voc.theme}:** "
                f'"{voc.evidence_quote}" ([source]({voc.source_url}))'
            )
        lines.append("")

    if dossier.opportunities:
        lines.append("## White-Space & Roadmap Opportunities")
        for opp in dossier.opportunities:
            lines.append(
                f"- **{opp.title}** ({opp.horizon} | Impact {opp.impact_score}/10, Effort {opp.effort_score}/10): "
                f"{opp.recommended_feature_or_bet} — *Evidence:* {opp.problem_evidence}"
            )
        lines.append("")

    if diff_summary and diff_summary.changes:
        lines.append("## Snapshot Diff vs Previous Run")
        lines.append(f"*{diff_summary.headline}*")
        for ch in diff_summary.changes:
            lines.append(f"- **[{ch.change_type}] {ch.category} / {ch.target}:** {ch.summary}")
        lines.append("")

    if citations:
        lines.append("## Verified Source Citations")
        for c in citations:
            lines.append(f"- [{c.title}]({c.url}) ({c.competitor_name} · {c.source_type})")
        lines.append("")

    return "\n".join(lines)
