# Implementation Tasks: CMI Desk

Ordered by dependency. Executed via Red-Green-Refactor TDD.

- [x] **T1: Backend Project Scaffold & Config**
  - Initialized `backend/` with `uv` (`pyproject.toml`), `.env.example`, `app/config.py`, and `app/schemas/intelligence.py`.
  - Verified: Pydantic v2 contracts & config settings validated.

- [x] **T2: SSRF Security Guardrails & Zero-Key Live Data Tools**
  - Wrote failing tests (`test_security.py`, `test_tools.py`), then implemented `app/tools/security.py`, `web_search.py` (`ddgs`), `web_scraper.py` (`httpx` + `trafilatura`/`BeautifulSoup4`), `community.py` (HN Algolia, Reddit JSON + fallback, GitHub Search), and `registry.py`.
  - Verified: All security and tool tests pass.

- [x] **T3: Persistence Layer (SQLite + ChromaDB) & Diff/Exporter Engines**
  - Wrote failing tests (`test_diff_and_exporter.py`, `test_vector_and_rag.py`), then implemented `app/db/database.py`, `app/db/vector_store.py`, `app/agents/diff_engine.py`, and `app/services/exporter.py`.
  - Verified: SQLite CRUD, longitudinal snapshot diff, Markdown exporter, and ChromaDB retrieval pass.

- [x] **T4: Multi-Provider LLM Factory & LangGraph Multi-Agent Orchestrator**
  - Wrote failing tests (`test_graph_critic.py`) testing HITL `interrupt`/`resume`, Critic routing loop (`iteration_count` bound + gap detection), and RAG chat.
  - Implemented `app/llm/factory.py`, `app/agents/state.py`, `app/agents/nodes.py`, `app/agents/graph.py`, and `app/agents/rag_chat.py`.
  - Verified: LangGraph HITL & Critic loop tests pass.

- [x] **T5: FastAPI Backend, SSE Streaming & Integration Tests**
  - Wrote API integration tests (`test_api.py`), then implemented `app/services/mission_runner.py`, `app/api/routes.py`, and `app/main.py`.
  - Verified: Full backend `uv run pytest -v` (28 tests) and `uv run ruff check` pass.

- [x] **T6: Evaluation Harness (`eval/run_eval.py`)**
  - Built automated evaluation harness measuring Citation Grounding Rate, Deliverable Schema Completeness, Critic Loop Effectiveness, and Latency.
  - Verified: `tests/test_eval_harness.py` and `eval/run_eval.py --help` pass.

- [x] **T7: Modern Next.js Frontend Workbench**
  - Initialized `frontend/` (Next.js App Router, TypeScript, Tailwind CSS, Recharts, Lucide) with Workspace Sidebar, Mission Launcher, HITL Competitor Approval Panel, Live SSE Agent Trace Panel, 7-Tab PM Dossier Workbench, Snapshot Diff View, Ask the Desk RAG Chat, and Markdown/JSON/Print-PDF Export.
  - Verified: `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.

- [x] **T8: End-to-End Verification, Security Audit & Documentation**
  - Added `.github/workflows/ci.yml`, `scripts/start-dev.ps1`, `ARCHITECTURE.md`, and `README.md`.
