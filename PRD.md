# PRD: Competitive Market Intelligence Desk (CMI Desk)

**Course:** CSE476 — Agentic AI  
**Target Persona:** Product Manager (PM)  
**Delivery Timeline:** 2-Day Sprint (Solo)  
**Version:** 1.0  

---

## 1. Objective & Problem Statement

Product Managers need continuous, evidence-backed competitive intelligence to make roadmap, pricing, positioning, and sales-enablement decisions. Today, PMs either pay $10k–$40k+/year for enterprise CI platforms (Klue, Crayon) or spend hours manually reading competitor pricing pages, release notes, Reddit threads, and Hacker News discussions—producing static spreadsheets that quickly go stale.

**CMI Desk** is a stateful, multi-agent Competitive Market Intelligence workbench purpose-built for Product Managers. Given a PM's product concept (or URL/category) and optional seed competitors, an autonomous **LangGraph** multi-agent system discovers competitors, pauses for PM confirmation (Human-in-the-Loop), fans out specialized research agents over **zero-key live web sources**, verifies every claim through a **Critic/Reflection loop**, synthesizes PM-ready deliverables, persists longitudinal snapshots for **change diffing**, and supports **RAG-grounded follow-up Q&A**.

**Core Principle:** **Zero mock or demo data.** Every run executes live LLM reasoning against live web search, web scraping, and public community APIs, with strict URL provenance on every factual claim.

---

## 2. Target User & Core User Journeys

### Primary Persona: Product Manager (PM)
- Needs fast, trustworthy competitive teardowns before writing PRDs, planning quarterly roadmaps, adjusting pricing tiers, or arming GTM/sales teams with battlecards.
- Values verifiable citations over generic LLM summaries, and needs structured matrices rather than walls of prose.

### User Journeys

1. **Journey 1 — Launch an Intelligence Mission (with HITL Gate)**
   - PM enters: Product/Topic name, short product description (or URL), target segment, and optional known competitors.
   - PM selects LLM provider/model configured via `.env` (e.g., Gemini, OpenAI, Anthropic, Groq).
   - **Discovery Agent** runs live web searches to identify 3–6 direct & adjacent competitors and proposes a research plan.
   - Execution pauses at a **Human-in-the-Loop (HITL) Checkpoint**: the PM reviews, adds, removes, or edits the competitor list in the UI and clicks **Approve & Run Deep Dive**.

2. **Journey 2 — Observe Live Multi-Agent Execution**
   - In the Intelligence Desk UI, the PM watches a live **Agent Activity Stream (SSE)** showing active graph nodes, search queries, scraped URLs, Critic verification checks, and retry loops in real time.

3. **Journey 3 — Review PM Deliverables & Export**
   - Upon completion, the PM inspects an interactive tabbed workspace containing:
     - **Executive Brief & Market Trends** (with clickable source citations)
     - **Feature Comparison Matrix** (structured capability grid across all competitors)
     - **Pricing & Packaging Matrix** (tiers, billing model, free/freemium gates, enterprise triggers)
     - **Competitor Battlecards & SWOT** (positioning, strengths, weaknesses, win/loss talking points)
     - **Voice of Customer (VoC) & Sentiment** (real user complaints, praise, and switching triggers from HN/Reddit/web reviews with links)
     - **White-Space & Roadmap Opportunities** (prioritized Impact vs. Effort gaps)
   - PM exports the full dossier as **Markdown**, **JSON**, or **Print/PDF**.

4. **Journey 4 — Longitudinal Snapshot Diffing & RAG Follow-Up Q&A**
   - PM re-runs a saved workspace days/weeks later; the **Diff Engine** compares the new snapshot against the prior snapshot in SQLite and highlights what changed (pricing shifts, new features, sentiment changes).
   - PM uses **Ask the Desk** chat to ask targeted follow-up questions (e.g., *"Which competitor has the biggest complaint around onboarding?"*) answered via hybrid RAG over ChromaDB + SQLite evidence with inline citations.

---

## 3. Agentic Architecture & Patterns (LangGraph)

The backend orchestration uses **LangGraph** (`StateGraph` with SQLite checkpointing for HITL persistence) implementing five core agentic patterns:

1. **Planning & Competitor Discovery (`discovery_node`)**: Expands user input into search queries, discovers direct/adjacent/substitute competitors, and prepares the candidate list.
2. **Human-in-the-Loop (`hitl_approval_interrupt`)**: Native LangGraph `interrupt()` before deep research; state is checkpointed in SQLite and resumed via API when the PM confirms competitors.
3. **Parallel Specialist Fan-Out (`Send` API / parallel branches per competitor & domain)**:
   - `product_analyst`: Capabilities, integrations, target ICP, UX differentiators.
   - `pricing_analyst`: Pricing pages, tiers, usage/seat limits, hidden enterprise costs.
   - `voc_sentiment_analyst`: Real user complaints & praise via Hacker News Algolia API, Reddit public JSON search, and web review queries.
   - `momentum_analyst`: Recent product launches, news, GitHub/community traction.
4. **Critic / Reflection Verification Loop (`critic_verifier_node`)**:
   - Audits extracted claims against retrieved source snippets/URLs.
   - Flags ungrounded assertions, missing pricing data, or thin VoC evidence.
   - Conditionally routes back to `targeted_research_node` (capped at `max_iterations = 2`) or proceeds to synthesis.
5. **Synthesis & Memory Indexing (`synthesizer_node` + `memory_indexer_node`)**:
   - Produces strict Pydantic-validated structured JSON deliverables + Markdown brief.
   - Computes snapshot diff against previous run (if any) and indexes chunks into ChromaDB for follow-up RAG Q&A.

