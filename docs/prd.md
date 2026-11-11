# Product Requirements Document: MoatRadar

**Target Personas:** Product Managers (PMs), Founders, Product Marketing, and AI Learners / Engineering Reviewers  
**License:** Apache-2.0  
**Current Release:** `v0.1.0` (Implemented)  
**Target Release:** `v0.2.0` — *Interactive Glass-Box Agentic Workbench & Complete PM Intelligence Suite*

---

## 1. Objective & Problem Statement

Product Managers need continuous, evidence-backed competitive intelligence to make roadmap, pricing, positioning, and sales-enablement decisions. Proprietary CI suites cost \$10k–\$40k+/year, while manual research across pricing pages, Reddit threads, and Hacker News goes stale quickly.

Meanwhile, most multi-agent AI tools operate as **opaque black boxes**: when a pipeline slows down or fails midway, users cannot see which agent is working, what instructions it received, why a loop retried, or where execution broke. Learners and reviewers also struggle to map abstract Agentic AI theory (prompting, guardrails, HITL, memory, sentiment, hallucination checks) to working production code.

**MoatRadar `v0.2.0`** turns competitive intelligence into an **interactive, observable "glass-box" multi-agent workbench**:
1. Users can watch every LangGraph node, edge packet, parallel competitor task, and critic retry loop animate in a **full-screen interactive 3D-styled pipeline visualizer**.
2. Anyone—with zero prior Agentic AI background and **zero API keys configured**—can launch **Preview Tutor Mode** to step through the workflow as an interactive guided lesson on how MoatRadar works and which Agentic AI principles power every stage.
3. Users can pinpoint exact stalls or failures on the live graph and trigger **1-click recovery actions**, bring their own browser-stored API keys (**BYOK Settings**), upload **custom internal evidence**, scrape **JS-rendered pricing pages**, and schedule **recurring workspace monitors**.

---

## 2. Core Principles (Preserved + Extended)

- **Zero Fake Live Claims:** Live missions execute real LLM reasoning against live web search, public APIs, Playwright pricing renders (when enabled), and uploaded workspace docs—always citing provenance URLs or uploaded doc IDs.
- **Educational Transparency Without Prompt/Secret Leaks:** Node inspection exposes structured prompt templates, output contracts, and sanitized state summaries—never exposing `.env` secrets or browser BYOK keys in DB rows, SSE logs, or UI traces.
- **Zero-Key Preview Tutor Exception:** Only **Preview Tutor Mode** uses a clearly badged, static, curated walkthrough dataset so first-time visitors can learn the system before entering an API key or starting Ollama.

---

## 3. Bundled `v0.2.0` Release Scope

### Pillar 1 — Full-Screen Interactive Workflow & 3D-Perspective Pipeline Visualizer
- A dedicated full-screen workspace tab (**"Workflow X-Ray"**) alongside the existing Dossier view and Dossier tabs.
- **Clean Fixed Interactive Topology (CSS 3D Depth + Animated SVG Data Beams):**
  - Renders the true LangGraph DAG without fragile pan/zoom navigation:
    `START` → `discovery` → `hitl_approval` → `specialist_research` *(expanding live into parallel per-competitor task cards)* → `critic_verifier` ⇄ `targeted_research` *(animated conditional retry arc)* → `synthesizer` → `memory_indexer` → `END`.
  - Depth-layered 3D perspective node cards, glowing active borders, animated data packets moving along active edges, and completion/failure status rings.
- **Live Task Assignment & Completion Tracking:**
  - Displays parallel sub-task assignments per competitor inside `specialist_research` (`completed`, `running`, `retrying`, `failed`).
  - Emits richer structured `metadata` in `AgentEventPayload` (phase, active competitor, task progress, duration ms, guardrail triggers, failed node/competitor context).
- **Node X-Ray Inspector (Recommended Sanitized Depth):**
  - Clicking any node opens a detailed side inspector displaying:
    - **Role & Instructions Given:** Structured prompt template summary + rules injected.
    - **Expected Output Contract:** Exact Pydantic schema / fields (`CompetitorCandidate`, `DomainFinding`, `CriticReport`, `DossierPayload`, etc.).
    - **Guardrails Active:** `<source_evidence>` untrusted boundary tagging, `sanitize_evidence_text`, SSRF `validate_public_url`.
    - **Live Sanitized Execution Snapshot:** Status, duration, inputs count, outputs count, gaps detected, or exact failure message.

### Pillar 2 — Interactive Preview Tutor Mode & Clickable Agentic AI Concept Badges
- **Dedicated Preview Tutor Mode (No API Key Required):**
  - Built for users with zero prior Agentic AI knowledge.
  - Features **Step-by-Step Interactive Playback** (`Play`, `Pause`, `Next Step`, `Prev Step`, `Jump to Stage`) driving the exact same 3D-styled pipeline animation through a curated end-to-end sample scenario—including a simulated HITL pause, a Critic gap detection + retry loop, and a recoverable error walkthrough.
  - Plain-English narration ("What is happening right now", "How the agent receives instructions and returns structured data", "Why this step exists").
