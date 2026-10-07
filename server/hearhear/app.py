"""FastAPI app: the tutor proxy under /api, and the built frontend everywhere else.

Same-origin serving, so there is no CORS middleware; in development the Vite
dev server proxies /api here.
"""

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import FastAPI, Header, Request, Response
from fastapi.responses import FileResponse, StreamingResponse

from hearhear.config import load_settings
from hearhear.models import TutorRequest
from hearhear.tutor import replay_fixture

settings = load_settings()
app = FastAPI(title="Hear Hear", docs_url=None, redoc_url=None, openapi_url=None)

# Self only. Tone.js runs its clock in a Worker built from a blob: URL, and
# the demo-video recorder plays back blob: media.
CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)
SECURITY_HEADERS = {
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), midi=(self)",
}


@app.middleware("http")
async def security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers.update(SECURITY_HEADERS)
    return response


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "tutor_mode": settings.tutor_mode}


@app.post("/api/tutor")
async def tutor(
    body: TutorRequest,
    x_tutor_fixture: Annotated[str | None, Header()] = None,
) -> StreamingResponse:
    # Phase 0: fixture mode only. Stream E adds live mode, limits, and budget.
    return StreamingResponse(
        replay_fixture(body, settings.fixtures_dir, x_tutor_fixture),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str) -> Response:
    """Serve a built file if it exists, otherwise index.html (SPA fallback)."""
    dist = settings.dist_dir.resolve()
    if path.startswith("api/"):
        return Response(status_code=404)
    candidate = (dist / path).resolve()
    if path and candidate.is_file() and candidate.is_relative_to(dist):
        immutable = path.startswith("assets/")
        headers = {"Cache-Control": "public, max-age=31536000, immutable"} if immutable else {}
        return FileResponse(candidate, headers=headers)
    index = dist / "index.html"
    if not index.is_file():
        return Response("Frontend not built. Run `npm run build`.", status_code=503)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
