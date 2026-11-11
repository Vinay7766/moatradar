# Contributing to MoatRadar

Thank you for helping improve **MoatRadar**. We welcome bug reports, feature proposals, documentation improvements, and pull requests.

## Development Workflow

1. Fork the repository and create a short-lived feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Install backend and frontend dependencies:
   ```bash
   cd backend && uv sync
   cd ../frontend && npm install
   ```
3. Run quality checks before pushing:
   ```bash
   cd backend && uv run ruff check app tests eval && uv run pytest -v
   cd ../frontend && npx tsc --noEmit && npm run lint && npm run build
   ```

## Engineering Standards

- **Zero mock/demo shortcuts in runtime code**: All agent paths must execute real LLM calls and real web/community tools; reserve monkeypatching and deterministic stubs for automated unit/integration tests under `backend/tests/`.
- **Zero hardcoded model defaults**: Support user-supplied model identifiers and dynamic provider discovery rather than hardcoding static model arrays.
- **Security**: Never bypass SSRF URL validation in `backend/app/tools/security.py`, and never commit `.env` files, API keys, or local SQLite/Chroma database files.
- **Commit format**: Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Tests**: Add or update unit/integration tests for every bug fix or behavior change.

## License

By contributing to MoatRadar, you agree that your contributions will be licensed under the [Apache License 2.0](./LICENSE).
