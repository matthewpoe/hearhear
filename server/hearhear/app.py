"""FastAPI app: the tutor proxy under /api, and the built frontend everywhere else.

Same-origin serving, so there is no CORS middleware; in development the Vite
dev server proxies /api here.
"""

import asyncio
import math
import os
import time
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

from hearhear.access import AccessLockout, code_matches, normalize
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
lockout = AccessLockout()
# Live streams in flight. The budget is charged when a stream ends, so this
# is what stops concurrent requests overshooting it, and the only bound on
# how many long-held SSE connections there are.
streams = asyncio.Semaphore(settings.max_concurrent)
limiter = Limiter(key_func=client_ip)
app = FastAPI(title="Hear Hear", docs_url=None, redoc_url=None, openapi_url=None)
app.state.limiter = limiter


def _api_key() -> str:
    """ANTHROPIC_API_KEY, required in live mode. Never logged or echoed.

    AsyncAnthropic() builds fine without a key and fails only on the first
    request, so live mode checks for it here instead: a deploy with no key
    fails at startup, not on a student's first question.
    """
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise RuntimeError("TUTOR_MODE=live needs ANTHROPIC_API_KEY, which is unset or empty.")
    return key


@cache
def anthropic_client() -> AsyncAnthropic:
    """One shared client, given the key explicitly so it never falls back to
    another credential source. One retry, and a read timeout well inside
    Railway's 5-minute idle cutoff."""
    return AsyncAnthropic(api_key=_api_key(), max_retries=1, timeout=Timeout(120.0, connect=5.0))


if settings.tutor_mode == "live":
    anthropic_client()  # Fails at import, before uvicorn serves /api/health.


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


def _retry_after_seconds(request: Request) -> int:
    """Whole seconds until the limit that was hit resets, at least 1.

    slowapi records the limit it tripped on `request.state.view_rate_limit`
    as (limit, storage keys), and the storage reports when that window resets.
    """
    item, keys = request.state.view_rate_limit
    reset_at, _remaining = limiter.limiter.get_window_stats(item, *keys)
    return max(1, math.ceil(reset_at - time.time()))


@app.exception_handler(RateLimitExceeded)
async def rate_limited(request: Request, _exc: RateLimitExceeded) -> JSONResponse:
    retry_after = _retry_after_seconds(request)
    log_event("request_rejected", code="rate_limited", retry_after=retry_after)
    if retry_after <= 60:
        message = "That's a lot of questions at once. Give the tutor a minute and try again."
    else:
        message = "That's the tutor's limit for now. The recorded lessons still work."
    return error_response(429, "rate_limited", message, {"Retry-After": str(retry_after)})


class ReleasingStreamingResponse(StreamingResponse):
    """A stream that releases its slot in `streams` once the response is over,
    however it ends: finished, failed, or the client gone. Released here, not
    in the body generator, because a generator that never started (the client
    left before the first byte) never runs its `finally`."""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            streams.release()


def _rate_limit() -> str:
    return settings.rate_limit


@app.api_route("/api/health", methods=["GET", "HEAD"])
def health() -> dict[str, str]:
    return {"status": "ok", "tutor_mode": settings.tutor_mode}


ACCESS_MISSING_MESSAGE = (
    "The live tutor is for invited listeners. Enter the access code to ask a question; "
    "the recorded lessons are open to everyone."
)
ACCESS_WRONG_MESSAGE = (
    "That access code didn't match. Check it and try again; the recorded lessons still work."
)
ACCESS_LOCKED_MESSAGE = (
    "Too many tries with the wrong access code. Wait a few minutes and try again; "
    "the recorded lessons still work."
)

BUSY_MESSAGE = "The tutor is helping someone else right now. Try again in a moment."
BUSY_RETRY_AFTER = 5


def _refuse_without_access(
    request: Request, given: str | None, headers: dict[str, str]
) -> JSONResponse | None:
    """The live-mode passphrase gate: a 429 while this IP is locked out, a 401
    for a missing or wrong code, or None to let the request through.

    A locked-out IP is refused even with the right code, so a guess made
    during the lockout learns nothing. Only wrong codes count toward it; a
    request with no code (or one with no letters or digits) is not a guess.
    Logs say which check refused, never what was sent.
    """
    ip = client_ip(request)
    request_id = headers["X-Request-Id"]
    retry_after = lockout.retry_after(ip)
    if retry_after is not None:
        log_event("request_rejected", code="access_locked", request_id=request_id)
        return error_response(
            429,
            "access_locked",
            ACCESS_LOCKED_MESSAGE,
            {**headers, "Retry-After": str(retry_after)},
        )
    if code_matches(given, settings.access_code):
        return None
    if given is None or not normalize(given):
        log_event(
            "request_rejected", code="access_required", reason="missing", request_id=request_id
        )
        return error_response(401, "access_required", ACCESS_MISSING_MESSAGE, headers)
    lockout.record_wrong(ip)
    log_event("request_rejected", code="access_required", reason="wrong", request_id=request_id)
    return error_response(401, "access_required", ACCESS_WRONG_MESSAGE, headers)


@app.post("/api/tutor", response_model=None)
@limiter.limit(_rate_limit)
async def tutor(
    request: Request,
    body: TutorRequest,
    x_tutor_fixture: Annotated[str | None, Header()] = None,
    x_tutor_access: Annotated[str | None, Header()] = None,
) -> StreamingResponse | JSONResponse:
    """Order of checks: body cap (413, middleware), validation (422), rate
    limit (429), then in live mode the access gate (429 locked, 401), the
    daily budget (503) and the in-flight cap (503), then the stream. Fixture
    mode has none of the live checks."""
    request_id = uuid.uuid4().hex
    headers = {"Cache-Control": "no-store", "X-Request-Id": request_id}
    if settings.tutor_mode == "fixture":
        log_event("tutor_fixture", request_id=request_id, hint_level=body.hint_level)
        return StreamingResponse(
            replay_fixture(body, settings.fixtures_dir, request_id, x_tutor_fixture),
            media_type="text/event-stream",
            headers=headers,
        )

    refused = _refuse_without_access(request, x_tutor_access, headers)
    if refused is not None:
        return refused
    if budget.exhausted():
        log_event("request_rejected", code="over_budget", request_id=request_id)
        message = "The live tutor is out of budget for today; the recorded lessons still work."
        return error_response(503, "over_budget", message, headers)
    # X-Tutor-Fixture is ignored here: live mode never replays fixtures. The
    # generator calls Claude only once the response starts iterating it.
    stream = stream_live(
        body,
        client=anthropic_client(),
        model=settings.tutor_model,
        budget=budget,
        request_id=request_id,
    )
    if streams.locked():
        log_event("request_rejected", code="busy", request_id=request_id)
        return error_response(
            503, "busy", BUSY_MESSAGE, {**headers, "Retry-After": str(BUSY_RETRY_AFTER)}
        )
    # Never waits: the slot is free, and nothing else runs between the check
    # and the acquire. From here the response owns the slot.
    await streams.acquire()
    return ReleasingStreamingResponse(stream, media_type="text/event-stream", headers=headers)


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
