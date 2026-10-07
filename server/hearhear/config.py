"""Settings from the environment. ANTHROPIC_API_KEY is not one of them: only
`anthropic_client()` in app.py reads it, straight into the SDK client, so it is
never stored, logged, or echoed. TUTOR_ACCESS_CODE is kept only in normalized
form, and out of the settings' repr."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from hearhear.access import normalize

REPO_ROOT = Path(__file__).resolve().parents[2]

TutorMode = Literal["fixture", "live"]


@dataclass(frozen=True)
class Settings:
    tutor_mode: TutorMode
    tutor_model: str
    dist_dir: Path
    fixtures_dir: Path
    # Input plus output tokens per UTC day, counted in memory. The hard cap is
    # the spend limit on the Anthropic Console workspace.
    daily_token_budget: int
    # slowapi limit string per client IP, e.g. "10/minute;100/day".
    rate_limit: str
    # The live tutor's passphrase, normalized (hearhear/access.py). Empty in
    # fixture mode when unset; live mode refuses to start without one.
    access_code: bytes = field(default=b"", repr=False)


def _tutor_mode(value: str) -> TutorMode:
    if value == "fixture":
        return "fixture"
    if value == "live":
        return "live"
    raise ValueError(f"TUTOR_MODE must be 'fixture' or 'live', not {value!r}")


def _positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, str(default))
    if not raw.isdigit() or int(raw) == 0:
        raise ValueError(f"{name} must be a positive integer, not {raw!r}")
    return int(raw)


def _access_code(tutor_mode: TutorMode) -> bytes:
    """TUTOR_ACCESS_CODE, normalized. Live mode fails closed without one; the
    error names the variable, never a value."""
    code = normalize(os.environ.get("TUTOR_ACCESS_CODE", ""))
    if tutor_mode == "live" and not code:
        raise RuntimeError(
            "TUTOR_MODE=live needs TUTOR_ACCESS_CODE, which is unset or has no letters or digits."
        )
    return code


def load_settings() -> Settings:
    tutor_mode = _tutor_mode(os.environ.get("TUTOR_MODE", "fixture"))
    return Settings(
        tutor_mode=tutor_mode,
        tutor_model=os.environ.get("TUTOR_MODEL", "claude-opus-5-5"),
        dist_dir=Path(os.environ.get("HEARHEAR_DIST", REPO_ROOT / "dist")),
        fixtures_dir=REPO_ROOT / "contracts" / "fixtures" / "tutor",
        daily_token_budget=_positive_int("TUTOR_DAILY_TOKEN_BUDGET", 500_000),
        rate_limit=os.environ.get("TUTOR_RATE_LIMIT", "10/minute;100/day"),
        access_code=_access_code(tutor_mode),
    )
