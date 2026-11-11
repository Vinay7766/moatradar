## Summary

<!-- Describe what changed and why. Link the related issue if applicable. -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / simplification
- [ ] Documentation update
- [ ] Build / CI / Docker

## Verification Checklist

- [ ] Backend linter (`cd backend && uv run ruff check app tests eval`) passes
- [ ] Backend test suite (`cd backend && uv run pytest -v`) passes
- [ ] Frontend type-check, lint, and build (`cd frontend && npx tsc --noEmit && npm run lint && npm run build`) pass
- [ ] No API keys, `.env` files, or local database artifacts included
- [ ] Added or updated tests covering the change
