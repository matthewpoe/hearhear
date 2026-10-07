# Stage 1: build the frontend.
FROM node:26-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.js svelte.config.js ./
COPY public ./public
COPY src ./src
COPY contracts ./contracts
COPY content ./content
COPY evals/results ./evals/results
RUN npm run build

# Stage 2: the API, serving the built frontend.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY server ./server
COPY contracts ./contracts
RUN uv sync --frozen --no-dev
COPY --from=web /app/dist ./dist
RUN useradd --create-home app
USER app
# One worker so the in-memory rate limit, access lockout, and token budget are
# global. The limits key on X-Forwarded-For, which hearhear/limits.py reads
# itself (rightmost entry). The proxy-header flags affect only uvicorn's access
# log and request.client, and the limits use request.client only when that
# header is absent.
CMD ["sh", "-c", "exec .venv/bin/uvicorn hearhear.app:app --app-dir server --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips '*'"]
