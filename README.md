# Competitive Market Intelligence Desk (CMI Desk)

> **CSE476 — Agentic AI Project**  
> A stateful, multi-agent Competitive Market Intelligence workbench built for Product Managers using **LangGraph**, **FastAPI**, **SQLite + ChromaDB**, **zero-key live web & community tools**, and **Next.js**.

---

## Key Agentic Capabilities

1. **Competitor Discovery + Human-in-the-Loop (HITL) Gate**
   - Expands a PM's product description into live search queries and identifies 3–6 direct, adjacent, and substitute competitors.
   - Pauses execution via LangGraph `interrupt()` backed by `AsyncSqliteSaver` so the PM can add, remove, or edit competitors before deep research begins.
2. **Parallel Multi-Domain Specialist Research**
   - Concurrently collects live evidence across zero-key sources (`ddgs`, `httpx` + `trafilatura`/`BeautifulSoup4` with SSRF protection, Hacker News Algolia API, Reddit public JSON search, and GitHub Search API).
   - Synthesizes specialist findings across **Product & Features**, **Pricing & Packaging**, **Voice of Customer (VoC)**, and **Market Momentum**.
3. **Critic / Reflection Verification Loop**
   - Audits specialist claims against retrieved URLs/snippets, flags missing pricing or VoC gaps, and conditionally loops back to targeted re-research (up to 2 iterations) before final synthesis.
4. **PM Deliverable Suite**
   - **Executive Market Brief** with clickable source citations
   - **Feature Comparison Matrix** across all competitors
   - **Pricing & Packaging Matrix** (tiers, free plans, enterprise gates)
   - **Competitor Battlecards & SWOT** (How-to-Win & Landmines)
   - **Voice-of-Customer (VoC) Sentiment** (real complaints, praise, switching triggers)
   - **White-Space Opportunity Matrix** (Impact vs. Effort scatter chart + roadmap horizon)
5. **Longitudinal Snapshot Diffing & Citation-Grounded RAG Chat**
   - Re-running a workspace computes a structured **Change Diff** against the previous snapshot.
   - All dossier sections and raw evidence are indexed in **ChromaDB** for **Ask the Desk** follow-up Q&A.
6. **Zero Mock / Demo Data**
   - Every run executes live LLM calls and live web collection.

---

## Project Structure

- `PRD.md` — Product Requirements Document
- `ARCHITECTURE.md` — System architecture diagram, LangGraph state flow, API contracts, and security guardrails
- `TASKS.md` — Dependency-ordered implementation plan
- `backend/` — Python 3.13 + FastAPI + LangGraph + SQLite + ChromaDB + Evaluation Harness (`eval/run_eval.py`)
- `frontend/` — Next.js App Router + TypeScript + Tailwind CSS + Recharts

---

## Quick Start

### 1. Configure Environment Variables

Copy `.env.example` to `.env` in the repository root and set at least one LLM API key:

```bash
cp .env.example .env
```

Supported providers in `.env`:
- `GEMINI_API_KEY` (default: `gemini-3.5-flash`)
- `OPENAI_API_KEY` (`gpt-4o-mini`, `gpt-4o`)
- `ANTHROPIC_API_KEY` (`claude-sonnet-4-20250514`)
- `GROQ_API_KEY` (`llama-3.3-70b-versatile`)
- `OLLAMA_BASE_URL` (local Ollama server, e.g. `http://127.0.0.1:11434`, dynamically lists installed models via `/api/tags`)

### 2. Run the Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Verification & Evaluation

### Run Automated Backend Tests

```bash
cd backend
uv run pytest -v
```

### Run Frontend Typecheck & Production Build

```bash
cd frontend
npx tsc --noEmit
npm run build
```

### Run Agentic Evaluation Harness

Audit existing persisted runs in SQLite:
```bash
cd backend
uv run python eval/run_eval.py --mode audit-db
```

Run a live benchmark evaluation (requires configured `.env` API key):
```bash
cd backend
uv run python eval/run_eval.py --mode live --product "Linear" --competitors Jira Asana Shortcut
```
