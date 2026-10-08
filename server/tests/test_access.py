"""The live tutor's passphrase gate. Claude is replaced by a stub stream: these
tests only check who gets through."""

import io
import json
import logging
from collections.abc import AsyncIterator, Iterator
from typing import Any
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient
from helpers import ACCESS_CODE, SNAPSHOT, import_app, settings_with

from hearhear import app as app_module
from hearhear.access import AccessLockout, code_matches, normalize

WRONG_CODE = "Bass Clef 17"


@pytest.fixture
def claude_calls(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Stands in for the live stream and records each request that reached it."""
    calls: list[str] = []

    async def stub_stream(_body: Any, **fields: Any) -> AsyncIterator[str]:
        calls.append(fields["request_id"])
        yield "event: done\ndata: {}\n\n"

    monkeypatch.setattr(app_module, "stream_live", stub_stream)
    monkeypatch.setattr(app_module, "anthropic_client", lambda: None)
    return calls


@pytest.fixture
def gated(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, claude_calls: list[str]
) -> TestClient:
    settings = settings_with(tutor_mode="live", access_code=normalize(ACCESS_CODE))
    monkeypatch.setattr(app_module, "settings", settings)
    return client


def ask(client: TestClient, code: str | None, ip: str = "203.0.113.9") -> Any:
    headers = {"X-Forwarded-For": ip}
    if code is not None:
        headers["X-Tutor-Access"] = code
    return client.post("/api/tutor", json={"snapshot": SNAPSHOT, "mode": "review"}, headers=headers)


@pytest.mark.parametrize(
    "spelling",
    [ACCESS_CODE, "treble clef 42", "TREBLE-CLEF-42", "  treble_clef.42 ", "TrebleClef42"],
)
def test_the_right_code_passes_in_any_case_spacing_or_punctuation(
    gated: TestClient, claude_calls: list[str], spelling: str
) -> None:
    response = ask(gated, spelling)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert len(claude_calls) == 1


@pytest.mark.parametrize(
    ("code", "message"),
    [
        (None, app_module.ACCESS_MISSING_MESSAGE),
        ("", app_module.ACCESS_MISSING_MESSAGE),
        ("  -- ", app_module.ACCESS_MISSING_MESSAGE),
        (WRONG_CODE, app_module.ACCESS_WRONG_MESSAGE),
    ],
    ids=["missing", "empty", "punctuation-only", "wrong"],
)
def test_a_missing_or_wrong_code_is_401_before_claude(
    gated: TestClient, claude_calls: list[str], code: str | None, message: str
) -> None:
    response = ask(gated, code)
    assert response.status_code == 401
    assert response.json() == {"error": {"code": "access_required", "message": message}}
    assert len(response.headers["x-request-id"]) == 32
    assert claude_calls == []


def test_the_gate_runs_before_the_budget(
    gated: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An outsider can't learn whether today's budget is spent."""
    monkeypatch.setattr(app_module.budget, "exhausted", lambda: True)
    assert ask(gated, WRONG_CODE).status_code == 401
    assert ask(gated, ACCESS_CODE).status_code == 503


def test_wrong_codes_lock_the_ip_out_even_for_the_right_code(
    gated: TestClient, claude_calls: list[str]
) -> None:
    statuses = [ask(gated, f"{WRONG_CODE} {n}").status_code for n in range(5)]
    assert statuses == [401] * 5
    locked = ask(gated, ACCESS_CODE)
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "access_locked"
    assert 1 <= int(locked.headers["retry-after"]) <= 600
    assert claude_calls == []


def test_the_lockout_is_per_ip(gated: TestClient) -> None:
    for n in range(5):
        ask(gated, f"{WRONG_CODE} {n}", ip="203.0.113.9")
    assert ask(gated, ACCESS_CODE, ip="198.51.100.4").status_code == 200


def test_missing_codes_do_not_count_toward_the_lockout(gated: TestClient) -> None:
    for code in [None, "", " - "] * 2:
        ask(gated, code)
    assert ask(gated, ACCESS_CODE).status_code == 200


def test_the_lockout_lifts_when_the_window_passes() -> None:
    now = [1000.0]
    lockout = AccessLockout(max_wrong=2, window_seconds=600, clock=lambda: now[0])
    lockout.record_wrong("ip")
    now[0] += 100
    lockout.record_wrong("ip")
    assert lockout.retry_after("ip") == 500, "until the oldest of the two expires"
    now[0] += 500
    assert lockout.retry_after("ip") is None, "one guess left in the window"
    now[0] += 100
    lockout.record_wrong("other")
    assert "ip" not in lockout._wrong, "expired entries are forgotten"


def test_fixture_mode_ignores_the_gate(client: TestClient) -> None:
    assert ask(client, None).status_code == 200
    for n in range(6):
        assert ask(client, f"{WRONG_CODE} {n}").status_code == 200


def test_non_ascii_codes_compare_without_error() -> None:
    assert code_matches("CAFÉ 9", normalize("café9"))
    assert not code_matches("cafe 9", normalize("café9"))


def test_a_percent_encoded_code_matches_after_decoding() -> None:
    # The client percent-encodes the header, since header values must be Latin-1.
    assert code_matches(quote("♪ Piano Man!"), normalize("piano man"))
    assert code_matches(quote("CAFÉ 9"), normalize("café9"))


def test_an_empty_expected_code_never_matches() -> None:
    assert not code_matches("", b"")
    assert not code_matches("  -- ", b"")


@pytest.mark.parametrize("code", [None, "", "  -- . --  "], ids=["unset", "empty", "no-letters"])
def test_live_mode_without_an_access_code_fails_at_startup(code: str | None) -> None:
    env = {"TUTOR_MODE": "live", "ANTHROPIC_API_KEY": "sk-ant-test-not-a-real-key"}
    env |= {} if code is None else {"TUTOR_ACCESS_CODE": code}
    result = import_app(**env)
    assert result.returncode != 0
    assert "TUTOR_ACCESS_CODE" in result.stderr
    if code:
        assert code.strip() not in result.stderr


def test_live_mode_starts_without_echoing_the_access_code() -> None:
    result = import_app(
        TUTOR_MODE="live",
        ANTHROPIC_API_KEY="sk-ant-test-not-a-real-key",
        TUTOR_ACCESS_CODE=ACCESS_CODE,
    )
    assert result.returncode == 0, result.stderr
    assert "Treble" not in result.stdout + result.stderr


@pytest.fixture
def server_logs() -> Iterator[io.StringIO]:
    """Everything the app logs, as the real log handler formats it."""
    captured = io.StringIO()
    handler = logging.StreamHandler(captured)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger = logging.getLogger("hearhear")
    logger.addHandler(handler)
    yield captured
    logger.removeHandler(handler)


def test_neither_code_appears_in_logs_responses_or_settings(
    gated: TestClient, server_logs: io.StringIO
) -> None:
    responses = [ask(gated, ACCESS_CODE), ask(gated, None)]
    responses += [ask(gated, WRONG_CODE) for _ in range(6)]  # The last is locked out.
    assert [r.status_code for r in responses] == [200, 401, 401, 401, 401, 401, 401, 429]

    logged = server_logs.getvalue()
    codes = {"access_required", "access_locked"}
    assert codes <= {json.loads(line).get("code") for line in logged.splitlines()}
    exposed = logged + "".join(r.text + json.dumps(dict(r.headers)) for r in responses)
    exposed += repr(app_module.settings)
    for secret in (ACCESS_CODE, WRONG_CODE, "trebleclef42", "bassclef17"):
        assert secret.casefold() not in exposed.casefold(), secret
