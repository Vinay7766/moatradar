# Changelog

All notable changes to **MoatRadar** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Dynamic model input and live availability checking for Ollama (`POST /api/providers/ollama/check` and inline UI verification).
- Live provider model discovery for Gemini, OpenAI, Anthropic, Groq, and Ollama without hardcoded fallback defaults.
- Apache-2.0 license, contributor guidelines, security policy, issue/PR templates, Dependabot, Dockerfiles, and `docker-compose.yml`.

## [0.1.0] - 2026-11-11

### Added
- Stateful LangGraph pipeline with competitor discovery, HITL approval (`interrupt()`), parallel multi-domain specialist research, and Critic/Reflection verification loop.
- Zero-key live web, pricing page, Hacker News, Reddit, and GitHub collectors with SSRF protection.
- SQLite run/snapshot/citation persistence, snapshot diff engine, Markdown/JSON exporters, and ChromaDB RAG follow-up chat.
- Next.js workbench UI with real-time SSE trace timeline, interactive HITL queue, Battlecards/SWOT, Feature & Pricing matrices, VoC sentiment, and Opportunity 2×2 quadrant.
