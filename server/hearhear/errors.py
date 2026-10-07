"""The JSON error envelope from contracts/tutor-sse.md, for failures before a stream starts."""

from starlette.responses import JSONResponse


def error_response(
    status_code: int, code: str, message: str, headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )
