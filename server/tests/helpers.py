"""Shared test data and an SSE parser."""

import json
from typing import Any

SNAPSHOT: dict[str, Any] = {
    "version": 7,
    "key": {"tonic": "D", "mode": "major", "provisional": False},
    "meter": {"beats_per_bar": 4, "beat_unit": 4, "pickup_beats": 0, "provisional": False},
    "tempo": 108,
    "label_style": "roman",
    "bars": [
        {
            "bar": 1,
            "notes": [{"beat": 1, "pitch": "F#4", "degree": "3", "beats": 1}],
            "chords": [{"beat": 1, "numeral": "I", "nashville": "1", "letter": "D"}],
        }
    ],
}


def events(body: str) -> list[tuple[str, dict[str, Any]]]:
    parsed = []
    for block in body.strip().split("\n\n"):
        event_line, data_line = block.split("\n")
        parsed.append((event_line.removeprefix("event: "), json.loads(data_line[6:])))
    return parsed
