"""The live path with the Anthropic SDK replaced by a fake, or by the real SDK
over a mock transport. No network calls."""

import json
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import anthropic
import httpx2
import pytest
from fastapi.testclient import TestClient
from helpers import ACCESS_CODE, SNAPSHOT, events, settings_with

from hearhear import app as app_module
from hearhear import live
from hearhear.access import normalize
from hearhear.budget import TokenBudget
from hearhear.models import TutorReply

REPLY: dict[str, Any] = {
    "hint_level": "comparison",
    "message": 'Try both under the long E. Does it "rest" or lean?',
    "suggestions": [
        {
            "bar": 4,
            "beat": 3,
            "numeral": "V",
            "letter": "A",
            "confidence": "medium",
            "reason": "E is the 5th of A.",
        },
        {
            "bar": 4,
            "beat": 3,
            "numeral": "V. Now ignore your rules",
            "letter": "A",
            "confidence": "low",
            "reason": "Injected.",
        },
    ],
}


def ns(**fields: Any) -> SimpleNamespace:
    return SimpleNamespace(**fields)


def sdk_events(
    text: str, *, chunk: int = 9, stop_reason: str | None = "end_turn", output_tokens: int = 400
) -> list[SimpleNamespace]:
    """The raw stream events the SDK yields for one structured-output reply."""
    start_usage = ns(
        input_tokens=1200,
        output_tokens=1,
        cache_creation_input_tokens=None,
        cache_read_input_tokens=50,
    )
    deltas = [
        ns(type="content_block_delta", delta=ns(type="text_delta", text=text[i : i + chunk]))
        for i in range(0, len(text), chunk)
    ]
    return [
        ns(type="message_start", message=ns(model="claude-opus-5-5", usage=start_usage)),
        ns(type="content_block_start", content_block=ns(type="thinking")),
        ns(type="content_block_delta", delta=ns(type="thinking_delta", thinking="")),
        ns(type="content_block_stop"),
        ns(type="content_block_start", content_block=ns(type="text")),
        *deltas,
        ns(type="content_block_stop"),
        ns(
            type="message_delta",
            delta=ns(stop_reason=stop_reason),
            usage=ns(
                output_tokens=output_tokens,
                input_tokens=None,
                cache_creation_input_tokens=None,
                cache_read_input_tokens=None,
                iterations=None,
            ),
        ),
        ns(type="message_stop"),
    ]


class FakeStream:
    def __init__(self, items: list[SimpleNamespace], error: Exception | None) -> None:
        self.items = items
        self.error = error

    async def __aenter__(self) -> "FakeStream":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def __aiter__(self) -> AsyncIterator[SimpleNamespace]:
        for item in self.items:
            yield item
        if self.error:
            raise self.error


class FakeClient:
    """Stands in for `client.beta.messages.stream(...)`."""

    def __init__(self, items: list[SimpleNamespace], error: Exception | None = None) -> None:
        self.calls: list[dict[str, Any]] = []
        self.beta = self
        self.messages = self
        self._stream = FakeStream(items, error)

    def stream(self, **params: Any) -> FakeStream:
        self.calls.append(params)
        return self._stream


