# Tutor streaming protocol

`POST /api/tutor` with a JSON body matching `tutor-request.schema.json`. The response is `text/event-stream`. The client reads it with `fetch` and a stream reader, because `EventSource` is GET-only.

Claude's reply is constrained by structured outputs (`output_config.format` set to `tutor-reply.schema.json`), so the stream is JSON text. The proxy parses the accumulating text with `pydantic_core.from_json(..., allow_partial="trailing-strings")`, which includes the unfinished string at the end, so `message` text streams as Claude writes it rather than one whole value at a time. It forwards new `message` text as deltas and validates the full reply with Pydantic at the end. Pydantic is needed because the API does not enforce numeric or length bounds.

Live requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). If the requested model declines, a fallback model finishes the reply inside the same stream: message text already sent stays, and the fallback model continues from it. The `suggestions` event's `served_by` says which model served the reply, and `fallback` says whether a fallback model wrote any of it.

## Access code (live mode only)

In live mode (`TUTOR_MODE=live`), every request must carry the passphrase in an `X-Tutor-Access` request header. It is a header, never a body field, so it stays out of `tutor-request.schema.json` and out of the snapshot Claude sees. The client percent-encodes the value (header values must be Latin-1, and a passphrase may not be); the server decodes it before comparing. The server reads the expected code from `TUTOR_ACCESS_CODE` and refuses to start in live mode when that is unset or has no letters or digits. Both sides are compared after casefolding and removing everything but letters and digits, so `Treble Clef 42`, `treble-clef-42`, and `TREBLECLEF42` all match. The comparison is constant-time, and neither the sent nor the expected code ever appears in a log line, error message, or response.

A missing code (or one with no letters or digits) and a wrong code both return `401 access_required`. Wrong codes, but not missing ones, count toward a per-IP lockout: after 5 wrong codes in 10 minutes, every live request from that IP returns `429 access_locked`, even with the right code, until the oldest of those guesses is 10 minutes old. That limit is separate from the tutor's `rate_limited`, which counts every request.

**Fixture mode has no gate.** It ignores `X-Tutor-Access`, so CI, local development, and the recorded demo need no code.

## Errors before the stream

Every response to `POST /api/tutor` that passes validation and the rate limit carries an `X-Request-Id` header, a 32-character hex id that also appears in the server's logs for that request. The 401, `access_locked` 429, and 503 below carry it too; 413, 422, and `rate_limited` 429 are refused before a request id exists.

Non-stream failures return JSON with no stream at all: the client gets this status and body instead of `text/event-stream`. Each one carries `{ "error": { "code", "message" } }`:

| Status | `code`            | When                                                                                                                      | Implemented |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 413    | `too_large`       | Body over 128 KB                                                                                                          | Stream E    |
| 422    | `invalid_request` | Fails `TutorRequest` validation                                                                                           | Phase 0     |
| 429    | `rate_limited`    | Per-IP limit. Carries `Retry-After`, in whole seconds until the limit resets.                                             | Stream E    |
| 401    | `access_required` | Live mode only: `X-Tutor-Access` is missing or wrong. The panel asks for the code and offers the recorded lessons.        | Stream E2   |
| 429    | `access_locked`   | Live mode only: this IP sent 5 wrong codes in 10 minutes. Carries `Retry-After`, in whole seconds until it may try again. | Stream E2   |
| 503    | `over_budget`     | Daily token budget spent, checked before Claude is called. The client switches to cached lessons. Carries `X-Request-Id`. | Stream E    |

Checks run in that order: body cap, validation, rate limit, then in live mode the access lockout, the access code, and the budget. A request turned away at any of them never reaches Claude, and an unauthenticated client never learns whether the budget is spent.

## Events, in order

