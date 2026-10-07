"""SSE framing, the `suggestions` event, and fixture mode (protocol: contracts/tutor-sse.md).

Fixture mode, the default, replays a shape fixture chosen by the request's
hint level, so the app and tests run with no API key. Live mode is in live.py.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from hearhear.models import TutorRequest

FIXTURE_NAMES = frozenset({"nudge", "comparison", "answer", "malformed", "over-budget"})
# `served_by` in fixture mode: no model served the reply. The eval harness
# runs against live mode, so it never sees one.
FIXTURE_SERVED_BY = "fixture"


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def suggestions_data(
    request: TutorRequest,
    *,
    hint_level: str,
    suggestions: list[dict[str, Any]],
    dropped: int,
    served_by: str,
    fallback: bool,
) -> tuple[dict[str, Any], int]:
    """The `suggestions` event's data, and how many suggestions it withheld.

    `fallback` is true when the refusal fallback served any of the reply; the
    eval harness excludes those replies on this flag, not by comparing ids.

    While the snapshot's key is hidden, every suggestion is withheld and
    counted in `dropped`. A letter-name chord gives the key away, and the
    system prompt asking Claude for none is not a guarantee.
    """
    withheld = len(suggestions) if request.snapshot.key_hidden else 0
    data = {
        "hint_level": hint_level,
        "suggestions": [] if withheld else suggestions,
        "snapshot_version": request.snapshot.version,
        "dropped": dropped + withheld,
        "served_by": served_by,
        "fallback": fallback,
    }
    return data, withheld


async def replay_fixture(
    request: TutorRequest, fixtures_dir: Path, name: str | None = None
) -> AsyncIterator[str]:
    """Replay a fixture's events with their recorded pacing.

    `name` overrides the hint-level choice (tests use it for the failure fixtures).
    """
    chosen = name if name in FIXTURE_NAMES else request.hint_level
    fixture = json.loads((fixtures_dir / f"{chosen}.json").read_text())
    for step in fixture["events"]:
        await asyncio.sleep(step["delayMs"] / 1000)
        data = step["data"]
        if step["event"] == "suggestions":
            data, _ = suggestions_data(
                request,
                hint_level=data["hint_level"],
                suggestions=data["suggestions"],
                dropped=data["dropped"],
                served_by=FIXTURE_SERVED_BY,
                fallback=False,
            )
        yield sse(step["event"], data)
