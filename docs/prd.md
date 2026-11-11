# Product Requirements Document: MoatRadar

**Target Persona:** Product Manager (PM) / Product Marketing / Founders  
**License:** Apache-2.0  

---

## 1. Objective & Problem Statement

Product Managers need continuous, evidence-backed competitive intelligence to make roadmap, pricing, positioning, and sales-enablement decisions. Today, teams either pay $10k–$40k+/year for proprietary enterprise CI suites or spend hours manually reading competitor pricing pages, release notes, Reddit threads, and Hacker News discussions—producing static documents that quickly go stale.

**MoatRadar** is an open-source, self-hosted, stateful multi-agent Competitive Market Intelligence platform. Given a product concept and optional seed competitors, an autonomous **LangGraph** system discovers competitors, pauses for human confirmation (Human-in-the-Loop), fans out parallel research collectors over **zero-key live web & community sources**, audits claims through a **Critic/Reflection loop**, synthesizes PM deliverables, tracks changes via **snapshot diffing**, and powers **citation-grounded RAG Q&A**.

**Core Principle:** Zero mock or demo data. Every run executes live LLM reasoning against live web search, scraped web pages, and public community APIs, with clickable URL provenance.

---

## 2. Core User Journeys

1. **Dynamic Provider & Model Verification (Local Ollama + Cloud)**
   - Users select a provider (`ollama`, `gemini`, `openai`, `anthropic`, `groq`) without hardcoded model defaults.
   - For local **Ollama**, users enter any model tag (e.g., `gemma4:12b`) and verify live availability via `POST /api/providers/ollama/check`.
2. **Launch Mission + Human-in-the-Loop (HITL) Approval**
   - The **Discovery Agent** searches live web data for 3–6 direct and adjacent competitors and pauses via LangGraph `interrupt()` backed by `AsyncSqliteSaver`.
   - The PM edits, adds, or removes competitors in the UI and resumes execution.
3. **Observe Live Multi-Agent Execution & Review Deliverables**
   - Live SSE streaming displays discovery, specialist collectors, Critic audit checks, and synthesis progress.
   - PM inspects the interactive dossier: **Executive Brief**, **Feature Matrix**, **Pricing Matrix**, **SWOT & Battlecards**, **VoC Sentiment**, **Impact-vs-Effort Opportunity Quadrant**, and exports **Markdown**, **JSON**, or **Print/PDF**.
4. **Longitudinal Snapshot Diffing & RAG Follow-Up Q&A**
   - Re-running a workspace diffs the new dossier against the previous snapshot and indexes evidence in ChromaDB for citation-grounded Q&A.

---

## 3. Zero-Key Live Data Sources

- **Web Search**: `ddgs` (DuckDuckGo Search) with automatic unquoted fallback and bounded concurrency.
- **Web Scraping**: `httpx` + `trafilatura` / `BeautifulSoup4` protected by strict SSRF validation.
- **Hacker News**: Public HN Algolia API (`https://hn.algolia.com/api/v1/search`).
- **Reddit**: Public Reddit JSON search with `ddgs` `site:reddit.com` fallback.
- **GitHub**: Public GitHub Repository Search API (`https://api.github.com/search/repositories`).
