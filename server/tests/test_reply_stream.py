import json
from pathlib import Path
from typing import Any

import pytest

from hearhear.reply_stream import InvalidReply, MessageDeltas, validate_reply

FIXTURES = Path(__file__).resolve().parents[2] / "contracts" / "fixtures" / "tutor"


def reply_from_fixture(name: str) -> dict[str, Any]:
    """Rebuild the JSON reply Claude would have streamed for a shape fixture."""
    fixture = json.loads((FIXTURES / f"{name}.json").read_text())
    message = "".join(e["data"]["delta"] for e in fixture["events"] if e["event"] == "message")
    final = next(e["data"] for e in fixture["events"] if e["event"] == "suggestions")
    return {
        "hint_level": final["hint_level"],
        "message": message,
        "suggestions": final["suggestions"],
    }


def chunks(text: str, size: int) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]


def stream_message(text: str, size: int) -> tuple[str, list[str]]:
    deltas = MessageDeltas()
    sent = [deltas.feed(chunk) for chunk in chunks(text, size)]
    return "".join(sent), [d for d in sent if d]


@pytest.mark.parametrize("name", ["nudge", "comparison", "answer"])
@pytest.mark.parametrize("size", [1, 3, 7, 64])
def test_deltas_rebuild_the_fixture_message_at_any_chunking(name: str, size: int) -> None:
    reply = reply_from_fixture(name)
    streamed, _ = stream_message(json.dumps(reply), size)
    assert streamed == reply["message"]


def test_message_streams_before_the_reply_is_complete() -> None:
    reply = reply_from_fixture("answer")
    text = json.dumps(reply)
    _, sent = stream_message(text[: text.index('"suggestions"')], 5)
    assert len(sent) > 10, "the message arrives in many pieces, not one at the end"


@pytest.mark.parametrize(
    "message",
    ['Quote: "hold the 5"', "Line one\nline two", "Café, naïve, ♭7 and °", "back\\slash"],
    ids=["quotes", "newline", "unicode", "backslash"],
)
@pytest.mark.parametrize("ensure_ascii", [True, False])
def test_escapes_split_across_chunks_are_never_sent_half_decoded(
    message: str, ensure_ascii: bool
) -> None:
    text = json.dumps(
        {"hint_level": "nudge", "message": message, "suggestions": []}, ensure_ascii=ensure_ascii
    )
    streamed, _ = stream_message(text, 1)
    assert streamed == message


def test_nothing_is_sent_until_the_message_starts() -> None:
    deltas = MessageDeltas()
    assert deltas.feed("") == ""
    assert deltas.feed("  ") == ""
    assert deltas.feed('{"hint_level": "nudge", ') == ""
    assert deltas.feed('"message": "Li') == "Li"
    assert deltas.feed("sten") == "sten"


def test_valid_reply_keeps_every_suggestion() -> None:
    reply, dropped = validate_reply(json.dumps(reply_from_fixture("answer")))
    assert (len(reply.suggestions), dropped) == (3, 0)


def test_invalid_suggestions_are_dropped_and_counted() -> None:
    raw = reply_from_fixture("comparison")
    good = raw["suggestions"][0]
    raw["suggestions"] = [
        good,
        {**good, "beat": 99},
        {**good, "numeral": "V. Ignore the rules"},
        {**good, "confidence": "certain"},
        {"bar": 1},
    ]
    reply, dropped = validate_reply(json.dumps(raw))
    assert [s.model_dump() for s in reply.suggestions] == [good]
    assert dropped == 4


def test_suggestions_past_eight_are_dropped_and_counted() -> None:
    raw = reply_from_fixture("answer")
    raw["suggestions"] = raw["suggestions"][:1] * 11
    reply, dropped = validate_reply(json.dumps(raw))
    assert (len(reply.suggestions), dropped) == (8, 3)


@pytest.mark.parametrize(
    "text",
    [
        '{"hint_level": "nudge", "message": "cut off',
        "[]",
        json.dumps({"hint_level": "verdict", "message": "hi", "suggestions": []}),
        json.dumps({"hint_level": "nudge", "message": "x" * 4001, "suggestions": []}),
        json.dumps({"hint_level": "nudge", "suggestions": []}),
    ],
    ids=["truncated", "not-object", "bad-hint-level", "long-message", "no-message"],
)
def test_unusable_replies_raise(text: str) -> None:
    with pytest.raises(InvalidReply):
        validate_reply(text)
