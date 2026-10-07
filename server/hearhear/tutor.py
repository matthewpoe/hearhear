"""SSE framing and fixture mode (protocol: contracts/tutor-sse.md).

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


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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
            data = {**data, "snapshot_version": request.snapshot.version}
        yield sse(step["event"], data)
