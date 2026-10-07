"""FastAPI app: the tutor proxy under /api, and the built frontend everywhere else.

Same-origin serving, so there is no CORS middleware; in development the Vite
dev server proxies /api here.
"""

import uuid
from functools import cache
from typing import Annotated

from anthropic import AsyncAnthropic, Timeout
from fastapi import FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from hearhear.budget import TokenBudget
from hearhear.config import load_settings
from hearhear.errors import error_response
from hearhear.limits import BodySizeLimit, client_ip
from hearhear.live import stream_live
from hearhear.log import log_event
from hearhear.models import MAX_BODY_BYTES, TutorRequest
from hearhear.tutor import replay_fixture

settings = load_settings()
budget = TokenBudget(settings.daily_token_budget)
limiter = Limiter(key_func=client_ip)
app = FastAPI(title="Hear Hear", docs_url=None, redoc_url=None, openapi_url=None)
app.state.limiter = limiter


@cache
def anthropic_client() -> AsyncAnthropic:
    """One shared client. The SDK reads ANTHROPIC_API_KEY itself. One retry,
    and a read timeout well inside Railway's 5-minute idle cutoff."""
    return AsyncAnthropic(max_retries=1, timeout=Timeout(120.0, connect=5.0))


if settings.tutor_mode == "live":
    anthropic_client()  # A client that can't be built fails the deploy, not a question.


# The one <style> element abcjs 6.7.1 inserts into every staff it draws:
# set-paper-size.js builds this rule and svg.js's insertStyles sets it as the
# element's textContent. It must match byte for byte, so an abcjs upgrade that
# changes the rule needs a new hash (the browser reports the expected one in
# its CSP console error).
ABCJS_STYLE_HASH = "'sha256-BCpnf71gZdCsSCHDzyB1RsBbZ0qQdqseK6v+yJsgg30='"

# Self only, with narrow exceptions. Tone.js runs its clock in a Worker built
# from a blob: URL, and the demo-video recorder plays back blob: media. abcjs
# sets `style` attributes while measuring and rendering, so inline style
# *attributes* are allowed, and its one <style> element is allowed by hash.
# Every other <style> element and every script stay 'self'.
CONTENT_SECURITY_POLICY = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        f"style-src 'self' {ABCJS_STYLE_HASH}",
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


# Starlette runs the last-added middleware first: security headers wrap
# everything, including the 413 the body cap returns.
app.add_middleware(BodySizeLimit, max_bytes=MAX_BODY_BYTES)
app.add_middleware(SecurityHeaders)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, exc: RequestValidationError) -> JSONResponse:
    """The error envelope from contracts/tutor-sse.md. Reports where and why,
    never the submitted value."""
    first = exc.errors()[0]
    where = ".".join(str(part) for part in first["loc"][1:]) or "body"
    return error_response(422, "invalid_request", f"{where}: {first['msg']}")


@app.exception_handler(RateLimitExceeded)
async def rate_limited(_request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    log_event("request_rejected", code="rate_limited")
    message = "That's a lot of questions at once. Give the tutor a minute and try again."
    return error_response(429, "rate_limited", message)


def _rate_limit() -> str:
    return settings.rate_limit


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok", "tutor_mode": settings.tutor_mode}


@app.post("/api/tutor", response_model=None)
@limiter.limit(_rate_limit)
async def tutor(
    request: Request,
    body: TutorRequest,
    x_tutor_fixture: Annotated[str | None, Header()] = None,
) -> StreamingResponse | JSONResponse:
    """Order of checks: body cap (413, middleware), validation (422), rate
    limit (429), daily budget (503), then the stream."""
    request_id = uuid.uuid4().hex
    headers = {"Cache-Control": "no-store", "X-Request-Id": request_id}
    if settings.tutor_mode == "fixture":
        log_event("tutor_fixture", request_id=request_id, hint_level=body.hint_level)
        stream = replay_fixture(body, settings.fixtures_dir, x_tutor_fixture)
    elif budget.exhausted():
        log_event("request_rejected", code="over_budget", request_id=request_id)
        message = "The live tutor is out of budget for today; the recorded lessons still work."
        return error_response(503, "over_budget", message, headers)
    else:
        # X-Tutor-Fixture is ignored here: live mode never replays fixtures.
        stream = stream_live(
            body,
            client=anthropic_client(),
            model=settings.tutor_model,
            budget=budget,
            request_id=request_id,
        )
    return StreamingResponse(stream, media_type="text/event-stream", headers=headers)


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
