# Clone to running app: `make install && make dev`.
.PHONY: install dev test lint format typecheck contracts check smoke build eval-live capture-lessons

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

# A live eval against a local server. Reads ANTHROPIC_API_KEY and TUTOR_ACCESS_CODE
# from your shell, never a file; smoke-tests 3 requests, then asks (or CONFIRM=1).
eval-live:
	@CONFIRM=$(CONFIRM) ./scripts/eval-live.sh

# Record the demo's lessons (content/lessons/plan.json) from the live tutor. Reads
# ANTHROPIC_API_KEY and TUTOR_ACCESS_CODE from your shell, never a file; set
# TUTOR_URL to record from the deployed site instead. Asks first (or CONFIRM=1).
capture-lessons:
	@CONFIRM=$(CONFIRM) ./scripts/capture-lessons.sh

smoke: build
	npx playwright test

check: lint typecheck test
	uv run python scripts/export_contracts.py --check
	$(MAKE) build
	npm audit --audit-level=high
	uv run pip-audit --skip-editable
