"""Integration tests for FastAPI REST & SSE routes."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.database import Database
from app.db.vector_store import DossierVectorStore
from app.main import create_app
from app.schemas.intelligence import DossierPayload, RagChatResponse, RagCitation


@pytest.fixture
def test_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    db_path = str(tmp_path / "api_test.db")
    chroma_dir = str(tmp_path / "chroma_api")
    db = Database(db_path)
    db.init_db()
    vs = DossierVectorStore(chroma_dir)

    app = create_app(db_override=db, vector_store_override=vs)
    with TestClient(app) as client:
        yield client


def test_health_and_providers_do_not_leak_keys(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.config.settings.gemini_api_key", "super-secret-gemini-key")
    res = test_client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    prov = test_client.get("/api/providers")
    assert prov.status_code == 200
    body_text = prov.text
    assert "super-secret-gemini-key" not in body_text
    providers = {p["provider"]: p for p in prov.json()["providers"]}
    assert providers["gemini"]["configured"] is True


def test_workspace_mission_export_and_chat_endpoints(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Create workspace
    ws_res = test_client.post(
        "/api/workspaces",
        json={
            "name": "Q4 CI Workspace",
            "product_name": "SignalPulse",
            "product_description": "Automated PM competitive intelligence desk",
            "target_segment": "B2B SaaS Product Managers",
        },
    )
    assert ws_res.status_code == 201
    ws = ws_res.json()["workspace"]

    list_res = test_client.get("/api/workspaces")
    assert list_res.status_code == 200
    assert len(list_res.json()["workspaces"]) == 1

    # Mock runner background tasks for fast API contract test
    async def fake_start_mission(run_id: str, initial_state: dict[str, Any]) -> None:
        runner = test_client.app.state.runner  # type: ignore[attr-defined]
        runner.db.update_run_status(run_id, "awaiting_approval")

    async def fake_resume_mission(run_id: str, approved: list[dict]) -> None:
        runner = test_client.app.state.runner  # type: ignore[attr-defined]
        dossier = DossierPayload(
            executive_brief_md="## Brief\nVerified market brief.",
            market_trends=["Transparent pricing"],
            feature_matrix=[],
            pricing_matrix=[],
            battlecards=[],
            voc_insights=[],
            momentum_signals=[],
            opportunities=[],
        )
        runner.db.save_snapshot(run_id, ws["id"], dossier, None)
        runner.db.update_run_status(run_id, "completed", critic_score=0.9, completed=True)

    monkeypatch.setattr(test_client.app.state.runner, "start_mission", fake_start_mission)  # type: ignore[attr-defined]
    monkeypatch.setattr(test_client.app.state.runner, "resume_mission", fake_resume_mission)  # type: ignore[attr-defined]

    # Ensure mission fails fast with 400 if requested provider has no API key
    monkeypatch.setattr("app.api.routes.settings.gemini_api_key", "")
    bad_mission = test_client.post(
        "/api/missions",
        json={
            "workspace_id": ws["id"],
            "product_name": "SignalPulse",
            "product_description": "Automated PM competitive intelligence desk",
            "target_segment": "B2B SaaS Product Managers",
            "llm_provider": "gemini",
            "llm_model": "gemini-2.5-flash",
        },
    )
    assert bad_mission.status_code == 400

    # Configure key and start mission
    monkeypatch.setattr("app.api.routes.settings.gemini_api_key", "fake-key-for-api-test")
    m_res = test_client.post(
        "/api/missions",
        json={
            "workspace_id": ws["id"],
            "product_name": "SignalPulse",
            "product_description": "Automated PM competitive intelligence desk",
            "target_segment": "B2B SaaS Product Managers",
            "seed_competitors": ["Klue"],
            "llm_provider": "gemini",
            "llm_model": "gemini-2.5-flash",
        },
    )
    assert m_res.status_code == 202
    run_id = m_res.json()["run"]["id"]

    # Approve HITL competitors
    app_res = test_client.post(
        f"/api/missions/{run_id}/approve",
        json={
            "competitors": [
                {"name": "Klue", "website": "https://klue.com", "category": "direct"}
            ]
        },
    )
    assert app_res.status_code == 200

    # Export Markdown & JSON
    md_res = test_client.get(f"/api/missions/{run_id}/export?format=markdown")
    assert md_res.status_code == 200
    assert "Competitive Market Intelligence Dossier: SignalPulse" in md_res.text

    json_res = test_client.get(f"/api/missions/{run_id}/export?format=json")
    assert json_res.status_code == 200
    assert json_res.json()["dossier"]["executive_brief_md"] == "## Brief\nVerified market brief."

    # RAG Chat endpoint
    async def fake_rag(*args: Any, **kwargs: Any) -> RagChatResponse:
        return RagChatResponse(
            answer="Klue focuses on enterprise sales [1].",
            citations=[
                RagCitation(
                    competitor_name="Klue",
                    section="Battlecard",
                    url="https://klue.com",
                    excerpt="Enterprise battlecards",
                )
            ],
        )

    monkeypatch.setattr("app.api.routes.answer_workspace_question", fake_rag)
    chat_res = test_client.post(
        f"/api/workspaces/{ws['id']}/chat",
        json={
            "question": "What does Klue focus on?",
            "llm_provider": "gemini",
            "llm_model": "gemini-2.5-flash",
        },
    )
    assert chat_res.status_code == 200
    assert "Klue" in chat_res.json()["answer"]


def test_providers_have_no_hardcoded_defaults(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.api.routes.settings.gemini_api_key", "")
    monkeypatch.setattr("app.api.routes.settings.openai_api_key", "")
    monkeypatch.setattr("app.api.routes.settings.anthropic_api_key", "")
    monkeypatch.setattr("app.api.routes.settings.groq_api_key", "")
    monkeypatch.setattr("app.api.routes.settings.default_llm_provider", "")
    monkeypatch.setattr("app.api.routes.settings.default_llm_model", "")
    monkeypatch.setattr("app.config.Settings.discover_ollama_models", lambda self: (False, []))

    prov = test_client.get("/api/providers")
    assert prov.status_code == 200
    payload = prov.json()
    assert payload["default_provider"] == ""
    assert payload["default_model"] == ""
    for item in payload["providers"]:
        assert item["configured"] is False
        assert item["models"] == []
        assert item["default_model"] == ""

    missing_model_launch = test_client.post(
        "/api/missions",
        json={
            "product_name": "MoatRadar",
            "product_description": "Automated PM competitive intelligence desk",
            "target_segment": "B2B SaaS Product Managers",
        },
    )
    assert missing_model_launch.status_code == 422


def test_ollama_provider_discovery_and_mission_validation(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.config.Settings.discover_ollama_models",
        lambda self: (False, []),
    )
    offline_prov = test_client.get("/api/providers")
    assert offline_prov.status_code == 200
    offline_map = {p["provider"]: p for p in offline_prov.json()["providers"]}
    assert "ollama" in offline_map
    assert offline_map["ollama"]["configured"] is False
    assert offline_map["ollama"]["models"] == []
    assert offline_map["ollama"]["default_model"] == ""

    offline_check = test_client.post("/api/providers/ollama/check", json={"model": "gemma4:12b"})
    assert offline_check.status_code == 200
    assert offline_check.json()["reachable"] is False
    assert offline_check.json()["available"] is False

    offline_launch = test_client.post(
        "/api/missions",
        json={
            "product_name": "SignalPulse",
            "product_description": "Automated PM competitive intelligence desk",
            "target_segment": "B2B SaaS Product Managers",
            "llm_provider": "ollama",
            "llm_model": "gemma4:12b",
        },
    )
    assert offline_launch.status_code == 400

    async def fake_start_mission(run_id: str, initial_state: dict[str, Any]) -> None:
        return None

    monkeypatch.setattr(test_client.app.state.runner, "start_mission", fake_start_mission)  # type: ignore[attr-defined]
    monkeypatch.setattr(
        "app.config.Settings.discover_ollama_models",
        lambda self: (True, ["qwen2.5:7b", "gemma4:12b"]),
    )

    missing_specific = test_client.post(
        "/api/providers/ollama/check", json={"model": "llama3.2:latest"}
    )
    assert missing_specific.status_code == 200
    assert missing_specific.json()["reachable"] is True
    assert missing_specific.json()["available"] is False
    assert "ollama pull llama3.2:latest" in missing_specific.json()["detail"]

    missing_launch = test_client.post(
        "/api/missions",
        json={
            "product_name": "SignalPulse",
            "product_description": "Automated PM competitive intelligence desk",
            "target_segment": "B2B SaaS Product Managers",
            "llm_provider": "ollama",
            "llm_model": "llama3.2:latest",
        },
    )
    assert missing_launch.status_code == 400

    ok_check = test_client.post("/api/providers/ollama/check", json={"model": "gemma4:12b"})
    assert ok_check.status_code == 200
    assert ok_check.json()["reachable"] is True
    assert ok_check.json()["available"] is True

    online_prov = test_client.get("/api/providers")
    assert online_prov.status_code == 200
    online_map = {p["provider"]: p for p in online_prov.json()["providers"]}
    assert online_map["ollama"]["configured"] is True
    assert online_map["ollama"]["models"] == ["qwen2.5:7b", "gemma4:12b"]

    ok_launch = test_client.post(
        "/api/missions",
        json={
            "product_name": "SignalPulse",
            "product_description": "Automated PM competitive intelligence desk",
            "target_segment": "B2B SaaS Product Managers",
            "llm_provider": "ollama",
            "llm_model": "gemma4:12b",
        },
    )
    assert ok_launch.status_code == 202