| Event         | Data                                                                                                                                                | Count                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message`     | `{ "delta": string }`                                                                                                                               | 0..n. Text appended to the tutor's message as Claude streams it.                                                                                                                   |
| `suggestions` | `{ "hint_level", "suggestions": Suggestion[], "snapshot_version": int, "dropped": int, "withheld": int, "served_by": string, "fallback": boolean }` | Exactly 1 on success. Holds the server-validated suggestions; `dropped` counts only the ones that failed validation, and `withheld` the valid ones the hint-level clamp held back. |
| `error`       | `{ "code": "upstream" \| "invalid_output" \| "unanswerable" \| "over_budget", "message": string }`                                                  | 0..1. Replaces `suggestions` when the stream fails midway. Any message text already shown stays.                                                                                   |
| `done`        | `{}`                                                                                                                                                | Exactly 1, always last.                                                                                                                                                            |

The `suggestions` event's `hint_level` and `suggestions` match `tutor-reply.schema.json`. `snapshot_version` echoes `request.snapshot.version`; Claude never sees or produces it.

`served_by` is the model that produced the reply, as the API reported it: `TUTOR_MODEL` normally, a fallback model's id when the refusal fallback served it, and `"fixture"` in fixture mode. `fallback` is `true` when the refusal fallback served any of the reply, and always `false` in fixture mode. The eval harness excludes replies with `fallback: true` and reports how many it excluded. It keys on the flag, not on whether `served_by` equals `TUTOR_MODEL`: the flag records what happened, while a string comparison would also exclude a reply the requested model served if the API reported it under a different id (a dated snapshot or an alias).

**Hint-level clamp.** Withholding by default is enforced by the proxy, not only by the system prompt, on both the live and fixture paths:

- The proxy withholds every suggestion when the request's `hint_level` is `nudge`, when `snapshot.key.provisional` is true, or when `snapshot.key_hidden` is true (key labels hidden, a demo before the guess, where a letter-name chord would give the key away). `suggestions` is then `[]`, and the withheld ones are counted in `withheld`, not `dropped`: holding a suggestion back is the design working, not a failure, so the client says nothing about it.
- If the reply claims a higher `hint_level` than the request asked for (`nudge` < `comparison` < `answer`), the event reports the requested level. A lower claim is reported as is.

Each clamp is logged as counts only, never text: `withheld_hidden`, `withheld_provisional`, and `withheld_nudge` (each withheld suggestion counted under the first reason that applies, in that order), and `hint_clamped`. Live mode puts them on the `tutor_live` line; fixture mode logs a `tutor_clamped` line when anything was clamped. The system prompt also tells Claude not to name or hint at a hidden key.

**Error codes.** `upstream`: Claude couldn't be reached, or the stream broke. `unanswerable`: the reply stopped unfinished because Claude declined (`stop_reason` `refusal`, after the refusal fallback also declined) or ran out of room (`max_tokens`, `model_context_window_exceeded`); its message is "The tutor couldn't answer that one. Try asking another way." `invalid_output`: the reply is genuinely malformed (incomplete JSON, a message or hint level that fails validation, or an unexpected `stop_reason`). `over_budget`: as in the table above.

**Staleness.** The client captures the song when it sends the request, builds the snapshot from it, and validates the reply against that same song. It stores the suggestions with that song's version, which equals `snapshot_version` by construction, and marks them stale once the current song's version differs. It also re-validates each suggestion: the numeral parses, the numeral and letter agree in the captured song's key, and the bar and beat land on a note onset. It drops and counts the failures.

## Fixtures

`fixtures/tutor/*.json` are **shape fixtures** for development and tests: `{ "name", "song", "description", "events": [{ "event", "data", "delayMs" }] }`. `song` is the id of the bundled song the fixture talks about. CI checks that every suggestion sits on a note onset in that song, and that its numeral and letter agree in the song's key. They are hand-written, and they are not the demo's cached lessons. The cached lessons are real captured Claude output, owned by Stream G under `content/`. In `TUTOR_MODE=fixture`, the proxy replays the fixture that matches the request's `hint_level`, and `over-budget` or `malformed` when a test asks for them. It fills in `snapshot_version` and `served_by` and applies the hint-level clamp, so a fixture's `suggestions` event has the same shape as a live one.
