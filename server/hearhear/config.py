"""Settings from the environment. Never logged: ANTHROPIC_API_KEY."""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

REPO_ROOT = Path(__file__).resolve().parents[2]

TutorMode = Literal["fixture", "live"]


@dataclass(frozen=True)
class Settings:
    tutor_mode: TutorMode
    tutor_model: str
    dist_dir: Path
    fixtures_dir: Path


def _tutor_mode(value: str) -> TutorMode:
    if value == "fixture":
        return "fixture"
    if value == "live":
        return "live"
    raise ValueError(f"TUTOR_MODE must be 'fixture' or 'live', not {value!r}")


def load_settings() -> Settings:
    return Settings(
        tutor_mode=_tutor_mode(os.environ.get("TUTOR_MODE", "fixture")),
        tutor_model=os.environ.get("TUTOR_MODEL", "claude-opus-5-5"),
        dist_dir=Path(os.environ.get("HEARHEAR_DIST", REPO_ROOT / "dist")),
        fixtures_dir=REPO_ROOT / "contracts" / "fixtures" / "tutor",
    )
