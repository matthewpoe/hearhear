# Tutor streaming protocol

`POST /api/tutor` with a JSON body matching `tutor-request.schema.json`. The response is `text/event-stream`. The client reads it with `fetch` and a stream reader, because `EventSource` is GET-only.

Claude's reply is constrained by structured outputs (`output_config.format` set to `tutor-reply.schema.json`), so the stream is JSON text. The proxy parses the accumulating text with `pydantic_core.from_json(..., allow_partial=True)`, forwards new `message` text as deltas, and validates the full reply with Pydantic at the end. Pydantic is needed because the API does not enforce numeric or length bounds.

Non-stream failures return JSON before any stream starts. Each one carries `{ "error": { "code", "message" } }`:

| Status | `code`            | When                                                             | Implemented |
| ------ | ----------------- | ---------------------------------------------------------------- | ----------- |
| 413    | `too_large`       | Body over 128 KB                                                 | Stream E    |
| 422    | `invalid_request` | Fails `TutorRequest` validation                                  | Phase 0     |
| 429    | `rate_limited`    | Per-IP limit (slowapi)                                           | Stream E    |
| 503    | `over_budget`     | Daily token budget spent. The client switches to cached lessons. | Stream E    |

## Events, in order

| Event         | Data                                                                                     | Count                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `message`     | `{ "delta": string }`                                                                    | 0..n. Text appended to the tutor's message as Claude streams it.                                                |
| `suggestions` | `{ "hint_level", "suggestions": Suggestion[], "snapshot_version": int, "dropped": int }` | Exactly 1 on success. Holds the server-validated suggestions; `dropped` counts the ones that failed validation. |
| `error`       | `{ "code": "upstream" \| "invalid_output" \| "over_budget", "message": string }`         | 0..1. Replaces `suggestions` when the stream fails midway. Any message text already shown stays.                |
| `done`        | `{}`                                                                                     | Exactly 1, always last.                                                                                         |

The `suggestions` event's `hint_level` and `suggestions` match `tutor-reply.schema.json`. `snapshot_version` echoes `request.snapshot.version`; Claude never sees or produces it. The client marks suggestions stale when the song's version has moved past `snapshot_version`. It also re-validates them: the numeral parses, the numeral and letter agree in the current key, and the bar and beat land on a note onset. It drops and counts the failures.

## Fixtures

`fixtures/tutor/*.json` are **shape fixtures** for development and tests: `{ "name", "description", "events": [{ "event", "data", "delayMs" }] }`. They are hand-written, and they are not the demo's cached lessons. The cached lessons are real captured Claude output, owned by Stream G under `content/`. In `TUTOR_MODE=fixture`, the proxy replays the fixture that matches the request's `hint_level`, and `over-budget` or `malformed` when a test asks for them.