- **Clickable Agentic AI Concept Badges (Preview + Live):**
  - Displayed both as an interactive concept strip and attached directly to the graph nodes implementing them:
    1. **Prompting & Structured Outputs** (`discovery`, `specialist_research`, `synthesizer`)
    2. **Security & Prompt-Injection Guardrails** (`_format_evidence_block` `<source_evidence>`, SSRF filter)
    3. **Human-in-the-Loop (HITL) & Checkpointing** (`hitl_approval`, `AsyncSqliteSaver`)
    4. **Parallel Fan-Out & Task Assignment** (`specialist_research` → `_analyze_single_competitor`)
    5. **Hallucination Control & Self-Reflection** (`critic_verifier` grounding score + `_route_after_critic` retry)
    6. **Memory Architecture** (Short-term `IntelligenceState`, SQLite snapshot diff memory, ChromaDB vector RAG memory)
    7. **Sentiment Analysis** (VoC classification: `complaint`, `praise`, `switching_trigger`)
    8. **Tool Calling & Fallback Resilience** (`ddgs` unquoted retry, HN/Reddit/GitHub collectors, Playwright pricing scraper)
  - Clicking any badge highlights all matching nodes on the workflow graph and opens a concise educational card tying the concept to MoatRadar's live state (or sample state in Preview) and real source file paths.

### Pillar 3 — Fault Pinpointing & 1-Click Recovery Actions
- **Failure Localization:** When a run enters `failed` or stalls mid-node, the exact failing node card pulses red/amber with its failing competitor/task context, exception message, and troubleshooting hint (e.g., model not pulled in Ollama, provider key invalid, search timeout).
- **1-Click Recovery Endpoints & UI Buttons:**
  - **Retry Failed Stage:** Resume/re-invoke from the last durable SQLite checkpoint (or re-run from discovery / re-run failed specialist stage with current BYOK/Ollama settings).
  - **Skip Blocked Competitor (when in specialist stage):** Exclude a repeatedly failing competitor target and continue synthesis with remaining verified competitors.

### Pillar 4 — Browser BYOK Settings (API Keys & Custom Ollama URL)
- A **Settings** modal/drawer accessible from the top bar / launcher where users enter:
  - Per-provider API keys (`gemini`, `openai`, `anthropic`, `groq`) stored strictly in **browser `localStorage`** (optionally cleared anytime with one click).
  - Custom **Ollama Base URL** override (defaulting to server `OLLAMA_BASE_URL` when unset).
- Sent per request via HTTPS headers (`X-LLM-API-Key`, `X-Ollama-Base-URL`), never persisted in SQLite, `checkpoints.db`, or SSE event logs.
- Dynamic model discovery (`GET /api/providers` or header-aware `POST /api/providers/models`) populates verified live models using the user's supplied key/URL.

### Pillar 5 — Custom Evidence Sources
- Users can upload workspace-scoped **internal PM evidence** (`.md`, `.txt`, `.pdf` — e.g., win/loss call notes, sales transcripts, internal battlecards) up to validated size limits.
- Parsed, sanitized (`sanitize_evidence_text`), tagged as `source_type="custom_upload"`, stored with workspace provenance, indexed into ChromaDB, and surfaced alongside public web evidence during **RAG Chat** and **Specialist Research / Synthesis**.

### Pillar 6 — Browser-Rendered Pricing Scraper (Playwright Fallback)
- Optional Playwright headless Chromium collector invoked specifically when static `httpx` + `trafilatura` extraction yields empty/JS-blocked content on candidate pricing URLs.
- Strictly executes **SSRF public-IP / private-network validation** *before* launching or navigating any page, enforces strict page load timeouts, caps rendered text, and falls back gracefully if Playwright/Chromium is unavailable in the host environment.

### Pillar 7 — Scheduled Workspace Monitors & Diff Alerts
- Users can configure a recurring check cadence (`off`, `daily`, `weekly`) and an optional **Webhook URL** (validated against SSRF rules!) per workspace.
- Lightweight background scheduler triggers workspace re-runs, computes `DiffSummary` against the prior snapshot, and dispatches a structured webhook summary when changes cross the configured significance threshold (or records monitor run history in the UI).

---

## 4. Key User Journeys

1. **Zero-Key Explorer / Learner:** Opens MoatRadar → clicks **"Interactive Tutor / Preview"** tab → steps through animated 3D workflow stages → clicks **"Hallucination Control"** badge to watch `critic_verifier` bounce a weak claim back to `targeted_research` → opens the node inspector to see exact instructions, Pydantic schema, and guardrails.
2. **PM Using Own API Key (BYOK):** Opens **Settings** → pastes a Gemini/OpenAI/Groq key (or verifies local `gemma4:12b` on Ollama) → tests live model list → launches a mission → watches the **Workflow X-Ray** animate discovery, approves competitors at HITL, observes parallel per-competitor cards complete, and downloads Markdown/JSON/Print PDF.
3. **Rescuing a Failed Run:** Mission fails on a competitor search timeout → PM opens **Workflow X-Ray** → red pulsing node pinpoints `specialist_research (Competitor X)` → PM clicks **"Retry Stage"** or **"Skip Competitor & Continue"** in one click.
4. **Enriching with Internal Notes & Monitoring:** PM uploads `q4-win-loss-notes.md` to the workspace, enables JS pricing scraping fallback + weekly monitor webhook, and asks follow-up RAG questions combining public reviews and internal win/loss notes.

