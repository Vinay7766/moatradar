"""FastAPI REST and SSE routes for MoatRadar."""

import inspect
import json
from email.parser import BytesParser
from email.policy import default as default_email_policy
from pathlib import Path
from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.agents.rag_chat import answer_workspace_question
from app.config import Settings, SupportedProvider, settings
from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.schemas.intelligence import (
    CompetitorCandidate,
    CriticReport,
    DiffSummary,
    DomainFinding,
    DossierPayload,
    HitlApproveRequest,
    MissionRetryRequest,
    MissionStartRequest,
    OllamaCheckRequest,
    RagChatRequest,
    SourceCitationInput,
    WorkspaceCreateRequest,
    WorkspaceMonitorUpdateRequest,
)
from app.services.exporter import export_dossier_markdown
from app.services.mission_runner import MissionRunner
from app.services.monitor_scheduler import compute_next_run_at
from app.tools.security import (
    UnsafeUrlError,
    sanitize_evidence_text,
    validate_public_url,
)

router = APIRouter(prefix="/api")

_MAX_DOCUMENT_BYTES = 2 * 1024 * 1024


def _get_db(request: Request) -> Database:
    return request.app.state.db


def _get_vs(request: Request) -> DossierVectorStore:
    return request.app.state.vector_store


def _get_runner(request: Request) -> MissionRunner:
    return request.app.state.runner


def _infer_provider_from_key(api_key: str) -> SupportedProvider | None:
    key = api_key.strip()
    if not key:
        return None
    if key.startswith("AIza"):
        return "gemini"
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("gsk_"):
        return "groq"
    if key.startswith("sk-"):
        return "openai"
    return None


def _build_runtime_settings(
    provider: SupportedProvider | None = None,
    x_llm_api_key: str | None = None,
    x_ollama_base_url: str | None = None,
) -> Settings:
    effective_provider = provider or _infer_provider_from_key(x_llm_api_key or "")
    return settings.with_overrides(
        provider=effective_provider,
        api_key=x_llm_api_key,
        ollama_base_url=x_ollama_base_url,
    )


def _extract_uploaded_document_text(
    filename: str, raw_bytes: bytes, content_type: str
) -> str:
    """Parse uploaded .md/.txt/.pdf document text safely and sanitize control characters."""
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(raw_bytes) > _MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds the 2 MB upload limit.")

    safe_name = Path(filename or "upload.txt").name
    ext = Path(safe_name).suffix.lower()

    try:
        from app.tools.document_parser import DocumentParseError, extract_document_text
    except ImportError:
        if ext not in {".md", ".txt"}:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported document format '{ext or 'unknown'}'. Upload .md, .txt, or .pdf.",
            ) from None
        decoded = raw_bytes.decode("utf-8", errors="replace")
        cleaned = sanitize_evidence_text(decoded, max_chars=50000)
        if not cleaned:
            raise HTTPException(status_code=400, detail="Document contains no readable text.") from None
        return cleaned

    try:
        sig = inspect.signature(extract_document_text)
        params = list(sig.parameters.keys())
        if len(params) >= 2 and params[0] in {"filename", "name"}:
            extracted = extract_document_text(safe_name, raw_bytes)  # type: ignore[arg-type]
        elif "content" in params and "filename" in params:
            extracted = extract_document_text(content=raw_bytes, filename=safe_name)  # type: ignore[call-arg]
        else:
            extracted = extract_document_text(raw_bytes, safe_name)  # type: ignore[arg-type]
    except DocumentParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cleaned = sanitize_evidence_text(str(extracted), max_chars=50000)
    if not cleaned:
        raise HTTPException(status_code=400, detail="Document contains no readable text.")
    return cleaned


