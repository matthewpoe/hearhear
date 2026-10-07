"""Live mode: stream Claude's structured reply as SSE (protocol: contracts/tutor-sse.md).

Claude Opus 5.5 rejects forced tool use, so the reply is constrained with
structured outputs (`output_config.format`) instead. The schema comes from the
same Pydantic model as `contracts/tutor-reply.schema.json`, through the SDK's
`transform_schema`, which moves the bounds the API doesn't enforce (lengths,
ranges, patterns) into descriptions. Pydantic enforces them on the full reply.
"""

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

import anthropic
from anthropic import AsyncAnthropic
from anthropic.types import MessageParam, OutputConfigParam

from hearhear.budget import TokenBudget
from hearhear.log import log_event
from hearhear.models import TutorReply, TutorRequest
from hearhear.prompt import SYSTEM_PROMPT, user_message
from hearhear.reply_stream import InvalidReply, MessageDeltas, validate_reply
from hearhear.tutor import sse

# Adaptive thinking counts against max_tokens. A full reply (4,000-character
# message, eight suggestions) is about 2,500 tokens; the rest is thinking room.
MAX_TOKENS = 8000
OUTPUT_CONFIG: OutputConfigParam = {
    "effort": "medium",
    "format": {"type": "json_schema", "schema": anthropic.transform_schema(TutorReply)},
}

UPSTREAM_MESSAGE = "The live tutor couldn't be reached. Try again, or use the recorded lessons."
INVALID_MESSAGE = "The tutor's reply came back garbled. Try asking again."


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens


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
    disconnects, from what the API reported before it stopped.
    """
    usage = Usage()
    outcome = "disconnected"  # Replaced on every path that reaches the end.
    dropped = 0
    started = time.monotonic()
    messages: list[MessageParam] = [{"role": "user", "content": user_message(request)}]
    try:
        deltas = MessageDeltas()
        stop_reason: str | None = None
        upstream_failure: str | None = None
        try:
            async with client.messages.stream(
                model=model,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=messages,
                output_config=OUTPUT_CONFIG,
            ) as stream:
                async for event in stream:
                    if event.type == "message_start":
                        reported = event.message.usage
                        usage.input_tokens = (
                            reported.input_tokens
                            + (reported.cache_creation_input_tokens or 0)
                            + (reported.cache_read_input_tokens or 0)
                        )
                        usage.output_tokens = reported.output_tokens
                    elif event.type == "message_delta":
                        usage.output_tokens = event.usage.output_tokens
                        stop_reason = event.delta.stop_reason
                    elif event.type == "content_block_delta" and event.delta.type == "text_delta":
                        delta = deltas.feed(event.delta.text)
                        if delta:
                            yield sse("message", {"delta": delta})
        except anthropic.APIStatusError as exc:
            upstream_failure = f"upstream_{exc.status_code}"
        except anthropic.APIConnectionError as exc:
            upstream_failure = f"upstream_{type(exc).__name__}"

        if upstream_failure:
            outcome = upstream_failure
            yield sse("error", {"code": "upstream", "message": UPSTREAM_MESSAGE})
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
                yield sse(
                    "suggestions",
                    {
                        "hint_level": reply.hint_level,
                        "suggestions": [s.model_dump() for s in reply.suggestions],
                        "snapshot_version": request.snapshot.version,
                        "dropped": dropped,
                    },
                )
        yield sse("done", {})
    finally:
        budget.spend(usage.total)
        log_event(
            "tutor_live",
            request_id=request_id,
            model=model,
            hint_level=request.hint_level,
            outcome=outcome,
            dropped=dropped,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            budget_spent=budget.spent,
            duration_ms=round((time.monotonic() - started) * 1000),
        )