---

## 5. Data Entities & Contract Extensions

1. **Extended `AgentEvent` Metadata (`agent_events.metadata_json`):**
   - `node_status`: `"started" | "progress" | "completed" | "failed" | "retrying" | "paused"`
   - `competitor_name` *(optional)*, `subtask_id`, `completed_tasks`, `total_tasks`, `duration_ms`, `guardrails_applied`, `concept_tags`, `error_detail`, `recoverable`
2. **`custom_documents` Table (SQLite):**
   - `id`, `workspace_id`, `filename`, `content_type`, `char_count`, `content_excerpt`, `uploaded_at` (full chunks stored in ChromaDB with `workspace_id` + `doc_id` metadata).
3. **`workspace_monitors` Table (SQLite):**
   - `workspace_id`, `interval` (`"off" | "daily" | "weekly"`), `webhook_url`, `llm_provider`, `llm_model`, `last_run_at`, `next_run_at`, `last_status`, `last_diff_headline`.
4. **Mission Recovery Endpoints:**
   - `POST /api/missions/{run_id}/retry` (re-run failed mission with optional header BYOK key & optional `skip_competitors`).
5. **Ephemeral BYOK Request Headers:**
   - `X-LLM-API-Key` & `X-Ollama-Base-URL` passed via FastAPI dependencies into provider validation, mission runner execution context (in-memory only), and RAG chat — explicitly stripped from error logs and database columns.
6. **Scheduled Monitor Auth Consideration:**
   - Because BYOK keys are browser-only, scheduled background monitors either use server-configured provider keys / local Ollama or remain disabled cleanly if no server/Ollama provider is available when unattended.

---

## 6. Explicit Non-Goals (`v0.2.0`)

- **No Multi-Tenant Accounts / OAuth / Billing:** MoatRadar remains a single-workspace / self-hosted workbench without user registration or Stripe billing.
- **No Server-Side Storage of User BYOK Secrets:** End-user API keys stay in browser `localStorage` only; unattended scheduled monitors rely on server env / local Ollama.
- **No Heavy Three.js / WebGL Canvas Lock-In:** Use fixed responsive HTML/SVG + CSS 3D depth/perspective transforms and GPU-friendly animations so every node remains accessible (keyboard/ARIA), crisp on laptops & mobile, and fast to build on Next.js 16 / React 19.
- **No Anti-Bot / CAPTCHA Bypass:** Web search, HTTP fetch, and Playwright pricing scraping respect robots/anti-bot boundaries and SSRF private-network blocks strictly.

---

## 7. Phased Implementation Slices (Executed via TDD After Gate 1 `"GO"`)

1. **Slice 1 — BYOK Headers & Dynamic Settings Backend + UI:** Ephemeral `X-LLM-API-Key` / `X-Ollama-Base-URL` support, model discovery endpoint, browser `localStorage` Settings modal, unit + API tests.
2. **Slice 2 — Rich Structured Agent Telemetry & 1-Click Recovery Backend:** Structured `AgentEventPayload.metadata` (sub-tasks, timing, guardrails, failure localization) + `POST /api/missions/{run_id}/retry` + workflow metadata schema endpoint.
3. **Slice 3 — Full-Screen Interactive 3D-Styled Workflow X-Ray, Concept Badges & Preview Tutor Mode:** Dedicated tab, 3D-perspective interactive DAG + animated beams, parallel competitor sub-task tracker, node prompt/contract/guardrail inspector, 1-click failure recovery buttons, and zero-key Preview Tutor step player.
4. **Slice 4 — Custom Evidence Upload & RAG Integration:** Workspace document upload endpoint (`.md`/`.txt`/`.pdf`), sanitization + ChromaDB ingestion, UI upload & provenance citations.
5. **Slice 5 — Playwright Pricing Scraper Fallback:** SSRF-verified optional headless Chromium collector integrated cleanly with `collect_competitor_evidence` and tested with mocked Playwright harness.
6. **Slice 6 — Scheduled Workspace Monitors & Webhook Alerts:** Monitor CRUD + SSRF-checked webhook notifications + background scheduler loop + UI monitor controls.
7. **Slice 7 — Verification & Docs Sync:** Full backend `ruff` + `pytest`, frontend `tsc` + `eslint` + `next build`, Playwright E2E/smoke check, and updated [docs/architecture.md](./architecture.md) / [docs/roadmap.md](./roadmap.md).
