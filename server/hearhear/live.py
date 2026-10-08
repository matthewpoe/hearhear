"""Live mode: stream Claude's structured reply as SSE (protocol: contracts/tutor-sse.md).

Claude Opus 5.5 rejects forced tool use, so the reply is constrained with
structured outputs (`output_config.format`) instead. The schema comes from the
same Pydantic model as `contracts/tutor-reply.schema.json`, through the SDK's
`transform_schema`, which moves the bounds the API doesn't enforce (lengths,
ranges, patterns) into descriptions. Pydantic enforces them on the full reply.

Requests opt into the server-side refusal fallback (`fallbacks: "default"`),
so a policy decline is retried on Anthropic's recommended fallback model inside
the same stream. The `suggestions` event reports the model that served the
reply as `served_by`, and `fallback: true` when a fallback model wrote any of
it, so the eval harness can exclude those replies.
"""

import logging
import time
from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass
from typing import Any, Final

import anthropic
from anthropic import AsyncAnthropic
from anthropic.types.beta import BetaMessageParam, BetaOutputConfigParam
from anthropic.types.beta.beta_iterations_usage import BetaIterationsUsageItem

from hearhear.budget import TokenBudget
from hearhear.log import log_event
from hearhear.models import TutorReply, TutorRequest
from hearhear.prompt import SYSTEM_PROMPT, user_message
from hearhear.reply_stream import InvalidReply, MessageDeltas, validate_reply
from hearhear.tutor import Clamp, sse, suggestions_data

# Adaptive thinking counts against max_tokens. A full reply (4,000-character
# message, eight suggestions) is about 2,500 tokens; the rest is thinking room.
MAX_TOKENS = 8000
OUTPUT_CONFIG: BetaOutputConfigParam = {
    "effort": "medium",
    "format": {"type": "json_schema", "schema": anthropic.transform_schema(TutorReply)},
}
# The scalar `"default"` form of `fallbacks` routes by refusal category, so no
# fallback model is pinned here. It requires exactly this beta header (the
# array form uses `server-side-fallback-2026-06-01`; mixing them is a 400).
FALLBACKS: Final = "default"
FALLBACK_BETA: Final = "server-side-fallback-2026-07-01"

UPSTREAM_MESSAGE = "The live tutor couldn't be reached. Try again, or use the recorded lessons."
INVALID_MESSAGE = "The tutor's reply came back garbled. Try asking again."
UNANSWERABLE_MESSAGE = "The tutor couldn't answer that one. Try asking another way."
# Stops where the reply is unfinished because the model declined or ran out of
# room, not because it was malformed. `refusal` arrives only after the
# refusal fallback has also declined.
UNANSWERABLE_STOPS: Final = frozenset({"refusal", "max_tokens", "model_context_window_exceeded"})


@dataclass
class Usage:
    """Tokens to charge for one turn, from what the API reported so far."""

    input_tokens: int = 0
    output_tokens: int = 0
    # With a fallback, top-level usage covers only the attempt that served the
    # reply; `usage.iterations` on `message_delta` covers every attempt.
    all_attempts: int | None = None
    # Set by `message_start`, once the API has accepted (and bills) the turn.
    started: bool = False
    # Output tokens arrive only on the final `message_delta`. Thinking tokens
    # are invisible, so the text seen so far says nothing about the output.
    final: bool = False
    # Attempts the stream announced: the requested model, plus a fallback.
    attempts: int = 1

    @property
    def total(self) -> int:
        if self.started and not self.final:
            # Cut off before the final delta (a client disconnect, a transport
            # error mid-body): charge the most each attempt could have cost.
            return self.attempts * (self.input_tokens + MAX_TOKENS)
        if self.all_attempts is not None:
            return self.all_attempts
        return self.input_tokens + self.output_tokens


def _input_total(uncached: int | None, cache_write: int | None, cache_read: int | None) -> int:
    """Cache writes and reads count as input."""
    return (uncached or 0) + (cache_write or 0) + (cache_read or 0)


def _attempts_total(iterations: Iterable[BetaIterationsUsageItem]) -> int:
    return sum(
        _input_total(i.input_tokens, i.cache_creation_input_tokens, i.cache_read_input_tokens)
        + i.output_tokens
        for i in iterations
    )


def _api_error(exc: anthropic.APIStatusError) -> dict[str, str]:
    """The API's error type and message from a refused request, capped."""
    body: Any = exc.body if isinstance(exc.body, dict) else {}
    error: Any = body.get("error")
    if not isinstance(error, dict):
        error = {}
    return {
        "type": str(error.get("type", "unknown"))[:80],
        "message": str(error.get("message", ""))[:300],
    }


