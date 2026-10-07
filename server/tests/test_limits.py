import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from helpers import SNAPSHOT, settings_with
from starlette.requests import Request

from hearhear import app as app_module
from hearhear.limits import client_ip
from hearhear.models import MAX_BODY_BYTES


def oversized_body() -> bytes:
    """A valid request padded past the cap with whitespace."""
    body = json.dumps({"snapshot": SNAPSHOT}).encode()
    return body + b" " * (MAX_BODY_BYTES - len(body) + 1)


def test_declared_oversized_body_is_413(client: TestClient) -> None:
    response = client.post(
        "/api/tutor", content=oversized_body(), headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "too_large"
    assert "content-security-policy" in response.headers


def test_chunked_oversized_body_without_content_length_is_413(client: TestClient) -> None:
    body = oversized_body()

    def pieces() -> Iterator[bytes]:
        for start in range(0, len(body), 16 * 1024):
            yield body[start : start + 16 * 1024]

    response = client.post(
        "/api/tutor", content=pieces(), headers={"Content-Type": "application/json"}
    )
    assert response.request.headers.get("transfer-encoding") == "chunked"
    assert "content-length" not in response.request.headers
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "too_large"


def test_chunked_body_under_the_cap_reaches_the_endpoint(client: TestClient) -> None:
    body = json.dumps({"snapshot": SNAPSHOT, "hint_level": "nudge"}).encode()

    def pieces() -> Iterator[bytes]:
        yield body[:50]
        yield body[50:]

    response = client.post(
        "/api/tutor", content=pieces(), headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")


def test_body_at_exactly_the_cap_is_accepted(client: TestClient) -> None:
    body = json.dumps({"snapshot": SNAPSHOT}).encode()
    body += b" " * (MAX_BODY_BYTES - len(body))
    response = client.post("/api/tutor", content=body, headers={"Content-Type": "application/json"})
    assert response.status_code == 200


@pytest.fixture
def two_per_minute(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(app_module, "settings", settings_with(rate_limit="2/minute"))
    return client


def ask(client: TestClient, forwarded_for: str | None = None) -> int:
    headers = {"X-Forwarded-For": forwarded_for} if forwarded_for else {}
    body = {"snapshot": SNAPSHOT, "hint_level": "nudge"}
    return client.post("/api/tutor", json=body, headers=headers).status_code


def test_rate_limit_returns_429_with_the_error_envelope(two_per_minute: TestClient) -> None:
    assert [ask(two_per_minute) for _ in range(2)] == [200, 200]
    response = two_per_minute.post("/api/tutor", json={"snapshot": SNAPSHOT})
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert "a minute" in response.json()["error"]["message"]


def test_429_says_when_to_retry(two_per_minute: TestClient) -> None:
    for _ in range(2):
        ask(two_per_minute)
    response = two_per_minute.post("/api/tutor", json={"snapshot": SNAPSHOT})
    retry_after = response.headers["retry-after"]
    assert retry_after.isdigit(), "an integer number of seconds"
    assert 1 <= int(retry_after) <= 60


def test_429_on_the_daily_limit_does_not_promise_a_minute(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(app_module, "settings", settings_with(rate_limit="1/day"))
    ask(client)
    response = client.post("/api/tutor", json={"snapshot": SNAPSHOT})
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 60
    assert "a minute" not in response.json()["error"]["message"]
    assert "recorded lessons still work" in response.json()["error"]["message"]


def test_spoofed_leftmost_forwarded_for_does_not_reset_the_limit(
    two_per_minute: TestClient,
) -> None:
    statuses = [ask(two_per_minute, f"10.0.0.{n}, 203.0.113.9") for n in range(3)]
    assert statuses == [200, 200, 429]


def test_each_client_ip_has_its_own_limit(two_per_minute: TestClient) -> None:
    assert [ask(two_per_minute, "203.0.113.9") for _ in range(3)] == [200, 200, 429]
    assert ask(two_per_minute, "198.51.100.4") == 200


def test_invalid_requests_are_rejected_before_the_limit_counts(
    two_per_minute: TestClient,
) -> None:
    for _ in range(3):
        assert two_per_minute.post("/api/tutor", json={"snapshot": {}}).status_code == 422
    assert ask(two_per_minute) == 200


def request_with(headers: list[tuple[bytes, bytes]]) -> Request:
    return Request({"type": "http", "path": "/", "headers": headers, "client": ("10.1.1.1", 5)})


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (b"203.0.113.9", "203.0.113.9"),
        (b"1.2.3.4, 203.0.113.9", "203.0.113.9"),
        (b"1.2.3.4,203.0.113.9 ", "203.0.113.9"),
        (b"", "10.1.1.1"),
        (b" , ", "10.1.1.1"),
    ],
)
def test_client_ip_is_the_rightmost_forwarded_entry(header: bytes, expected: str) -> None:
    assert client_ip(request_with([(b"x-forwarded-for", header)])) == expected


def test_client_ip_falls_back_to_the_socket_without_the_header() -> None:
    assert client_ip(request_with([])) == "10.1.1.1"
