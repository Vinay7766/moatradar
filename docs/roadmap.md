# MoatRadar Roadmap

## Completed (`v0.1.0`)

- [x] **Multi-Provider LLM Abstraction**: Zero-hardcoded discovery and instantiation for Ollama (`langchain-ollama`), Gemini, OpenAI, Anthropic, and Groq, plus live Ollama model availability verification (`POST /api/providers/ollama/check`).
- [x] **LangGraph Stateful Orchestration**: Discovery -> SQLite-checkpointed HITL `interrupt()` -> parallel specialist collectors -> Critic verification & retry loop (`max_critic_iterations=2`) -> structured synthesis -> snapshot diff & ChromaDB indexing.
- [x] **Zero-Key Live Collectors & Security**: `ddgs`, SSRF-hardened `httpx` + `trafilatura`/`BeautifulSoup4`, HN Algolia, Reddit JSON + fallback, GitHub REST API, and `<untrusted_evidence>` prompt delimiters.
- [x] **PM Workbench Frontend**: Next.js App Router + Tailwind + Recharts UI with live SSE agent trace, HITL competitor editor, 7-tab PM dossier viewer, Opportunity Matrix chart, RAG chat, and Markdown/JSON/Print export.
- [x] **Automated Quality & Evaluation**: 33 backend tests (`pytest`), Ruff lint checks, TypeScript + ESLint + production build, GitHub Actions CI, Docker Compose, and `backend/eval/run_eval.py`.

## Planned

- [ ] **Scheduled Workspace Monitors**: Optional cron/worker re-runs with webhook or Slack digest notifications when competitor pricing or positioning diffs cross a threshold.
- [ ] **Browser-Rendered Pricing Scraper**: Optional headless Playwright collector for heavy JS-rendered SaaS pricing calculators.
- [ ] **Custom Evidence Sources**: User-uploaded win/loss call transcripts or internal battlecards indexed alongside public sources.
- [ ] **Playwright End-to-End Test Suite**: Automated browser regression coverage for the Mission Launcher, HITL approval flow, and Dossier tabs.
