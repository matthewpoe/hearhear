"""Shared test data, an SSE parser, and a settings override."""

import dataclasses
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from hearhear import app as app_module
from hearhear.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[2]


def import_app(**env: str) -> subprocess.CompletedProcess[str]:
    """Import the app in a fresh interpreter, as uvicorn does at startup."""
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("ANTHROPIC_", "TUTOR_"))}
    return subprocess.run(
        [sys.executable, "-c", "import hearhear.app"],
        cwd=REPO_ROOT / "server",
        env={**clean, **env},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def settings_with(**overrides: Any) -> Settings:
    """The app's current settings with some fields replaced."""
    return dataclasses.replace(app_module.settings, **overrides)


# A made-up passphrase for tests. The real one is set only on Railway.
ACCESS_CODE = "Treble Clef 42"

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


# A recorded lesson's shape (content/lessons/README.md), for the replay tests.
LESSON = {
    "name": "ode-ending",
    "events": [
        {"event": "message", "data": {"delta": "Recorded: it lands."}, "delayMs": 0},
        {
            "event": "suggestions",
            "data": {"suggestions": [], "dropped": 0},
            "delayMs": 0,
        },
        {"event": "done", "data": {}, "delayMs": 0},
    ],
}