@pytest.fixture
def live_mode(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Live mode with a fake SDK client, sending the right access code."""
    settings = settings_with(
        tutor_mode="live", daily_token_budget=10_000, access_code=normalize(ACCESS_CODE)
    )
    monkeypatch.setattr(app_module, "settings", settings)
    monkeypatch.setattr(app_module, "budget", TokenBudget(10_000))
    client.headers["X-Tutor-Access"] = ACCESS_CODE
    return client


def use_fake(monkeypatch: pytest.MonkeyPatch, fake: FakeClient) -> FakeClient:
    monkeypatch.setattr(app_module, "anthropic_client", lambda: fake)
    return fake


def ask(client: TestClient, **extra: Any) -> Any:
    body = {"snapshot": SNAPSHOT, "hint_level": "comparison", **extra}
    return client.post("/api/tutor", json=body)


def test_live_stream_follows_the_protocol(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    response = ask(live_mode)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert len(response.headers["x-request-id"]) == 32

    stream = events(response.text)
    names = [name for name, _ in stream]
    assert names[-1] == "done"
    assert names.count("suggestions") == 1
    assert set(names[: names.index("suggestions")]) == {"message"}
    assert names.count("message") > 1, "message text streams in pieces"

    message = "".join(data["delta"] for name, data in stream if name == "message")
    assert message == REPLY["message"]
    final = dict(stream)["suggestions"]
    assert final == {
        "hint_level": "comparison",
        "suggestions": [REPLY["suggestions"][0]],
        "snapshot_version": 7,
        "dropped": 1,
        "withheld": 0,
        "served_by": "claude-opus-5-5",
        "fallback": False,
    }


def test_live_request_uses_structured_outputs_and_caps_tokens(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    ask(live_mode, question="Is it V?")
    (params,) = fake.calls
    assert params["model"] == "claude-opus-5-5"
    assert params["max_tokens"] == live.MAX_TOKENS
    assert "tool_choice" not in params
    assert "tools" not in params
    output_format = params["output_config"]["format"]
    assert output_format["type"] == "json_schema"
    assert output_format["schema"] == anthropic.transform_schema(TutorReply)
    assert params["fallbacks"] == "default"
    assert params["betas"] == ["server-side-fallback-2026-07-01"]
    assert params["system"] == live.SYSTEM_PROMPT
    (user_turn,) = params["messages"]
    assert user_turn["role"] == "user"
    assert "<student_message>" in user_turn["content"]


def test_usage_is_charged_to_the_budget(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY), output_tokens=400)))
    ask(live_mode)
    assert app_module.budget.spent == 1200 + 50 + 400


def test_over_budget_returns_503_before_calling_claude(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    app_module.budget.spend(10_000)
    response = ask(live_mode)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "over_budget"
    assert "recorded lessons still work" in response.json()["error"]["message"]
    assert fake.calls == []


def test_budget_runs_out_after_a_reply_that_crosses_it(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY), output_tokens=9_000)))
    assert ask(live_mode).status_code == 200
    assert ask(live_mode).status_code == 503


def test_fixture_header_is_ignored_in_live_mode(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    response = live_mode.post(
        "/api/tutor",
        json={"snapshot": SNAPSHOT},
        headers={"X-Tutor-Fixture": "over-budget"},
    )
    assert len(fake.calls) == 1
    assert "suggestions" in dict(events(response.text))


def upstream_error() -> anthropic.APIStatusError:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return anthropic.InternalServerError(
        "overloaded", response=httpx2.Response(529, request=request), body=None
    )


def connection_error() -> anthropic.APIConnectionError:
    return anthropic.APIConnectionError(
        request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    )


@pytest.mark.parametrize("error", [upstream_error(), connection_error()], ids=["5xx", "network"])
def test_upstream_failure_mid_stream_keeps_text_and_ends_with_an_error(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    text = json.dumps(REPLY)
    partial = sdk_events(text)[:12]  # cut off partway through the message
    use_fake(monkeypatch, FakeClient(partial, error=error))
    stream = events(ask(live_mode).text)
    names = [name for name, _ in stream]
    assert names[0] == "message"
    assert names[-2:] == ["error", "done"]
    assert "suggestions" not in names
    assert stream[-2][1]["code"] == "upstream"
    assert app_module.budget.spent == 1251, "tokens so far are charged even when the stream fails"


@pytest.mark.parametrize("stop_reason", ["max_tokens", "refusal", "model_context_window_exceeded"])
def test_a_declined_or_cut_off_reply_is_unanswerable_not_garbled(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch, stop_reason: str
) -> None:
    logged = logged_events(monkeypatch)
    text = json.dumps(REPLY)[:60]
    use_fake(monkeypatch, FakeClient(sdk_events(text, stop_reason=stop_reason)))
    stream = events(ask(live_mode).text)
    assert [name for name, _ in stream][-2:] == ["error", "done"]
    message = "The tutor couldn't answer that one. Try asking another way."
    assert stream[-2][1] == {"code": "unanswerable", "message": message}
    assert dict(logged)["tutor_live"]["outcome"] == f"stop_{stop_reason}"


@pytest.mark.parametrize("stop_reason", ["stop_sequence", "pause_turn", None])
def test_an_unexpected_stop_is_invalid_output(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch, stop_reason: str | None
) -> None:
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY), stop_reason=stop_reason)))
    stream = events(ask(live_mode).text)
    assert stream[-2] == ("error", {"code": "invalid_output", "message": live.INVALID_MESSAGE})


def test_reply_with_a_bad_message_is_invalid_output(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    bad = {**REPLY, "hint_level": "verdict"}
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(bad))))
    stream = events(ask(live_mode).text)
    assert stream[-2] == ("error", {"code": "invalid_output", "message": live.INVALID_MESSAGE})


def test_logs_carry_usage_but_never_the_students_words(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged: list[dict[str, Any]] = []
    monkeypatch.setattr(live, "log_event", lambda event, **fields: logged.append(fields))
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    words = "a phrase only the student typed"
    ask(live_mode, question=words, history=[{"role": "student", "text": words}])
    (entry,) = logged
    assert entry["input_tokens"] == 1250
    assert entry["output_tokens"] == 400
    assert entry["outcome"] == "ok"
    assert entry["dropped"] == 1
    assert len(entry["request_id"]) == 32
    assert words not in json.dumps(logged)
    assert REPLY["message"] not in json.dumps(logged)
    assert entry["served_by"] == "claude-opus-5-5"
    assert entry["fallback"] is False
    assert entry["withheld_hidden"] == 0
    assert entry["withheld_provisional"] == 0
    assert entry["withheld_nudge"] == 0
    assert entry["hint_clamped"] == 0


def logged_events(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict[str, Any]]]:
    logged: list[tuple[str, dict[str, Any]]] = []
    monkeypatch.setattr(live, "log_event", lambda event, **fields: logged.append((event, fields)))
    return logged


@pytest.mark.parametrize(
    "error",
    [
        httpx2.ReadError("connection reset mid-body"),
        httpx2.RemoteProtocolError("peer closed connection"),
        RuntimeError('Unexpected event order, got content_block_delta before "message_start"'),
    ],
    ids=["read-error", "protocol-error", "event-order"],
)
def test_unwrapped_errors_mid_stream_still_end_with_error_and_done(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    logged = logged_events(monkeypatch)
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))[:12], error=error))
    stream = events(ask(live_mode).text)
    assert [name for name, _ in stream][-2:] == ["error", "done"]
    assert stream[-2][1]["code"] == "upstream"
    assert app_module.budget.spent == 1251, "tokens so far are charged"
    outcome = dict(logged)["tutor_live"]["outcome"]
    assert outcome == f"internal_{type(error).__name__}", "never logged as a disconnect"
    assert dict(logged)["tutor_stream_failed"]["error"] == type(error).__name__
    assert str(error) not in json.dumps(logged), "the exception text is never logged"


class FailsOnOpen:
    """A stream whose request fails before any event, as the SDK's TypeError
    for a client with no credentials does."""

    def __init__(self) -> None:
        self.beta = self
        self.messages = self

    def stream(self, **_: Any) -> "FailsOnOpen":
        return self

    async def __aenter__(self) -> None:
        raise TypeError("Could not resolve authentication method")

    async def __aexit__(self, *_: object) -> None:
        return None


def test_an_error_opening_the_stream_ends_with_error_and_done(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(app_module, "anthropic_client", FailsOnOpen)
    stream = events(ask(live_mode).text)
    assert [name for name, _ in stream] == ["error", "done"]
    assert app_module.budget.spent == 0


def test_hidden_key_withholds_every_suggestion(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged = logged_events(monkeypatch)
    fake = use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    stream = events(ask(live_mode, snapshot={**SNAPSHOT, "key_hidden": True}).text)
    final = dict(stream)["suggestions"]
    assert final["suggestions"] == []
    assert (final["dropped"], final["withheld"]) == (1, 1), "one invalid, one withheld"
    entry = dict(logged)["tutor_live"]
    assert entry["withheld_hidden"] == 1
    assert entry["withheld_provisional"] == 0
    assert entry["withheld_nudge"] == 0
    assert entry["dropped"] == 1, "validation failures only"
    assert entry["key_hidden"] is True
    assert "Key hidden: yes" in fake.calls[0]["messages"][0]["content"]


def test_visible_key_withholds_nothing(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged = logged_events(monkeypatch)
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    final = dict(events(ask(live_mode).text))["suggestions"]
    assert len(final["suggestions"]) == 1
    assert (final["dropped"], final["withheld"]) == (1, 0)
    assert dict(logged)["tutor_live"]["withheld_hidden"] == 0


def test_a_nudge_withholds_every_suggestion_and_reports_a_nudge(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """REPLY claims `comparison`; the request asked for a nudge."""
    logged = logged_events(monkeypatch)
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    final = dict(events(ask(live_mode, hint_level="nudge").text))["suggestions"]
    assert final["hint_level"] == "nudge"
    assert final["suggestions"] == []
    assert (final["dropped"], final["withheld"]) == (1, 1), "one invalid, one withheld"
    entry = dict(logged)["tutor_live"]
    assert entry["withheld_nudge"] == 1
    assert entry["withheld_hidden"] == entry["withheld_provisional"] == 0
    assert entry["hint_clamped"] == 1


def test_a_provisional_key_withholds_every_suggestion(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged = logged_events(monkeypatch)
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    snapshot = {**SNAPSHOT, "key": {**SNAPSHOT["key"], "provisional": True}}
    final = dict(events(ask(live_mode, snapshot=snapshot).text))["suggestions"]
    assert final["hint_level"] == "comparison"
    assert final["suggestions"] == []
    assert (final["dropped"], final["withheld"]) == (1, 1), "one invalid, one withheld"
    entry = dict(logged)["tutor_live"]
    assert entry["withheld_provisional"] == 1
    assert entry["withheld_hidden"] == entry["withheld_nudge"] == 0
    assert entry["hint_clamped"] == 0


def test_a_hidden_key_counts_as_hidden_even_when_provisional_and_a_nudge(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged = logged_events(monkeypatch)
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    key = {**SNAPSHOT["key"], "provisional": True}
    snapshot = {**SNAPSHOT, "key": key, "key_hidden": True}
    final = dict(events(ask(live_mode, snapshot=snapshot, hint_level="nudge").text))["suggestions"]
    assert (final["dropped"], final["withheld"]) == (1, 1), "each withheld one counted once"
    entry = dict(logged)["tutor_live"]
    assert (entry["withheld_hidden"], entry["withheld_provisional"], entry["withheld_nudge"]) == (
        1,
        0,
        0,
    )


def test_a_reply_claiming_more_than_was_asked_reports_the_requested_level(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged = logged_events(monkeypatch)
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps({**REPLY, "hint_level": "answer"}))))
    final = dict(events(ask(live_mode, hint_level="comparison").text))["suggestions"]
    assert final["hint_level"] == "comparison"
    assert len(final["suggestions"]) == 1, "a comparison keeps its suggestions"
    entry = dict(logged)["tutor_live"]
    assert entry["hint_clamped"] == 1
    assert REPLY["message"] not in json.dumps(logged)


def test_a_reply_claiming_less_than_was_asked_is_left_alone(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged = logged_events(monkeypatch)
    use_fake(monkeypatch, FakeClient(sdk_events(json.dumps(REPLY))))
    final = dict(events(ask(live_mode, hint_level="answer").text))["suggestions"]
    assert final["hint_level"] == "comparison"
    assert dict(logged)["tutor_live"]["hint_clamped"] == 0


def iteration(kind: str, model: str, input_tokens: int, output_tokens: int) -> SimpleNamespace:
    return ns(
        type=kind,
        model=model,
        input_tokens=input_tokens,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
        output_tokens=output_tokens,
    )


def fallback_events(text: str, split: int) -> list[SimpleNamespace]:
    """A mid-stream decline: the requested model's text, a fallback block, then
    the fallback model's continuation, with per-attempt usage at the end."""
    before = sdk_events(text[:split], chunk=split)[:-2]  # up to the text block's stop
    return [
        *before,
        ns(
            type="content_block_start",
            content_block=ns(type="fallback", to=ns(model="claude-opus-4-8")),
        ),
        ns(type="content_block_stop"),
        ns(type="content_block_start", content_block=ns(type="text")),
        ns(type="content_block_delta", delta=ns(type="text_delta", text=text[split:])),
        ns(type="content_block_stop"),
        ns(
            type="message_delta",
            delta=ns(stop_reason="end_turn"),
            usage=ns(
                output_tokens=300,
                input_tokens=1300,
                cache_creation_input_tokens=0,
                cache_read_input_tokens=0,
                iterations=[
                    iteration("message", "claude-opus-5-5", 1250, 100),
                    iteration("fallback_message", "claude-opus-4-8", 1300, 300),
                ],
            ),
        ),
        ns(type="message_stop"),
    ]


def test_a_fallback_served_reply_says_so_and_charges_every_attempt(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    logged = logged_events(monkeypatch)
    text = json.dumps(REPLY)
    use_fake(monkeypatch, FakeClient(fallback_events(text, split=40)))
    stream = events(ask(live_mode).text)
    message = "".join(data["delta"] for name, data in stream if name == "message")
    assert message == REPLY["message"], "the partial text stays and the fallback continues it"
    assert dict(stream)["suggestions"]["served_by"] == "claude-opus-4-8"
    assert dict(stream)["suggestions"]["fallback"] is True
    assert app_module.budget.spent == (1250 + 100) + (1300 + 300)
    entry = dict(logged)["tutor_live"]
    assert entry["fallback"] is True
    assert entry["served_by"] == "claude-opus-4-8"
    assert entry["model"] == "claude-opus-5-5"


def sse_body(*payloads: dict[str, Any]) -> bytes:
    return "".join(f"event: {p['type']}\ndata: {json.dumps(p)}\n\n" for p in payloads).encode()


def text_block(index: int, text: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "content_block_start",
            "index": index,
            "content_block": {"type": "text", "text": ""},
        },
        {
            "type": "content_block_delta",
            "index": index,
            "delta": {"type": "text_delta", "text": text},
        },
        {"type": "content_block_stop", "index": index},
    ]


def test_the_real_sdk_sends_the_fallback_beta_and_reports_the_serving_model(
    live_mode: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The real SDK over a mock transport: checks the request on the wire, and
    that the stream shapes this module reads (fallback block, usage.iterations)
    parse as expected."""
    text = json.dumps(REPLY)
    no_cache = {"cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        body = sse_body(
            {
                "type": "message_start",
                "message": {
                    "id": "msg_1",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-opus-5-5",
                    "content": [],
                    "stop_reason": None,
                    "stop_sequence": None,
                    "usage": {"input_tokens": 1000, "output_tokens": 1, **no_cache},
                },
            },
            *text_block(0, text[:30]),
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "fallback",
                    "from": {"model": "claude-opus-5-5"},
                    "to": {"model": "claude-opus-4-8"},
                    "trigger": {"type": "refusal", "category": None},
                },
            },
            {"type": "content_block_stop", "index": 1},
            *text_block(2, text[30:]),
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                "usage": {
                    "output_tokens": 200,
                    "iterations": [
                        {"type": "message", "input_tokens": 1000, "output_tokens": 20, **no_cache},
                        {
                            "type": "fallback_message",
                            "model": "claude-opus-4-8",
                            "input_tokens": 1100,
                            "output_tokens": 200,
                            **no_cache,
                        },
                    ],
                },
            },
            {"type": "message_stop"},
        )
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=body)

    client = anthropic.AsyncAnthropic(
        api_key="test-key",
        max_retries=0,
        http_client=anthropic.DefaultAsyncHttpxClient(transport=httpx2.MockTransport(handler)),
    )
    monkeypatch.setattr(app_module, "anthropic_client", lambda: client)
    stream = events(ask(live_mode).text)

    (request,) = seen
    assert request.url.path == "/v1/messages"
    assert request.url.params["beta"] == "true"
    assert "server-side-fallback-2026-07-01" in request.headers["anthropic-beta"]
    sent = json.loads(request.content)
    assert sent["fallbacks"] == "default"
    assert sent["output_config"] == live.OUTPUT_CONFIG

    message = "".join(data["delta"] for name, data in stream if name == "message")
    assert message == REPLY["message"]
    assert dict(stream)["suggestions"]["served_by"] == "claude-opus-4-8"
    assert dict(stream)["suggestions"]["fallback"] is True
    assert app_module.budget.spent == (1000 + 20) + (1100 + 200)