async def stream_live(
    request: TutorRequest,
    *,
    client: AsyncAnthropic,
    model: str,
    budget: TokenBudget,
    request_id: str,
) -> AsyncIterator[str]:
    """Yield SSE events for one tutor turn: message deltas, then exactly one
    `suggestions` or `error`, then `done`.

    Usage is charged to the budget even when the stream fails or the client
    disconnects: what the API reported, or the most the turn could have cost
    if it stopped before reporting output (`Usage.total`).
    """
    usage = Usage()
    outcome = "disconnected"  # Replaced on every path that reaches the end.
    dropped = 0
    clamp = Clamp()
    served_by: str | None = None
    fallback = False
    started = time.monotonic()
    messages: list[BetaMessageParam] = [{"role": "user", "content": user_message(request)}]
    try:
        deltas = MessageDeltas()
        stop_reason: str | None = None
        upstream_failure: str | None = None
        try:
            async with client.beta.messages.stream(
                model=model,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=messages,
                output_config=OUTPUT_CONFIG,
                fallbacks=FALLBACKS,
                betas=[FALLBACK_BETA],
            ) as stream:
                async for event in stream:
                    if event.type == "message_start":
                        # Names the fallback model when the decline came before
                        # any output, or when the conversation is sticky-routed.
                        served_by = event.message.model
                        reported = event.message.usage
                        usage.input_tokens = _input_total(
                            reported.input_tokens,
                            reported.cache_creation_input_tokens,
                            reported.cache_read_input_tokens,
                        )
                        usage.output_tokens = reported.output_tokens
                        usage.started = True
                    elif event.type == "content_block_start":
                        if event.content_block.type == "fallback":
                            # A mid-stream decline: the text so far stays, and
                            # the fallback model continues from it.
                            served_by = event.content_block.to.model
                            fallback = True
                            usage.attempts = 2
                    elif event.type == "message_delta":
                        reported_delta = event.usage
                        usage.final = True
                        usage.output_tokens = reported_delta.output_tokens
                        if reported_delta.input_tokens is not None:
                            usage.input_tokens = _input_total(
                                reported_delta.input_tokens,
                                reported_delta.cache_creation_input_tokens,
                                reported_delta.cache_read_input_tokens,
                            )
                        if reported_delta.iterations:
                            usage.all_attempts = _attempts_total(reported_delta.iterations)
                            for iteration in reported_delta.iterations:
                                # The documented served-by signal; it also
                                # covers sticky turns, which carry no block.
                                if iteration.type == "fallback_message":
                                    served_by = iteration.model
                                    fallback = True
                        stop_reason = event.delta.stop_reason
                    elif event.type == "content_block_delta" and event.delta.type == "text_delta":
                        delta = deltas.feed(event.delta.text)
                        if delta:
                            yield sse("message", {"delta": delta})
        # Most specific first. The SDK wraps HTTP failures in these two, but
        # not errors raised while the stream is read: transport errors mid-body
        # (httpx2.ReadError, RemoteProtocolError), unexpected event order or
        # shape, or a client with no credentials (a TypeError at request time).
        # Any of those must still end the stream with `error` and `done`.
        except anthropic.APIStatusError as exc:
            upstream_failure = f"upstream_{exc.status_code}"
            # The API's own error type and message say which parameter or
            # account limit refused the request. They describe the request's
            # shape, never the student's text, so they are safe to log.
            log_event(
                "tutor_upstream_error",
                level=logging.ERROR,
                request_id=request_id,
                status=exc.status_code,
                error=_api_error(exc),
            )
        except anthropic.APIConnectionError as exc:
            upstream_failure = f"upstream_{type(exc).__name__}"
        except Exception as exc:
            upstream_failure = f"internal_{type(exc).__name__}"
            # The type name only: str(exc) can carry response text.
            log_event(
                "tutor_stream_failed",
                level=logging.ERROR,
                request_id=request_id,
                error=type(exc).__name__,
            )

        if upstream_failure:
            outcome = upstream_failure
            yield sse("error", {"code": "upstream", "message": UPSTREAM_MESSAGE})
        elif stop_reason in UNANSWERABLE_STOPS:
            outcome = f"stop_{stop_reason}"
            yield sse("error", {"code": "unanswerable", "message": UNANSWERABLE_MESSAGE})
        elif stop_reason != "end_turn":
            outcome = f"stop_{stop_reason}"
            yield sse("error", {"code": "invalid_output", "message": INVALID_MESSAGE})
        else:
            try:
                reply, dropped = validate_reply(deltas.text)
            except InvalidReply as exc:
                outcome = "invalid_output"
                log_event("tutor_invalid_reply", request_id=request_id, reason=str(exc))
                yield sse("error", {"code": "invalid_output", "message": INVALID_MESSAGE})
            else:
                outcome = "ok"
                data, clamp = suggestions_data(
                    request,
                    suggestions=[s.model_dump() for s in reply.suggestions],
                    dropped=dropped,
                    # The SDK refuses a stream without message_start, so this is
                    # set; "unknown" is never mistaken for TUTOR_MODEL if not.
                    served_by=served_by or "unknown",
                    fallback=fallback,
                )
                yield sse("suggestions", data)
        yield sse("done", {})
    finally:
        budget.spend(usage.total)
        log_event(
            "tutor_live",
            request_id=request_id,
            model=model,
            served_by=served_by,
            fallback=fallback,
            mode=request.mode,
            key_hidden=request.snapshot.key_hidden,
            outcome=outcome,
            dropped=dropped,
            **clamp.log_fields(),
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            charged_tokens=usage.total,
            budget_spent=budget.spent,
            duration_ms=round((time.monotonic() - started) * 1000),
        )
