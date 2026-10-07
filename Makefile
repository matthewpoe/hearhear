# Clone to running app: `make install && make dev`.
.PHONY: install dev test lint format typecheck contracts check smoke build

install:
	npm ci
	uv sync
	uv run pre-commit install

dev:
	@echo "API on :8000, app on :5173"
	@uv run uvicorn hearhear.app:app --app-dir server --reload --port 8000 $$([ -f .env ] && echo --env-file .env) & api=$$!; \
	trap 'kill $$api' EXIT INT TERM; npm run dev

test:
	npm test
	uv run pytest -q
	npm run validate-content

lint:
	npm run lint
	uv run ruff check .
	uv run ruff format --check .

format:
	npm run format
	uv run ruff format .
	uv run ruff check --fix .

typecheck:
	uv run mypy

# Regenerate the tutor JSON Schemas from the Pydantic models (the single source).
contracts:
	uv run python scripts/export_contracts.py

build:
	npm run build

smoke: build
	npx playwright test

check: lint typecheck test
	uv run python scripts/export_contracts.py --check
	$(MAKE) build
	npm audit --audit-level=high
	uv run pip-audit --skip-editable
