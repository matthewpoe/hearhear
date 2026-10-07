"""Request limits that run before any tutor work: the body cap and the client IP
the rate limit keys on."""

from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from hearhear.errors import error_response
from hearhear.log import log_event


def client_ip(request: Request) -> str:
    """The client IP that Railway's edge wrote, for the rate-limit key.

    Railway's edge replaces any client-sent X-Forwarded-For with the client's
    address (verified 2026-10-07: a request sent with `X-Forwarded-For: 1.2.3.4`
    reached the app as the caller's real IP). Proxies append, so the rightmost
    entry is the one the nearest trusted proxy wrote; the leftmost is whatever
    the client claimed. Uvicorn's `--forwarded-allow-ips '*'` picks the
    leftmost, so this reads the header itself rather than `request.client`.
    Without the header (local development, tests) it falls back to the socket.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    entries = [entry.strip() for entry in forwarded.split(",") if entry.strip()]
    if entries:
        return entries[-1]
    return request.client.host if request.client else "unknown"


def _too_large(max_bytes: int) -> JSONResponse:
    message = f"Request body is over {max_bytes // 1024} KB."
    return error_response(413, "too_large", message)


class BodySizeLimit:
    """Reject /api bodies over `max_bytes` with 413, before anything parses them.

    A declared Content-Length over the cap is refused without reading. Chunked
    bodies have no Content-Length, so the body is read in full (it can't
    exceed the cap) and replayed to the app.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length", "")
        if declared.isdigit() and int(declared) > self.max_bytes:
            log_event("request_rejected", code="too_large", declared_bytes=int(declared))
            await _too_large(self.max_bytes)(scope, receive, send)
            return

        body = bytearray()
        more_body = True
        while more_body:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body += message.get("body", b"")
            if len(body) > self.max_bytes:
                log_event("request_rejected", code="too_large", declared_bytes=None)
                await _too_large(self.max_bytes)(scope, receive, send)
                return
            more_body = message.get("more_body", False)

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if replayed:
                return await receive()  # After the body, only a disconnect is left.
            replayed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)