---

## 4. Zero-Key Live Data Sources

All data collection runs without paid search/scraping API keys:
- **Web Search:** `ddgs` (DuckDuckGo Search Python package) for general web, pricing pages, G2/Capterra/ProductHunt snippets, and news queries.
- **Web Page Extraction:** `httpx` (async, with timeouts, retries, User-Agent, SSRF/private-IP guardrails) + `trafilatura` / `BeautifulSoup4` for clean main-text extraction from competitor homepages and pricing pages.
- **Hacker News Signals:** Official public **HN Algolia Search API** (`https://hn.algolia.com/api/v1/search`) — zero key, structured JSON with timestamps, points, and comment threads.
- **Reddit Community Signals:** Public Reddit JSON search endpoints (`https://www.reddit.com/search.json`) with rate-limit backoff and fallback to `ddgs` `site:reddit.com` queries if throttled.
- **GitHub Ecosystem Signals:** Public GitHub REST API (`https://api.github.com/search/repositories`) for open-source competitors/alternatives (stars, forks, recent commit activity).

---

## 5. Data Entities (SQLite + ChromaDB)

| Entity | Storage | Key Fields |
|---|---|---|
| `Workspace` | SQLite | `id`, `name`, `product_name`, `product_description`, `target_segment`, `created_at` |
| `MissionRun` | SQLite | `id`, `workspace_id`, `thread_id`, `status` (`discovering` \| `awaiting_approval` \| `researching` \| `verifying` \| `synthesizing` \| `completed` \| `failed`), `llm_provider`, `llm_model`, `approved_competitors_json`, `critic_score`, `iteration_count`, `started_at`, `completed_at` |
| `DossierSnapshot` | SQLite | `id`, `run_id`, `workspace_id`, `executive_brief_md`, `feature_matrix_json`, `pricing_matrix_json`, `battlecards_json`, `voc_insights_json`, `opportunities_json`, `diff_summary_json`, `created_at` |
| `SourceCitation` | SQLite | `id`, `run_id`, `competitor_name`, `source_type` (`web` \| `pricing_page` \| `hn` \| `reddit` \| `github`), `title`, `url`, `snippet`, `fetched_at` |
| `AgentEvent` | SQLite | `id`, `run_id`, `node_name`, `event_type`, `message`, `metadata_json`, `timestamp` |
| `ChatMessage` | SQLite | `id`, `workspace_id`, `role` (`user` \| `assistant`), `content`, `citations_json`, `created_at` |
| `DossierChunk` | ChromaDB | `id`, `workspace_id`, `run_id`, `competitor_name`, `section`, `source_url`, `embedding`, `text` |

---

## 6. Tech Stack

- **Backend:** Python 3.13 (`uv`), **FastAPI**, **LangGraph** (`langgraph`, `langgraph-checkpoint-sqlite`), **LangChain Core + Provider Integrations** (Gemini, OpenAI, Anthropic, Groq configurable via `.env` and UI selector), **Pydantic v2**, **SQLite** (`aiosqlite` / `sqlite3`), **ChromaDB**, **ddgs**, **httpx**, **trafilatura**, **beautifulsoup4**.
- **Frontend:** **Next.js (App Router, TypeScript)**, **Tailwind CSS**, **Lucide Icons**, **Recharts** (for Opportunity Matrix / Sentiment & Momentum charts), native **EventSource / SSE** client for live agent streaming.
- **Testing & Evaluation:**
  - `pytest` + `pytest-asyncio` (unit tests for tools, schemas, diffing, SSRF guardrails, critic routing, and FastAPI endpoint integration tests).
  - Custom **Agentic Evaluation Harness** (`eval/run_eval.py`) measuring Citation Grounding Rate, Deliverable Schema Completeness, and Critic Verification pass rate on real runs.
  - Frontend TypeScript typecheck + production build + component/E2E verification.

---

## 7. Non-Goals (Explicitly Out of Scope for 2-Day Sprint)

1. **No fake/mock/demo mode:** No synthetic fallback datasets or hardcoded canned competitor reports.
2. **No multi-tenant auth / billing / SaaS deployment:** Single-workspace local/self-hosted PM workbench (OWASP input validation, CORS, and SSRF protections still strictly enforced).
3. **No authenticated scraping / paywall bypassing:** Only publicly accessible web pages and public APIs; never bypass login walls, CAPTCHAs, or anti-bot gates.
4. **No scheduled cron background daemon:** On-demand mission execution and manual re-run diffing only (scheduled monitoring can be a v2 extension).
5. **No native CRM integrations (Salesforce/Gong/Slack):** Exports are Markdown, JSON, and Print/PDF.

---

## 8. Success Criteria

- [ ] A PM can submit a product/market topic, review & edit discovered competitors at the HITL checkpoint, and watch live SSE agent progress until a full dossier is produced.
- [ ] All 6 PM deliverable views render cleanly from structured, validated outputs with clickable external source URLs: Executive Brief, Feature Matrix, Pricing Matrix, SWOT/Battlecards, VoC Sentiment, and Opportunity Prioritization.
- [ ] Critic/Verifier loop demonstrably inspects claims against sources and triggers targeted re-research when gaps or uncited claims are detected.
- [ ] Re-running a workspace persists a new snapshot in SQLite, computes a visible Change Diff, and indexes evidence in ChromaDB for citation-backed RAG Q&A.
- [ ] All unit/integration tests pass, frontend builds cleanly with zero TypeScript errors, `ARCHITECTURE.md` includes system diagrams, and the evaluation harness runs and reports grounding/completeness metrics.
