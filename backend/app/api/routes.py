"""FastAPI REST and SSE routes for MoatRadar."""

import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.agents.rag_chat import answer_workspace_question
from app.config import settings
from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.schemas.intelligence import (
    DiffSummary,
    DossierPayload,
    HitlApproveRequest,
    MissionStartRequest,
    OllamaCheckRequest,
    RagChatRequest,
    SourceCitationInput,
    WorkspaceCreateRequest,
)
from app.services.exporter import export_dossier_markdown
from app.services.mission_runner import MissionRunner

router = APIRouter(prefix="/api")


def _get_db(request: Request) -> Database:
    return request.app.state.db


def _get_vs(request: Request) -> DossierVectorStore:
    return request.app.state.vector_store


def _get_runner(request: Request) -> MissionRunner:
    return request.app.state.runner


@router.get("/health")
def health_check(request: Request) -> dict[str, Any]:
    db = _get_db(request)
    ws_count = len(db.list_workspaces())
    return {"status": "ok", "workspaces": ws_count}


@router.get("/providers")
def list_providers() -> dict[str, Any]:
    return {
        "default_provider": settings.default_llm_provider,
        "default_model": settings.default_llm_model,
        "providers": settings.configured_providers(),
    }


@router.post("/providers/ollama/check")
def check_ollama_model_availability(payload: OllamaCheckRequest) -> dict[str, Any]:
    return settings.check_ollama_model(payload.model)


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


@router.post("/missions", status_code=202)
async def start_mission(payload: MissionStartRequest, request: Request) -> dict[str, Any]:
    unavailable_reason = settings.provider_unavailable_reason(
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
    run_id: str, payload: HitlApproveRequest, request: Request
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

    approved = [c.model_dump() for c in payload.competitors]
    await runner.resume_mission(run_id, approved)
    return {"status": "resumed", "run_id": run_id, "approved_count": len(approved)}


@router.get("/missions/{run_id}/export")
def export_mission(
    run_id: str,
    request: Request,
    format: str = Query(default="markdown", pattern="^(markdown|json)$"),
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
                "Content-Disposition": f'attachment; filename="cmi-dossier-{run_id[:8]}.json"'
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
            "Content-Disposition": f'attachment; filename="cmi-dossier-{run_id[:8]}.md"'
        },
    )


@router.get("/workspaces/{workspace_id}/chat")
def list_chat_history(workspace_id: str, request: Request) -> dict[str, Any]:
    db = _get_db(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return {"messages": db.list_chat_messages(workspace_id)}


@router.post("/workspaces/{workspace_id}/chat")
async def chat_with_workspace(
    workspace_id: str, payload: RagChatRequest, request: Request
) -> dict[str, Any]:
    db = _get_db(request)
    vs = _get_vs(request)
    if not db.get_workspace(workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found.")
    unavailable_reason = settings.provider_unavailable_reason(
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