def _build_workflow_spec() -> dict[str, Any]:
    """Return sanitized LangGraph topology, prompt summaries, schemas, guardrails, and AI concepts."""
    nodes = [
        {
            "node_name": "discovery",
            "label": "Competitor Discovery",
            "role": "Senior Product Strategy Discovery Agent",
            "plain_english": (
                "Searches the live web around the PM's product description and target segment to "
                "identify 3–6 real direct, adjacent, or substitute competitors."
            ),
            "prompt_summary": (
                "Given product_name, description, target_segment, and optional seed_competitors, "
                "identify 3–6 active competitors supported by <source_evidence> with official URLs."
            ),
            "output_schema": "CompetitorCandidate[]",
            "output_fields": list(CompetitorCandidate.model_fields.keys()),
            "guardrails": [
                "<source_evidence> untrusted boundary",
                "sanitize_evidence_text",
                "SSRF validate_public_url",
                "max_competitors cap",
            ],
            "concept_tags": [
                "prompting_structured_outputs",
                "security_guardrails",
                "tool_calling_resilience",
            ],
            "source_file": "backend/app/agents/nodes.py",
        },
        {
            "node_name": "hitl_approval",
            "label": "PM HITL Approval",
            "role": "Human-in-the-Loop Checkpoint Gate",
            "plain_english": (
                "Pauses execution via LangGraph interrupt() and persists state to SQLite so the PM "
                "can add, edit, or remove competitors before deep research begins."
            ),
            "prompt_summary": "Deterministic checkpoint gate (no LLM prompt). Validates PM-approved list.",
            "output_schema": "CompetitorCandidate[]",
            "output_fields": list(CompetitorCandidate.model_fields.keys()),
            "guardrails": [
                "AsyncSqliteSaver durable checkpoint",
                "Pydantic CompetitorCandidate validation",
            ],
            "concept_tags": ["hitl_checkpointing", "memory_architecture"],
            "source_file": "backend/app/agents/nodes.py",
        },
        {
            "node_name": "specialist_research",
            "label": "Parallel Specialist Research",
            "role": "Multi-Domain Competitive Intelligence Specialists",
            "plain_english": (
                "Fans out concurrently across all approved competitors (capped by an asyncio Semaphore) "
                "to gather web, pricing, HN, Reddit, GitHub, and custom uploaded evidence."
            ),
            "prompt_summary": (
                "For each competitor, produce 4 DomainFinding entries (product, pricing, voc, momentum). "
                "Cite exact URLs from <source_evidence> and explicitly log missing data in gaps_noted."
            ),
            "output_schema": "DomainFinding[]",
            "output_fields": list(DomainFinding.model_fields.keys()),
            "guardrails": [
                "<source_evidence> untrusted boundary",
                "sanitize_evidence_text",
                "SSRF validate_public_url",
                "asyncio.Semaphore(3) concurrency limit",
            ],
            "concept_tags": [
                "parallel_fan_out",
                "prompting_structured_outputs",
                "sentiment_analysis",
                "tool_calling_resilience",
            ],
            "source_file": "backend/app/agents/nodes.py",
        },
        {
            "node_name": "critic_verifier",
            "label": "Critic & Verifier",
            "role": "Fact-Verification Critic Agent",
            "plain_english": (
                "Audits specialist findings against verified source URLs to score grounding and "
                "completeness, bouncing gaps back to targeted re-research if needed."
            ),
            "prompt_summary": (
                "Audit findings against verified citations: check pricing capture, VoC quotes, and "
                "URL grounding. Return passed=False and up to 3 ResearchGap queries if evidence is thin."
            ),
            "output_schema": "CriticReport",
            "output_fields": list(CriticReport.model_fields.keys()),
            "guardrails": [
                "URL grounding verification",
                "max_critic_iterations loop cap",
                "temperature=0.0 deterministic audit",
            ],
            "concept_tags": ["hallucination_control"],
            "source_file": "backend/app/agents/nodes.py",
        },
        {
            "node_name": "targeted_research",
            "label": "Targeted Gap Research",
            "role": "Critic-Driven Follow-Up Researcher",
            "plain_english": (
                "Runs targeted web searches for the specific pricing or VoC gaps flagged by the Critic "
                "and feeds new findings back into the Critic for re-verification."
            ),
            "prompt_summary": (
                "Resolve up to 3 ResearchGap items using newly retrieved search evidence only."
            ),
            "output_schema": "DomainFinding[]",
            "output_fields": list(DomainFinding.model_fields.keys()),
            "guardrails": [
                "<source_evidence> untrusted boundary",
                "sanitize_evidence_text",
                "max_critic_iterations cap",
            ],
            "concept_tags": ["hallucination_control", "tool_calling_resilience"],
            "source_file": "backend/app/agents/nodes.py",
        },
        {
            "node_name": "synthesizer",
            "label": "Dossier Synthesizer",
            "role": "Principal Product Strategist",
            "plain_english": (
                "Synthesizes all verified specialist findings and custom PM docs into a unified "
                "Executive Brief, Feature Matrix, Pricing Table, SWOT Battlecards, VoC, and Roadmap Bets."
            ),
            "prompt_summary": (
                "Produce complete DossierPayload grounded exclusively in <source_evidence> URLs, "
                "covering all approved competitors across every deliverable tab."
            ),
            "output_schema": "DossierPayload",
            "output_fields": list(DossierPayload.model_fields.keys()),
            "guardrails": [
                "<source_evidence> untrusted boundary",
                "Pydantic DossierPayload schema enforcement",
            ],
            "concept_tags": ["prompting_structured_outputs", "sentiment_analysis"],
            "source_file": "backend/app/agents/nodes.py",
        },
        {
            "node_name": "memory_indexer",
            "label": "Memory & Diff Indexer",
            "role": "Longitudinal Diff & Vector Memory Engine",
            "plain_english": (
                "Compares the new dossier against the workspace's prior snapshot to generate a DiffSummary, "
                "saves the snapshot to SQLite, and indexes semantic chunks into ChromaDB for RAG Q&A."
            ),
            "prompt_summary": "Deterministic diff computation + SQLite snapshot + ChromaDB upsert.",
            "output_schema": "DiffSummary",
            "output_fields": list(DiffSummary.model_fields.keys()),
            "guardrails": [
                "Workspace-isolated ChromaDB metadata filtering",
                "SQLite WAL transactional persistence",
            ],
            "concept_tags": ["memory_architecture"],
            "source_file": "backend/app/agents/nodes.py",
        },
    ]

    graph_edges = [
        {"source": "START", "target": "discovery", "kind": "edge"},
        {"source": "discovery", "target": "hitl_approval", "kind": "edge"},
        {"source": "hitl_approval", "target": "specialist_research", "kind": "edge"},
        {"source": "specialist_research", "target": "critic_verifier", "kind": "edge"},
        {
            "source": "critic_verifier",
            "target": "targeted_research",
            "kind": "conditional",
            "label": "gaps found & retries left",
        },
        {"source": "targeted_research", "target": "critic_verifier", "kind": "edge"},
        {
            "source": "critic_verifier",
            "target": "synthesizer",
            "kind": "conditional",
            "label": "passed or max iterations",
        },
        {"source": "synthesizer", "target": "memory_indexer", "kind": "edge"},
        {"source": "memory_indexer", "target": "END", "kind": "edge"},
    ]

    concepts = [
        {
            "id": "prompting_structured_outputs",
            "title": "Prompting & Structured Outputs",
            "summary": "Enforces strict Pydantic v2 schemas via .with_structured_output() across Discovery, Specialists, and Synthesis.",
            "nodes": ["discovery", "specialist_research", "synthesizer"],
            "source_files": ["backend/app/agents/nodes.py", "backend/app/schemas/intelligence.py"],
        },
        {
            "id": "security_guardrails",
            "title": "Security & Prompt-Injection Guardrails",
            "summary": "Wraps external web text in <source_evidence> delimiters, strips control chars, and enforces public-IP SSRF checks.",
            "nodes": ["discovery", "specialist_research", "targeted_research", "synthesizer"],
            "source_files": ["backend/app/tools/security.py", "backend/app/agents/nodes.py"],
        },
        {
            "id": "hitl_checkpointing",
            "title": "Human-in-the-Loop (HITL) & Checkpointing",
            "summary": "Uses LangGraph interrupt() + AsyncSqliteSaver checkpoints so PMs approve competitors before deep research.",
            "nodes": ["hitl_approval"],
            "source_files": ["backend/app/agents/graph.py", "backend/app/agents/nodes.py"],
        },
        {
            "id": "parallel_fan_out",
            "title": "Parallel Fan-Out & Task Assignment",
            "summary": "Runs per-competitor specialist research concurrently with asyncio.gather + Semaphore(3) and per-task progress tracking.",
            "nodes": ["specialist_research"],
            "source_files": ["backend/app/agents/nodes.py"],
        },
        {
            "id": "hallucination_control",
            "title": "Hallucination Control & Self-Reflection",
            "summary": "Critic node scores URL grounding & completeness, routing gaps back to targeted re-research up to max_critic_iterations.",
            "nodes": ["critic_verifier", "targeted_research"],
            "source_files": ["backend/app/agents/nodes.py", "backend/app/agents/graph.py"],
        },
        {
            "id": "memory_architecture",
            "title": "Memory Architecture",
            "summary": "Combines short-term IntelligenceState, longitudinal SQLite snapshot diffs, and ChromaDB semantic RAG chunks.",
            "nodes": ["hitl_approval", "memory_indexer"],
            "source_files": [
                "backend/app/agents/state.py",
                "backend/app/agents/diff_engine.py",
                "backend/app/db/vector_store.py",
            ],
        },
        {
            "id": "sentiment_analysis",
            "title": "Sentiment Analysis",
            "summary": "Classifies Voice-of-Customer signals into complaint, praise, and switching_trigger categories with source URLs.",
            "nodes": ["specialist_research", "synthesizer"],
            "source_files": ["backend/app/schemas/intelligence.py", "backend/app/agents/nodes.py"],
        },
        {
            "id": "tool_calling_resilience",
            "title": "Tool Calling & Fallback Resilience",
            "summary": "Combines DuckDuckGo search with unquoted retry, HN/Reddit/GitHub collectors, Playwright fallback, and 1-click retry.",
            "nodes": ["discovery", "specialist_research", "targeted_research"],
            "source_files": ["backend/app/tools/registry.py", "backend/app/services/mission_runner.py"],
        },
    ]

    return {"nodes": nodes, "graph_edges": graph_edges, "concepts": concepts}


