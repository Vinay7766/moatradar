"""Longitudinal snapshot diff engine comparing consecutive PM dossiers."""

from app.schemas.intelligence import DiffChangeItem, DiffSummary, DossierPayload


def compute_snapshot_diff(
    previous_snapshot_id: str | None,
    previous_created_at: str | None,
    previous_dossier: DossierPayload | None,
    current_dossier: DossierPayload,
) -> DiffSummary:
    """Compare current dossier against previous snapshot and return structured changes."""
    if previous_dossier is None or previous_snapshot_id is None:
        return DiffSummary(
            previous_snapshot_id=None,
            previous_created_at=None,
            has_changes=False,
            headline="Initial baseline snapshot.",
            changes=[],
        )

    changes: list[DiffChangeItem] = []

    prev_comps = {b.competitor_name: b for b in previous_dossier.battlecards}
    curr_comps = {b.competitor_name: b for b in current_dossier.battlecards}

    for name in sorted(set(curr_comps) - set(prev_comps)):
        changes.append(
            DiffChangeItem(
                category="competitors",
                target=name,
                change_type="added",
                summary=f"New competitor tracked: {name} ({curr_comps[name].positioning}).",
            )
        )

    for name in sorted(set(prev_comps) - set(curr_comps)):
        changes.append(
            DiffChangeItem(
                category="competitors",
                target=name,
                change_type="removed",
                summary=f"Competitor removed from active tracking: {name}.",
            )
        )

    # Pricing diffs
    prev_pricing = {p.competitor_name: p for p in previous_dossier.pricing_matrix}
    curr_pricing = {p.competitor_name: p for p in current_dossier.pricing_matrix}
    for name, curr_p in curr_pricing.items():
        prev_p = prev_pricing.get(name)
        if not prev_p:
            changes.append(
                DiffChangeItem(
                    category="pricing",
                    target=name,
                    change_type="added",
                    summary=f"Pricing captured for {name}: entry {curr_p.entry_price}, mid {curr_p.mid_tier}.",
                )
            )
            continue
        diffs: list[str] = []
        if prev_p.entry_price != curr_p.entry_price:
            diffs.append(f"entry {prev_p.entry_price} -> {curr_p.entry_price}")
        if prev_p.mid_tier != curr_p.mid_tier:
            diffs.append(f"mid {prev_p.mid_tier} -> {curr_p.mid_tier}")
        if prev_p.free_tier != curr_p.free_tier:
            diffs.append(f"free tier {prev_p.free_tier} -> {curr_p.free_tier}")
        if diffs:
            changes.append(
                DiffChangeItem(
                    category="pricing",
                    target=name,
                    change_type="modified",
                    summary=f"Pricing shift for {name}: " + "; ".join(diffs),
                )
            )

    # Feature capability diffs
    prev_features = {f.capability.lower(): f for f in previous_dossier.feature_matrix}
    curr_features = {f.capability.lower(): f for f in current_dossier.feature_matrix}
    for key, curr_f in curr_features.items():
        if key not in prev_features:
            changes.append(
                DiffChangeItem(
                    category="features",
                    target=curr_f.capability,
                    change_type="added",
                    summary=f"New tracked capability: {curr_f.capability}.",
                )
            )

    # VoC theme diffs
    prev_themes = {(v.competitor_name, v.theme.lower()) for v in previous_dossier.voc_insights}
    for v in current_dossier.voc_insights:
        if (v.competitor_name, v.theme.lower()) not in prev_themes:
            changes.append(
                DiffChangeItem(
                    category="voc",
                    target=v.competitor_name,
                    change_type="added",
                    summary=f"New {v.sentiment} theme on {v.competitor_name}: {v.theme}.",
                )
            )

    headline = (
        f"Detected {len(changes)} change(s) since snapshot {previous_snapshot_id[:8]}."
        if changes
        else "No material changes detected since the previous snapshot."
    )
    return DiffSummary(
        previous_snapshot_id=previous_snapshot_id,
        previous_created_at=previous_created_at,
        has_changes=bool(changes),
        headline=headline,
        changes=changes[:25],
    )
