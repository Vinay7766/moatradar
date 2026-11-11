# MoatRadar Roadmap

## Completed (`v0.1.0`)

- [x] **Multi-Provider LLM Abstraction**: Zero-hardcoded discovery and instantiation for Ollama (`langchain-ollama`), Gemini, OpenAI, Anthropic, and Groq, plus live Ollama model availability verification (`POST /api/providers/ollama/check`).
- [x] **LangGraph Stateful Orchestration**: Discovery -> SQLite-checkpointed HITL `interrupt()` -> parallel specialist collectors -> Critic verification & retry loop (`max_critic_iterations=2`) -> structured synthesis -> snapshot diff & ChromaDB indexing.
- [x] **Zero-Key Live Collectors & Security**: `ddgs`, SSRF-hardened `httpx` + `trafilatura`/`BeautifulSoup4`, HN Algolia, Reddit JSON + fallback, GitHub REST API, and `<untrusted_evidence>` prompt delimiters.
- [x] **PM Workbench Frontend**: Next.js App Router + Tailwind + Recharts UI with live SSE agent trace, HITL competitor editor, 7-tab PM dossier viewer, Opportunity Matrix chart, RAG chat, and Markdown/JSON/Print export.
- [x] **Automated Quality & Evaluation**: 33 backend tests (`pytest`), Ruff lint checks, TypeScript + ESLint + production build, GitHub Actions CI, Docker Compose, and `backend/eval/run_eval.py`.

## Completed (`v0.2.0`)

- [x] **Interactive 3D Workflow X-Ray & Zero-Key AI Tutor**: Full-screen responsive CSS 3D-perspective + animated SVG LangGraph DAG (`discovery` -> `hitl_approval` -> `specialist_research` fan-out -> `critic_verifier` <-> `targeted_research` loop -> `synthesizer` -> `memory_indexer`), clickable Prompt/Schema/Guardrail node inspector, 8 clickable Agentic AI concept badges, and step-by-step Preview Tutor walkthrough without requiring API keys.
- [x] **1-Click Fault Pinpointing & Recovery**: Structured node telemetry (`AgentEvent.metadata`), exact failing node/competitor localization, and `POST /api/missions/{run_id}/retry` (retry stage or skip blocked competitor).
- [x] **Browser BYOK Settings**: Client-only `localStorage` API keys and custom Ollama URL sent ephemerally via `X-LLM-API-Key` and `X-Ollama-Base-URL` headers with live redaction across SQLite and SSE streams.
- [x] **Scheduled Workspace Monitors**: Recurring `off` / `daily` / `weekly` workspace schedules (`MonitorScheduler`) with SSRF-validated webhook alerts on significant snapshot diffs.
- [x] **Browser-Rendered Pricing Scraper**: SSRF-gated Playwright headless Chromium fallback (`fetch_pricing_page_playwright`) for JS-rendered SaaS pricing calculators.
- [x] **Custom Evidence Sources**: Workspace-scoped `.md` / `.txt` / `.pdf` uploads (`extract_document_text`) sanitized and indexed in ChromaDB (`custom_upload`) for RAG Q&A and synthesis citations.

## Planned

- [ ] **Playwright End-to-End Test Suite**: Automated browser regression coverage for the Mission Launcher, HITL approval flow, Workflow X-Ray Tutor, and Dossier tabs.
- [ ] **Multi-Tenant Authentication**: Optional OAuth / per-user workspace isolation for shared team cloud deployments.
