# Stream E: tutor backend decisions

Format: **date — decision.** Why. _Rejected:_ alternatives.

## Rate limit and client IP

- **2026-10-07 — The rate limit keys on the rightmost `X-Forwarded-For` entry, read by the app itself, with the socket address as a fallback.** Verified against the deployed app: one `curl` to `/api/health` with `X-Forwarded-For: 1.2.3.4` reached uvicorn as the caller's real IP (Railway's HTTP log `srcIp` and uvicorn's access log agreed, and neither showed 1.2.3.4). Railway's edge therefore replaces the client's header with one entry it writes. The Dockerfile runs uvicorn with `--forwarded-allow-ips '*'`, which takes the **leftmost** entry for `request.client`. That is correct today only because Railway overwrites the header. Reading the rightmost entry stays correct if Railway, or a CDN in front of it, ever starts appending. _Rejected:_ slowapi's `get_remote_address` (reads `request.client`, so it inherits uvicorn's leftmost choice); `X-Real-IP` (Railway documents it, but I could not verify that a client-sent value gets overwritten).
- **2026-10-07 — The limit is `10/minute;100/day` per IP, overridable with `TUTOR_RATE_LIMIT`.** Ten a minute covers a fast back-and-forth, and a hundred a day covers a long session. The env override exists for the eval harness (Stream H) and tests, which need more. _Rejected:_ a hard-coded limit (evals would hit it); exempting localhost (exemptions are easy to get wrong behind a proxy).
- **2026-10-07 — The rate limit counts only requests that pass validation.** slowapi runs as a route decorator, after FastAPI has parsed the body, so the order is 413, 422, 429, 503. Invalid requests cost nothing upstream. _Rejected:_ `SlowAPIMiddleware` (it is a `BaseHTTPMiddleware`, which wraps streaming responses; the Phase 0 review moved security headers to pure ASGI to avoid exactly that).

## Body cap

- **2026-10-07 — A pure ASGI middleware enforces the 128 KB cap on `/api/` requests.** A declared `Content-Length` over the cap is refused unread. A chunked body is counted as it arrives and refused once past the cap, so a request without `Content-Length` can't get around it. A body under the cap is replayed to the app. It sits inside the security-headers middleware, so the 413 carries the CSP too. _Rejected:_ checking `Content-Length` only (chunked bodies bypass it); relying on Railway's edge (it caps headers at 32 KB, not bodies).

## Live mode

- **2026-10-07 — The structured-output schema is `anthropic.transform_schema(TutorReply)`, built from the same Pydantic model that generates `contracts/tutor-reply.schema.json`.** The API rejects or ignores some JSON Schema keywords (`maxLength`, `minimum`, `maximum`, `pattern`, `maxItems`). The SDK's transform moves them into each field's description, so Claude still sees the bounds, and Pydantic enforces them on the full reply. It is the same transform `messages.parse` uses. _Rejected:_ sending the committed contract file as is (it carries keywords the API won't take); a hand-written copy (contracts are never hand-copied).
- **2026-10-07 — The partial parse uses `from_json(..., allow_partial="trailing-strings")`, not `allow_partial=True`.** With `True`, an unfinished string is dropped, so the message would arrive only when Claude closes the whole field, in one piece at the end. `trailing-strings` includes the unfinished string, so the message streams as it is written. Split escapes (`\"`, `\n`, `é`) are held back until they are complete; tests feed fixture replies one character at a time. Deviation from the brief's wording, not its intent.
- **2026-10-07 — Suggestions are validated one by one; invalid ones are dropped and counted, and so is any suggestion past eight.** One bad suggestion never sinks the reply. A reply whose JSON is incomplete, or whose message or hint level fails validation, ends the stream with `error: invalid_output`, and the message text already shown stays, per `tutor-sse.md`. A `stop_reason` other than `end_turn` (`max_tokens`, `refusal`) is also `invalid_output`.
- **2026-10-07 — `max_tokens` is 8,000 and effort is `medium`, set explicitly.** Opus 5.5 always thinks, and thinking counts against `max_tokens`. A full reply is about 2,500 tokens, so 8,000 leaves room to think and caps one turn at about $0.16 of output. `medium` is the model's default; setting it pins the behavior the evals measure. _Rejected:_ 64,000 (the SDK default for streaming; no tutor turn needs it, and it widens the per-request spend); `low` effort (unmeasured; the evals should decide).
- **2026-10-07 — No server-side refusal fallback.** The Claude API skill suggests `fallbacks: "default"` for Opus 5.5. It needs the beta namespace and can switch models mid-turn, which would make the eval numbers describe two models. A music tutor rarely trips safety classifiers, and a refusal surfaces as `invalid_output` with a retry. Proposed to Matthew rather than built.
- **2026-10-07 — The client is `AsyncAnthropic(max_retries=1, timeout=120 s read, 5 s connect)`, built at startup in live mode.** A client that can't be built fails the deploy's health check instead of the first question. One retry keeps a failing turn under Railway's 5-minute idle cutoff.

## Budget

- **2026-10-07 — Usage is read from the stream events (`message_start`, `message_delta`) and charged in a `finally`.** A failed stream or a client that disconnects still charges the input tokens and whatever output was reported. Cache reads and writes count as input. `get_final_message()` would only report usage after a clean finish. _Rejected:_ charging only on success (a client could disconnect early to avoid the budget).
- **2026-10-07 — Over budget means today's spend has reached the limit; the reply that crosses it finishes.** One in-flight reply can overshoot by at most `max_tokens` plus its input. The Console spend limit is the hard cap. _Rejected:_ reserving `max_tokens` up front (more state for little gain at one worker).
- **2026-10-07 — The budget resets at midnight UTC** and on redeploy (it is in memory), as the PRD accepts.

## Prompt and injection posture

- **2026-10-07 — Each request becomes one user message: the snapshot, history, and question as JSON inside `<snapshot>`, `<history>`, and `<student_message>`, with `<` and `>` escaped as `<` and `>`.** No field can close its tag, and the student's words still reach Claude exactly. Only validated closed-set values (hint level, label style, key provisional) appear outside the tags. History is folded into the data rather than replayed as assistant turns, so a client-edited "tutor" turn can't speak in the tutor's voice. This also avoids a last-turn assistant message, which Opus 5.5 rejects as prefill. _Rejected:_ mapping history to user and assistant roles (gives forged tutor turns the model's own voice).
- **2026-10-07 — `snapshot.version` is removed from what Claude sees,** per `tutor-sse.md` ("Claude never sees or produces it"); the server echoes it in the `suggestions` event.
- **2026-10-07 — A provisional key is handled in the prompt: don't name the key, tonic, or mode, and return no suggestions.** Letter-name suggestions would give the key away during a demo. This is prompt-level only; see proposed additions for server-side enforcement. Nudge-level replies also return no suggestions, which matches the nudge fixture.
- **2026-10-07 — No prompt caching yet.** The system prompt is about 1,000 tokens, under Opus's minimum cacheable prefix, so a cache breakpoint would do nothing. Revisit if the prompt grows.

## Logging

- **2026-10-07 — One JSON line per event on stdout** (`tutor_live`, `tutor_fixture`, `tutor_invalid_reply`, `request_rejected`): request id, model, hint level, outcome, dropped count, input and output tokens, budget spent, and duration. Never the question, history, snapshot, reply text, client IP, or any key. The request id goes back to the client as `X-Request-Id`. Rejections at 413 and 429 happen before a request id exists and are logged by code only.

## Code layout

- **2026-10-07 — Small modules by concept:** `prompt.py`, `reply_stream.py` (partial parser and validation), `live.py`, `budget.py`, `limits.py`, `log.py`, `errors.py` (the JSON error envelope, shared by 413, 422, 429, and 503). `tutor.py` keeps SSE framing and fixture mode. Tests share `helpers.py` (snapshot, SSE parser) and a `client` fixture in `conftest.py` that resets the limiter and budget.
