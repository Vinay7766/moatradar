"""Automated Agentic AI Evaluation Harness for CMI Desk.

Measures:
1. Citation Grounding Rate (% of deliverable URLs verified against collected source_citations)
2. Deliverable Schema Completeness (coverage across all 6 PM deliverable pillars)
3. Critic Verification Score & Reflection Loop Effectiveness
4. End-to-End Latency
"""

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

# Ensure backend/ is on sys.path when executed directly
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from langgraph.types import Command

from app.agents.graph import build_intelligence_graph
from app.config import SupportedProvider, settings
from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.schemas.intelligence import DossierPayload


def evaluate_dossier_grounding(
    dossier: DossierPayload, collected_urls: set[str]
) -> dict[str, Any]:
    """Compute exact citation grounding rate and schema completeness for a DossierPayload."""
    normalized_collected = {u.strip().rstrip("/") for u in collected_urls if u.strip()}

    referenced_urls: list[str] = []
    for row in dossier.feature_matrix:
        referenced_urls.extend(row.citation_urls)
    for pr in dossier.pricing_matrix:
        if pr.pricing_url:
            referenced_urls.append(pr.pricing_url)
        referenced_urls.extend(pr.citation_urls)
    for bc in dossier.battlecards:
        referenced_urls.extend(bc.citation_urls)
    for voc in dossier.voc_insights:
        if voc.source_url:
            referenced_urls.append(voc.source_url)
    for sig in dossier.momentum_signals:
        if sig.source_url:
            referenced_urls.append(sig.source_url)
    for opp in dossier.opportunities:
        referenced_urls.extend(opp.citation_urls)

    normalized_refs = [u.strip().rstrip("/") for u in referenced_urls if u.strip()]
    verified = [u for u in normalized_refs if u in normalized_collected]
    grounding_rate = (len(verified) / len(normalized_refs)) if normalized_refs else 0.0

    pillar_checks = {
        "executive_brief": bool(dossier.executive_brief_md.strip()),
        "feature_matrix": len(dossier.feature_matrix) >= 3,
        "pricing_matrix": len(dossier.pricing_matrix) >= 1,
        "battlecards": len(dossier.battlecards) >= 1,
        "voc_insights": len(dossier.voc_insights) >= 1,
        "opportunities": len(dossier.opportunities) >= 1,
    }
    completeness_rate = sum(1 for v in pillar_checks.values() if v) / len(pillar_checks)

    return {
        "referenced_url_count": len(normalized_refs),
        "verified_url_count": len(verified),
        "citation_grounding_rate": round(grounding_rate, 3),
        "deliverable_completeness_rate": round(completeness_rate, 3),
        "pillar_checks": pillar_checks,
    }


async def run_live_benchmark(
    product_name: str,
    product_description: str,
    target_segment: str,
    seed_competitors: list[str],
    provider: SupportedProvider,
    model: str,
) -> dict[str, Any]:
    """Run one live end-to-end mission and evaluate grounding, completeness, critic, and latency."""
    if not settings.get_api_key(provider):
        raise RuntimeError(
            f"Cannot run live eval: API key for '{provider}' is not configured in .env."
        )

    db = Database(settings.sqlite_db_path)
    db.init_db()
    vs = DossierVectorStore(settings.chroma_persist_dir)

    ws = db.create_workspace(
        name=f"[Eval] {product_name}",
        product_name=product_name,
        product_description=product_description,
        target_segment=target_segment,
    )
    thread_id = f"eval-{uuid4()}"
    run = db.create_run(ws["id"], thread_id, provider, model, status="discovering")

    t0 = time.perf_counter()
    async with build_intelligence_graph(db=db, vector_store=vs) as graph:
        config = {"configurable": {"thread_id": thread_id}}
        initial_state = {
            "run_id": run["id"],
            "workspace_id": ws["id"],
            "product_name": product_name,
            "product_description": product_description,
            "target_segment": target_segment,
            "seed_competitors": seed_competitors,
            "llm_provider": provider,
            "llm_model": model,
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
        await graph.ainvoke(initial_state, config=config)
        run_paused = db.get_run(run["id"])
        approved = (run_paused or {}).get("discovered_competitors", [])[:3]
        final_state = await graph.ainvoke(Command(resume=approved), config=config)

    elapsed = round(time.perf_counter() - t0, 2)
    dossier = final_state["dossier"]
    citations = db.list_citations(run["id"])
    collected_urls = {c["url"] for c in citations}
    metrics = evaluate_dossier_grounding(dossier, collected_urls)
    run_final = db.get_run(run["id"]) or {}

    return {
        "run_id": run["id"],
        "product_name": product_name,
        "provider": provider,
        "model": model,
        "latency_seconds": elapsed,
        "collected_source_count": len(collected_urls),
        "critic_grounding_score": run_final.get("critic_score"),
        "critic_iterations": run_final.get("iteration_count"),
        **metrics,
    }


def audit_existing_runs() -> list[dict[str, Any]]:
    """Audit all completed runs persisted in SQLite."""
    db = Database(settings.sqlite_db_path)
    db.init_db()
    workspaces = db.list_workspaces()
    reports: list[dict[str, Any]] = []
    for ws in workspaces:
        snapshots = db.list_snapshots_for_workspace(ws["id"])
        for snap in snapshots:
            run = db.get_run(snap["run_id"])
            if not run:
                continue
            dossier = DossierPayload.model_validate(snap["dossier"])
            citations = db.list_citations(run["id"])
            metrics = evaluate_dossier_grounding(dossier, {c["url"] for c in citations})
            reports.append(
                {
                    "workspace": ws["name"],
                    "run_id": run["id"],
                    "provider": run["llm_provider"],
                    "model": run["llm_model"],
                    "critic_score": run.get("critic_score"),
                    "critic_iterations": run.get("iteration_count"),
                    **metrics,
                }
            )
    return reports


def main() -> None:
    parser = argparse.ArgumentParser(description="CMI Desk Agentic Evaluation Harness")
    parser.add_argument(
        "--mode",
        choices=["audit-db", "live"],
        default="audit-db",
        help="audit-db evaluates persisted SQLite runs; live executes a full benchmark run.",
    )
    parser.add_argument("--product", default="Linear", help="Product name for live benchmark")
    parser.add_argument(
        "--description",
        default="Fast issue tracking and product roadmap workspace for software teams.",
        help="Product description for live benchmark",
    )
    parser.add_argument(
        "--segment",
        default="B2B Engineering and Product Management Teams",
        help="Target segment for live benchmark",
    )
    parser.add_argument(
        "--competitors",
        nargs="*",
        default=["Jira", "Asana", "Shortcut"],
        help="Seed competitors for live benchmark",
    )
    parser.add_argument("--provider", default=settings.default_llm_provider)
    parser.add_argument("--model", default=settings.default_llm_model)
    args = parser.parse_args()

    if args.mode == "audit-db":
        report = audit_existing_runs()
        print(json.dumps({"audited_runs": len(report), "results": report}, indent=2))
    else:
        result = asyncio.run(
            run_live_benchmark(
                product_name=args.product,
                product_description=args.description,
                target_segment=args.segment,
                seed_competitors=args.competitors,
                provider=args.provider,
                model=args.model,
            )
        )
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