@router.get("/health")
def health_check(request: Request) -> dict[str, Any]:
    db = _get_db(request)
    ws_count = len(db.list_workspaces())
    return {"status": "ok", "workspaces": ws_count}


@router.get("/workflow/spec")
def get_workflow_spec() -> dict[str, Any]:
    return _build_workflow_spec()


@router.get("/providers")
def list_providers(
    provider: Annotated[SupportedProvider | None, Query()] = None,
    x_llm_provider: Annotated[SupportedProvider | None, Header(alias="X-LLM-Provider")] = None,
    x_llm_api_key: Annotated[str | None, Header(alias="X-LLM-API-Key")] = None,
    x_ollama_base_url: Annotated[str | None, Header(alias="X-Ollama-Base-URL")] = None,
) -> dict[str, Any]:
    runtime_settings = _build_runtime_settings(
        provider=provider or x_llm_provider,
        x_llm_api_key=x_llm_api_key,
        x_ollama_base_url=x_ollama_base_url,
    )
    return {
        "default_provider": runtime_settings.default_llm_provider,
        "default_model": runtime_settings.default_llm_model,
        "providers": runtime_settings.configured_providers(),
    }


@router.post("/providers/ollama/check")
def check_ollama_model_availability(
    payload: OllamaCheckRequest,
    x_ollama_base_url: Annotated[str | None, Header(alias="X-Ollama-Base-URL")] = None,
) -> dict[str, Any]:
    runtime_settings = settings.with_overrides(ollama_base_url=x_ollama_base_url)
    return runtime_settings.check_ollama_model(payload.model)


