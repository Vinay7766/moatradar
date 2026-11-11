.PHONY: install lint test build dev docker-up docker-down eval

install:
	cd backend && uv sync
	cd frontend && npm install

lint:
	cd backend && uv run ruff check app tests eval
	cd frontend && npx tsc --noEmit && npm run lint

test:
	cd backend && uv run pytest -v

build:
	cd frontend && npm run build

dev:
	powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1

docker-up:
	docker compose up --build

docker-down:
	docker compose down

eval:
	cd backend && uv run python eval/run_eval.py --mode audit-db
