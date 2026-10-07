"""FastAPI app: the tutor proxy under /api, and the built frontend everywhere else.

Same-origin serving, so there is no CORS middleware; in development the Vite
dev server proxies /api here.
"""

from typing import Annotated

from fastapi import FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from hearhear.config import load_settings
from hearhear.models import TutorRequest
from hearhear.tutor import replay_fixture

settings = load_settings()
app = FastAPI(title="Hear Hear", docs_url=None, redoc_url=None, openapi_url=None)

# Self only, with two narrow exceptions. Tone.js runs its clock in a Worker
# built from a blob: URL, and the demo-video recorder plays back blob: media.
# abcjs sets `style` attributes while measuring and rendering, so inline style
# *attributes* are allowed; <style> elements and every script stay 'self'.
CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "style-src-attr 'unsafe-inline'",
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


class SecurityHeaders:
    """Add the security headers to every response. Pure ASGI, so streaming
    responses pass through untouched (BaseHTTPMiddleware would wrap them)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).update(SECURITY_HEADERS)
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(SecurityHeaders)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """The error envelope from contracts/tutor-sse.md. Reports where and why,
    never the submitted value."""
    first = exc.errors()[0]
    where = ".".join(str(part) for part in first["loc"][1:]) or "body"
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "invalid_request", "message": f"{where}: {first['msg']}"}},
    )


@app.api_route("/api/health", methods=["GET", "HEAD"])
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


@app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
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
