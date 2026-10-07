"""Turn Claude's streamed JSON reply into message deltas, then a validated reply.

Structured outputs make the reply one JSON object, streamed as text. Its
`message` field comes before `suggestions` in the schema, so the student reads
the tutor's words while the rest is still arriving.
"""

from typing import Any

from pydantic import ValidationError
from pydantic_core import from_json

from hearhear.models import Suggestion, TutorReply

MAX_SUGGESTIONS = 8


class MessageDeltas:
    """Accumulates raw JSON text and reports the new `message` text in each chunk.

    `trailing-strings` makes a partial parse include the unfinished string at
    the end, so the message streams mid-sentence instead of in whole values.
    """

    def __init__(self) -> None:
        self.text = ""
        self._sent = 0

    def feed(self, chunk: str) -> str:
        """Add a chunk of JSON text; return the message text not yet sent."""
        self.text += chunk
        try:
            partial = from_json(self.text, allow_partial="trailing-strings")
        except ValueError:
            return ""  # Not parseable yet (e.g. nothing but whitespace); wait for more.
        message = partial.get("message") if isinstance(partial, dict) else None
        if not isinstance(message, str) or len(message) <= self._sent:
            return ""
        delta = message[self._sent :]
        self._sent = len(message)
        return delta


class InvalidReply(ValueError):
    """The reply is not usable at all: bad JSON, or a bad message or hint level."""


def validate_reply(text: str) -> tuple[TutorReply, int]:
    """Validate the full reply, dropping suggestions that fail on their own.

    Returns the reply and how many suggestions were dropped. One bad suggestion
    never sinks the message; a bad message or hint level does.
    """
    try:
        raw: Any = from_json(text)
    except ValueError as exc:
        raise InvalidReply("reply is not complete JSON") from exc
    if not isinstance(raw, dict):
        raise InvalidReply("reply is not a JSON object")

    candidates = raw.get("suggestions")
    if not isinstance(candidates, list):
        candidates = []
    kept: list[Suggestion] = []
    dropped = 0
    for candidate in candidates:
        try:
            kept.append(Suggestion.model_validate(candidate))
        except ValidationError:
            dropped += 1
    dropped += max(0, len(kept) - MAX_SUGGESTIONS)

    try:
        reply = TutorReply.model_validate({**raw, "suggestions": kept[:MAX_SUGGESTIONS]})
    except ValidationError as exc:
        raise InvalidReply("reply failed validation") from exc
    return reply, dropped