@router.get("/workspaces")
def list_workspaces(request: Request) -> dict[str, Any]:
    db = _get_db(request)
    return {"workspaces": db.list_workspaces()}


@router.post("/workspaces", status_code=201)
def create_workspace(payload: WorkspaceCreateRequest, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    ws = db.create_workspace(
        name=payload.name,
        product_name=payload.product_name,
        product_description=payload.product_description,
        target_segment=payload.target_segment,
    )
    return {"workspace": ws}


@router.get("/workspaces/{workspace_id}/snapshots")
def list_workspace_snapshots(workspace_id: str, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    ws = db.get_workspace(workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    snapshots = db.list_snapshots_for_workspace(workspace_id)
    return {"workspace": ws, "snapshots": snapshots}


@router.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    runner = _get_runner(request)
    vector_store = _get_vs(request)

    deleted_run_ids = db.delete_workspace(workspace_id)
    if deleted_run_ids is None:
        raise HTTPException(status_code=404, detail="Workspace not found.")

    runner.cancel_workspace_runs(deleted_run_ids)
    vectors_deleted = vector_store.delete_workspace_vectors(workspace_id)
    return {
        "deleted": True,
        "workspace_id": workspace_id,
        "runs_cancelled": len(deleted_run_ids),
        "vectors_deleted": vectors_deleted,
    }


@router.post("/missions", status_code=202)
async def start_mission(
    payload: MissionStartRequest,
    request: Request,
    x_llm_api_key: Annotated[str | None, Header(alias="X-LLM-API-Key")] = None,
    x_ollama_base_url: Annotated[str | None, Header(alias="X-Ollama-Base-URL")] = None,
) -> dict[str, Any]:
    runtime_settings = settings.with_overrides(
        provider=payload.llm_provider,
        api_key=x_llm_api_key,
        ollama_base_url=x_ollama_base_url,
    )
    unavailable_reason = runtime_settings.provider_unavailable_reason(
        payload.llm_provider, payload.llm_model
    )
    if unavailable_reason:
        raise HTTPException(status_code=400, detail=unavailable_reason)

    db = _get_db(request)
    runner = _get_runner(request)

    if payload.workspace_id:
        ws = db.get_workspace(payload.workspace_id)
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found.")
    else:
        ws = db.create_workspace(
            name=f"{payload.product_name} Intel",
            product_name=payload.product_name,
            product_description=payload.product_description,
            target_segment=payload.target_segment,
        )

    thread_id = f"mission-{uuid4()}"
    run = db.create_run(
        workspace_id=ws["id"],
        thread_id=thread_id,
        llm_provider=payload.llm_provider,
        llm_model=payload.llm_model,
        status="discovering",
    )

    initial_state = {
        "run_id": run["id"],
        "workspace_id": ws["id"],
        "product_name": payload.product_name,
        "product_description": payload.product_description,
        "target_segment": payload.target_segment,
        "seed_competitors": payload.seed_competitors,
        "llm_provider": payload.llm_provider,
        "llm_model": payload.llm_model,
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
    if "runtime_settings" in inspect.signature(runner.start_mission).parameters:
        await runner.start_mission(run["id"], initial_state, runtime_settings=runtime_settings)
    else:
        await runner.start_mission(run["id"], initial_state)
    return {"workspace": ws, "run": db.get_run(run["id"])}


@router.get("/missions/{run_id}")
def get_mission(run_id: str, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Mission run not found.")
    snapshot = db.get_snapshot_by_run(run_id)
    citations = db.list_citations(run_id)
    events = db.list_events(run_id)
    return {
        "run": run,
        "snapshot": snapshot,
        "citations": citations,
        "events": events,
    }


@router.get("/missions/{run_id}/events")
async def stream_mission_events(run_id: str, request: Request) -> StreamingResponse:
    db = _get_db(request)
    if not db.get_run(run_id):
        raise HTTPException(status_code=404, detail="Mission run not found.")
    runner = _get_runner(request)

    async def event_generator():
        async for ev in runner.subscribe(run_id):
            if ev.get("event_type") == "heartbeat":
                yield ": heartbeat\n\n"
            else:
                yield f"data: {json.dumps(ev)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/missions/{run_id}/approve")
async def approve_competitors(
    run_id: str,
    payload: HitlApproveRequest,
    request: Request,
    x_llm_api_key: Annotated[str | None, Header(alias="X-LLM-API-Key")] = None,
    x_ollama_base_url: Annotated[str | None, Header(alias="X-Ollama-Base-URL")] = None,
) -> dict[str, Any]:
    db = _get_db(request)
    runner = _get_runner(request)
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Mission run not found.")
    if run["status"] != "awaiting_approval":
        raise HTTPException(
            status_code=409,
            detail=f"Mission is currently '{run['status']}', not 'awaiting_approval'.",
        )

    runtime_settings: Settings | None = None
    if x_llm_api_key or x_ollama_base_url:
        runtime_settings = settings.with_overrides(
            provider=run["llm_provider"],
            api_key=x_llm_api_key,
            ollama_base_url=x_ollama_base_url,
        )

    approved = [c.model_dump() for c in payload.competitors]
    if "runtime_settings" in inspect.signature(runner.resume_mission).parameters:
        await runner.resume_mission(run_id, approved, runtime_settings=runtime_settings)
    else:
        await runner.resume_mission(run_id, approved)
    return {"status": "resumed", "run_id": run_id, "approved_count": len(approved)}


@router.post("/missions/{run_id}/retry", status_code=202)
async def retry_mission(
    run_id: str,
    payload: MissionRetryRequest,
    request: Request,
    x_llm_api_key: Annotated[str | None, Header(alias="X-LLM-API-Key")] = None,
    x_ollama_base_url: Annotated[str | None, Header(alias="X-Ollama-Base-URL")] = None,
) -> dict[str, Any]:
    db = _get_db(request)
    runner = _get_runner(request)
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Mission run not found.")
    if run["status"] == "completed":
        raise HTTPException(status_code=409, detail="Mission is already completed.")

    provider: SupportedProvider = payload.llm_provider or run["llm_provider"]
    model = (payload.llm_model or run["llm_model"]).strip()
    runtime_settings = settings.with_overrides(
        provider=provider,
        api_key=x_llm_api_key,
        ollama_base_url=x_ollama_base_url,
    )
    unavailable_reason = runtime_settings.provider_unavailable_reason(provider, model)
    if unavailable_reason:
        raise HTTPException(status_code=400, detail=unavailable_reason)

    try:
        await runner.retry_mission(
            run_id=run_id,
            skip_competitors=payload.skip_competitors,
            llm_provider=provider,
            llm_model=model,
            runtime_settings=runtime_settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"status": "retrying", "run_id": run_id, "run": db.get_run(run_id)}


@router.get("/missions/{run_id}/export")
def export_mission(
    run_id: str,
    request: Request,
    format: Annotated[str, Query(pattern="^(markdown|json)$")] = "markdown",
) -> Response:
    db = _get_db(request)
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Mission run not found.")
    snap = db.get_snapshot_by_run(run_id)
    if not snap:
        raise HTTPException(status_code=404, detail="No completed snapshot found for this mission.")

    ws = db.get_workspace(run["workspace_id"])
    product_name = ws["product_name"] if ws else "Product"
    dossier = DossierPayload.model_validate(snap["dossier"])
    diff_summary = (
        DiffSummary.model_validate(snap["diff_summary"]) if snap.get("diff_summary") else None
    )
    citations = [
        SourceCitationInput.model_validate(c) for c in db.list_citations(run_id)
    ]

    if format == "json":
        return Response(
            content=json.dumps(
                {
                    "product_name": product_name,
                    "run_id": run_id,
                    "dossier": dossier.model_dump(),
                    "diff_summary": diff_summary.model_dump() if diff_summary else None,
                    "citations": [c.model_dump() for c in citations],
                },
                indent=2,
            ),
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="moatradar-dossier-{run_id[:8]}.json"'
            },
        )

    md = export_dossier_markdown(
        product_name=product_name,
        dossier=dossier,
        diff_summary=diff_summary,
        citations=citations,
    )
    return PlainTextResponse(
        content=md,
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="moatradar-dossier-{run_id[:8]}.md"'
        },
    )


@router.get("/workspaces/{workspace_id}/documents")
def list_workspace_documents(workspace_id: str, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return {"documents": db.list_custom_documents(workspace_id)}


async def _read_multipart_file(request: Request) -> tuple[str, bytes, str]:
    """Read an uploaded multipart file via Starlette form() or stdlib MIME parser fallback."""
    try:
        form = await request.form()
        upload = form.get("file")
        if upload is not None and hasattr(upload, "read"):
            raw_bytes = await upload.read()  # type: ignore[union-attr]
            filename = Path(getattr(upload, "filename", None) or "document.txt").name
            content_type = getattr(upload, "content_type", None) or "text/plain"
            return filename, raw_bytes, content_type
    except (AssertionError, RuntimeError):
        # python-multipart is optional; fall back to stdlib MIME parser below.
        pass

    content_type_header = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type_header.lower():
        raise HTTPException(
            status_code=400, detail="Expected multipart/form-data upload with a 'file' field."
        )
    body = await request.body()
    raw_mime = (
        f"Content-Type: {content_type_header}\r\nMIME-Version: 1.0\r\n\r\n".encode("latin-1")
        + body
    )
    msg = BytesParser(policy=default_email_policy).parsebytes(raw_mime)
    if not msg.is_multipart():
        raise HTTPException(status_code=400, detail="Malformed multipart upload payload.")

    for part in msg.iter_parts():
        field_name = part.get_param("name", header="content-disposition")
        part_filename = part.get_filename()
        if field_name == "file" or part_filename is not None:
            payload = part.get_payload(decode=True)
            if payload is None:
                raw_text = part.get_payload()
                payload = raw_text.encode("utf-8") if isinstance(raw_text, str) else b""
            safe_name = Path(part_filename or "document.txt").name
            part_ct = part.get_content_type() or "text/plain"
            return safe_name, payload, part_ct

    raise HTTPException(status_code=400, detail="Missing 'file' field in multipart upload.")


@router.post("/workspaces/{workspace_id}/documents", status_code=201)
async def upload_workspace_document(
    workspace_id: str,
    request: Request,
) -> dict[str, Any]:
    db = _get_db(request)
    vs = _get_vs(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")

    safe_name, raw_bytes, content_type = await _read_multipart_file(request)
    text = _extract_uploaded_document_text(safe_name, raw_bytes, content_type)

    doc_id = str(uuid4())
    excerpt = sanitize_evidence_text(text, max_chars=280)
    doc = db.create_custom_document(
        workspace_id=workspace_id,
        filename=safe_name,
        content_type=content_type,
        char_count=len(text),
        content_excerpt=excerpt,
        doc_id=doc_id,
    )
    vs.index_custom_document(
        workspace_id=workspace_id,
        doc_id=doc_id,
        filename=safe_name,
        text=text,
    )
    return {"document": doc}


@router.delete("/workspaces/{workspace_id}/documents/{doc_id}")
def delete_workspace_document(
    workspace_id: str, doc_id: str, request: Request
) -> dict[str, Any]:
    db = _get_db(request)
    vs = _get_vs(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    existing = db.get_custom_document(workspace_id, doc_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found.")

    vs.delete_custom_document(workspace_id, doc_id)
    db.delete_custom_document(workspace_id, doc_id)
    return {"deleted": True, "id": doc_id}


@router.get("/workspaces/{workspace_id}/monitor")
def get_workspace_monitor(workspace_id: str, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return {"monitor": db.get_workspace_monitor(workspace_id)}


@router.put("/workspaces/{workspace_id}/monitor")
def update_workspace_monitor(
    workspace_id: str,
    payload: WorkspaceMonitorUpdateRequest,
    request: Request,
) -> dict[str, Any]:
    db = _get_db(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")

    clean_webhook = (payload.webhook_url or "").strip() or None
    if clean_webhook:
        try:
            clean_webhook = validate_public_url(clean_webhook)
        except UnsafeUrlError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    clean_provider = (payload.llm_provider or "").strip() or None
    clean_model = (payload.llm_model or "").strip() or None
    next_run_at = compute_next_run_at(payload.interval)

    monitor = db.upsert_workspace_monitor(
        workspace_id=workspace_id,
        interval=payload.interval,
        webhook_url=clean_webhook,
        llm_provider=clean_provider,
        llm_model=clean_model,
        next_run_at=next_run_at,
    )
    return {"monitor": monitor}


@router.get("/workspaces/{workspace_id}/chat")
def list_chat_history(workspace_id: str, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return {"messages": db.list_chat_messages(workspace_id)}


@router.post("/workspaces/{workspace_id}/chat")
async def chat_with_workspace(
    workspace_id: str,
    payload: RagChatRequest,
    request: Request,
    x_llm_api_key: Annotated[str | None, Header(alias="X-LLM-API-Key")] = None,
    x_ollama_base_url: Annotated[str | None, Header(alias="X-Ollama-Base-URL")] = None,
) -> dict[str, Any]:
    db = _get_db(request)
    vs = _get_vs(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    runtime_settings = settings.with_overrides(
        provider=payload.llm_provider,
        api_key=x_llm_api_key,
        ollama_base_url=x_ollama_base_url,
    )
    unavailable_reason = runtime_settings.provider_unavailable_reason(
        payload.llm_provider, payload.llm_model
    )
    if unavailable_reason:
        raise HTTPException(status_code=400, detail=unavailable_reason)

    db.save_chat_message(workspace_id, "user", payload.question, [])
    rag_res = await answer_workspace_question(
        vector_store=vs,
        workspace_id=workspace_id,
        question=payload.question,
        llm_provider=payload.llm_provider,
        llm_model=payload.llm_model,
        app_settings=runtime_settings,
    )
    saved = db.save_chat_message(
        workspace_id,
        "assistant",
        rag_res.answer,
        [c.model_dump() for c in rag_res.citations],
    )
    return {
        "answer": rag_res.answer,
        "citations": [c.model_dump() for c in rag_res.citations],
        "message": saved,
    }
