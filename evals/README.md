# Evals

A small, honest eval of the tutor: four public-domain hymn tunes ([dataset](dataset/README.md)), asked about at every change point, at every hint level, through the same `POST /api/tutor` endpoint and request schema the app uses. The harness runs in Node and judges chords with `src/theory`, so no theory is duplicated. Latest results: [results/README.md](results/README.md).

## Running it

```sh
make dev                       # or any running server
node evals/run.js              # default http://127.0.0.1:8000
node evals/run.js --url http://127.0.0.1:8001
node evals/run.js --limit 3    # smoke run: first 3 requests, prints a summary, writes nothing
node evals/run.js --concurrency 1   # one request at a time (default 4)
```

- `--concurrency N` keeps up to N requests in flight; the default, 4, matches the server's `TUTOR_MAX_CONCURRENT`. The first request goes alone, so a wrong access code costs one strike, not one per worker; the pool starts after it. The server frees a slot only when a stream ends, so a pool as wide as the cap can still be answered `503 busy`; the harness waits out its `Retry-After` and retries, as for a rate limit. Replies finish in any order, but `latest.json` keeps them in request order, so a run's results don't depend on the concurrency (only the latencies do). `--limit` still sends the first N requests in that order.

- `EVAL_URL` replaces `--url`.
- `TUTOR_ACCESS_CODE`, when set, is sent as `X-Tutor-Access` (the live tutor's passphrase), percent-encoded as the app sends it. Fixture mode needs none. If the live tutor answers `401 access_required` (code missing or wrong) or `429 access_locked` (too many wrong codes), the harness says so and stops at once, without retrying: the whole run ends, including requests still in flight.
- Any other thrown error (the server going away mid-run, say) also ends the run, and no results are written. HTTP and stream errors the tutor reports are recorded as failed replies instead.
- The model reported in the results is the `served_by` of the replies the server's own model served, so the harness needs no setting for it.

### A live run

```sh
export ANTHROPIC_API_KEY=… TUTOR_ACCESS_CODE=…   # in your shell; never in a file
make eval-live                                   # 3-request smoke run, then asks
make eval-live CONFIRM=1                         # the same, without the question
```

`make eval-live` (`scripts/eval-live.sh`) starts a local server on a free port with `TUTOR_MODE=live`, `TUTOR_RATE_LIMIT="240/minute;4000/day"` (four requests in flight can pass 60 a minute, so the limit leaves room for the default concurrency), and `TUTOR_DAILY_TOKEN_BUDGET=2000000`, taking the key and the access code from the caller's environment only (it fails fast if either is unset, never prints them, and never reads `.env`). It waits for `/api/health` to report live mode, sends `--limit 3`, and prints how to check that smoke run's cost in the Anthropic Console before asking whether to send the full 123 requests. With no terminal to ask, it stops unless `CONFIRM=1` is set. The server stops when the target exits.

One run is 123 requests (41 change points × 3 levels). The server's default limit is 10 a minute and 100 a day per IP, so run against a local server with `TUTOR_RATE_LIMIT` raised. The harness waits out a `rate_limited` 429's or a `busy` 503's `Retry-After` (at most 120 s; 60 s if the header is missing or not a number of seconds) and retries, up to three times. Try a live server with `--limit` first.

The harness asks `/api/health` which mode the server is in. In fixture mode the server replays its canned replies (about Ode to Joy, not these tunes), so a fixture run measures the plumbing, not the model, and the results say so.

## What each request is

The song with **no chords** (key and meter confirmed), the hint level, and the question "What chord could go under the melody note at bar _b_, beat _n_?", with no history. The snapshot comes from the app's own `toTutorSnapshot`, in Roman-numeral style, built in `request.js`.

The request never carries the song's title (`request.js` strips any, tested in `tests/evals/request.test.js`), so the model can't look up a famous hymnal harmonization by name. A caveat remains: these are well-known tunes, so some recall from the melody alone is possible.

## Metrics

Each is reported as a count out of a total, per tune and level, and overall.

| Metric            | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excluded          | Replies whose `suggestions` event has `fallback: true` (the refusal fallback wrote some of it). Left out of every other metric and counted. Each reply's `served_by` is kept in `latest.json`.                                                                                                                                                                                                                                                                                     |
| Failed            | HTTP errors, upstream errors, and broken streams. Counted, not scored.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Schema valid      | Replies that match `contracts/tutor-reply.schema.json`, out of replies plus `invalid_output` errors (output the server itself caught).                                                                                                                                                                                                                                                                                                                                             |
| Numeral = letter  | Suggestions whose numeral and letter name the same chord in the song's key, compared by chord identity (A# = Bb, dim = °), out of all suggestions.                                                                                                                                                                                                                                                                                                                                 |
| Hit rate          | Comparison-level replies with a suggestion at the change point that shares the reference chord's root and triad quality (V7 matches V; C6 matches C). Only agreeing suggestions count. The headline uses comparison replies; the table also shows answer replies.                                                                                                                                                                                                                  |
| Clash rate        | Agreeing suggestions on a melody onset whose melody note `analyzeNoteOverChord` calls a clash, out of agreeing suggestions on an onset.                                                                                                                                                                                                                                                                                                                                            |
| Nudge withholds   | Nudge replies where the model offered no suggestions (`dropped` + `withheld` is 0: the server withholds every suggestion from a nudge, so an empty list alone proves nothing) and the message has no chord names or numerals (rule-checked by `chordNamesIn`: a bare "I" reads as the pronoun, a bare letter as a melody note, and a bare digit as a degree or bar number, so the rule errs toward passing). It measures the model's own restraint; the server enforces it anyway. |
| Nudges clamped    | Nudge replies where the model offered valid suggestions and the server's clamp held them back (`withheld` > 0). Each reply's `dropped` (invalid suggestions) and `withheld` are kept in `latest.json`.                                                                                                                                                                                                                                                                             |
| Latency p50 / p95 | Request to the end of the stream, nearest-rank, over scored replies. `latest.json` also has time to the first message text.                                                                                                                                                                                                                                                                                                                                                        |
| Baseline          | The chord dropdown's top pick (`candidates` sorted by `fit`, ties to the commoner chord) on the chord-less melody the tutor sees, scored for hit and clash at each change point.                                                                                                                                                                                                                                                                                                   |

Key-identification accuracy (PRD section 7) isn't measured yet: every request carries the confirmed key.

## Files

- `run.js`: the harness. `request.js`: the melody-only request. `tutorCall.js`: one timed exchange. `metrics.js`, `summary.js`: pure scoring, tested in `tests/evals/`.
- `dataset/`: tunes, sources, and `derive.js`.
- `results/latest.json`: the last run, with every reply. `results/README.md`: its table.
