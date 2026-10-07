"""SSE framing, the `suggestions` event, and fixture mode (protocol: contracts/tutor-sse.md).

Fixture mode, the default, replays a shape fixture chosen by the request's
hint level, so the app and tests run with no API key. Live mode is in live.py.
"""

import asyncio
import json
import re
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Final

from hearhear.config import REPO_ROOT
from hearhear.log import log_event
from hearhear.models import HintLevel, TutorRequest

FIXTURE_NAMES = frozenset({"nudge", "comparison", "answer", "malformed", "over-budget"})
# `served_by` in fixture mode: no model served the reply. The eval harness
# runs against live mode, so it never sees one.
FIXTURE_SERVED_BY = "fixture"
# Recorded lessons (content/lessons/README.md), named in X-Tutor-Fixture as
# "lesson:<id>". Unlike the shape fixtures, they replay in live mode too.
LESSONS_DIR = REPO_ROOT / "content" / "lessons" / "recorded"
LESSON_PREFIX = "lesson:"
# `served_by` for a recorded lesson: real tutor output, played back.
LESSON_SERVED_BY = "recorded"
# The longest pause a replay makes between events, whatever a file says, so a
# recorded lesson can't hold a connection open for long.
MAX_REPLAY_DELAY_MS = 1500
_LESSON_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# Hint levels from least to most revealing.
HINT_RANK: Final[dict[HintLevel, int]] = {"nudge": 0, "comparison": 1, "answer": 2}


@dataclass(frozen=True)
class Clamp:
    """What the server held back from one `suggestions` event, as counts for the logs.

    Each withheld suggestion is counted under the first reason that applies
    (hidden key, then provisional key, then a nudge), so the three sum to the
    number withheld.
    """

    withheld_hidden: int = 0
    withheld_provisional: int = 0
    withheld_nudge: int = 0
    # 1 when the reply claimed a higher hint level than the request asked for.
    hint_clamped: int = 0

    @property
    def withheld(self) -> int:
        return self.withheld_hidden + self.withheld_provisional + self.withheld_nudge

    @property
    def applied(self) -> bool:
        return bool(self.withheld or self.hint_clamped)

    def log_fields(self) -> dict[str, int]:
        return asdict(self)


def _clamp(request: TutorRequest, claimed: HintLevel, suggestion_count: int) -> Clamp:
    snapshot = request.snapshot
    if snapshot.key_hidden:
        reason = "withheld_hidden"
    elif snapshot.key.provisional:
        reason = "withheld_provisional"
    elif request.hint_level == "nudge":
        reason = "withheld_nudge"
    else:
        reason = None
    withheld = {reason: suggestion_count} if reason and suggestion_count else {}
    clamped = int(HINT_RANK[claimed] > HINT_RANK[request.hint_level])
    return Clamp(**withheld, hint_clamped=clamped)


def suggestions_data(
    request: TutorRequest,
    *,
    hint_level: HintLevel,
    suggestions: list[dict[str, Any]],
    dropped: int,
    served_by: str,
    fallback: bool,
) -> tuple[dict[str, Any], Clamp]:
    """The `suggestions` event's data, and what the server held back from it.

    `fallback` is true when the refusal fallback served any of the reply; the
    eval harness excludes those replies on this flag, not by comparing ids.

    Withholding by default is enforced here, not only by the system prompt:
    every suggestion is withheld, and counted in `withheld`, when the request
    asked for a nudge, the key is provisional, or the key is hidden (a
    letter-name chord gives a hidden key away). A reply that claims a higher
    hint level than the request asked for is reported at the requested level.
    """
    clamp = _clamp(request, hint_level, len(suggestions))
    data = {
        "hint_level": request.hint_level if clamp.hint_clamped else hint_level,
        "suggestions": [] if clamp.withheld else suggestions,
        "snapshot_version": request.snapshot.version,
        "dropped": dropped,
        "withheld": clamp.withheld,
        "served_by": served_by,
        "fallback": fallback,
    }
    return data, clamp


def is_lesson_name(name: str | None) -> bool:
    return name is not None and name.startswith(LESSON_PREFIX)


def is_lesson_id(name: str) -> bool:
    """The X-Tutor-Fixture value names a lesson by a plain id, recorded or not."""
    return _LESSON_ID.fullmatch(name.removeprefix(LESSON_PREFIX)) is not None


def load_lesson(name: str) -> dict[str, Any] | None:
    """The recorded lesson an X-Tutor-Fixture value names, or None when it
    isn't recorded. Only a plain id can match, so the header can't reach any
    other file."""
    lesson = name.removeprefix(LESSON_PREFIX)
    path = LESSONS_DIR / f"{lesson}.json"
    if not _LESSON_ID.fullmatch(lesson) or not path.is_file():
        return None
    loaded: dict[str, Any] = json.loads(path.read_text())
    return loaded


async def replay_fixture(
    request: TutorRequest, fixtures_dir: Path, request_id: str, name: str | None = None
) -> AsyncIterator[str]:
    """Replay a shape fixture with its recorded pacing: the hint level's, or
    the one `name` picks (tests use it for the failure fixtures)."""
    chosen = name if name in FIXTURE_NAMES else request.hint_level
    fixture = json.loads((fixtures_dir / f"{chosen}.json").read_text())
    async for chunk in replay(request, fixture, request_id, FIXTURE_SERVED_BY):
        yield chunk


async def replay(
    request: TutorRequest, fixture: dict[str, Any], request_id: str, served_by: str
) -> AsyncIterator[str]:
    """Replay a fixture's or a recorded lesson's events with their recorded pacing."""
    for step in fixture["events"]:
        await asyncio.sleep(min(step["delayMs"], MAX_REPLAY_DELAY_MS) / 1000)
        data = step["data"]
        if step["event"] == "suggestions":
            data, clamp = suggestions_data(
                request,
                hint_level=data["hint_level"],
                suggestions=data["suggestions"],
                dropped=data["dropped"],
                served_by=served_by,
                fallback=False,
            )
            if clamp.applied:
                log_event("tutor_clamped", request_id=request_id, **clamp.log_fields())
        yield sse(step["event"], data)
