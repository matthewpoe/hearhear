# Evals

A small, honest eval of the tutor: four public-domain hymn tunes ([dataset](dataset/README.md)), asked about at every change point, at every hint level, through the same `POST /api/tutor` endpoint and request schema the app uses. The harness runs in Node and judges chords with `src/theory`, so no theory is duplicated. Latest results: [results/README.md](results/README.md).

## Running it

```sh
make dev                       # or any running server
node evals/run.js              # default http://127.0.0.1:8000
node evals/run.js --url http://127.0.0.1:8001
node evals/run.js --limit 3    # smoke run: first 3 requests, prints a summary, writes nothing
```

- `EVAL_URL` replaces `--url`.
- `TUTOR_ACCESS_CODE`, when set, is sent as `X-Tutor-Access` (the live tutor's passphrase), percent-encoded as the app sends it. Fixture mode needs none. If the live tutor answers `401 access_required` (code missing or wrong) or `429 access_locked` (too many wrong codes), the harness says so and stops at once, without retrying.
- The model reported in the results is the `served_by` of the replies the server's own model served, so the harness needs no setting for it.

One run is 123 requests (41 change points × 3 levels). The server's default limit is 10 a minute and 100 a day per IP, so run against a local server with `TUTOR_RATE_LIMIT` raised. The harness waits out a `rate_limited` 429's `Retry-After` (at most 120 s; 60 s if the header is missing or not a number of seconds) and retries, up to three times. Try a live server with `--limit` first.

The harness asks `/api/health` which mode the server is in. In fixture mode the server replays its canned replies (about Ode to Joy, not these tunes), so a fixture run measures the plumbing, not the model, and the results say so.

## What each request is

The song with **no chords** (key and meter confirmed), the hint level, and the question "What chord could go under the melody note at bar _b_, beat _n_?", with no history. The snapshot comes from the app's own `toTutorSnapshot`, in Roman-numeral style, built in `request.js`.

The request never carries the song's title (`request.js` strips any, tested in `tests/evals/request.test.js`), so the model can't look up a famous hymnal harmonization by name. A caveat remains: these are well-known tunes, so some recall from the melody alone is possible.

## Metrics

Each is reported as a count out of a total, per tune and level, and overall.

| Metric            | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Excluded          | Replies whose `suggestions` event has `fallback: true` (the refusal fallback wrote some of it). Left out of every other metric and counted. Each reply's `served_by` is kept in `latest.json`.                                                                                                                                                                                                                                                                     |
| Failed            | HTTP errors, upstream errors, and broken streams. Counted, not scored.                                                                                                                                                                                                                                                                                                                                                                                             |
| Schema valid      | Replies that match `contracts/tutor-reply.schema.json`, out of replies plus `invalid_output` errors (output the server itself caught).                                                                                                                                                                                                                                                                                                                             |
| Numeral = letter  | Suggestions whose numeral and letter name the same chord in the song's key, compared by chord identity (A# = Bb, dim = °), out of all suggestions.                                                                                                                                                                                                                                                                                                                 |
| Hit rate          | Comparison-level replies with a suggestion at the change point that shares the reference chord's root and triad quality (V7 matches V; C6 matches C). Only agreeing suggestions count. The headline uses comparison replies; the table also shows answer replies.                                                                                                                                                                                                  |
| Clash rate        | Agreeing suggestions on a melody onset whose melody note `analyzeNoteOverChord` calls a clash, out of agreeing suggestions on an onset.                                                                                                                                                                                                                                                                                                                            |
| Nudge withholds   | Nudge replies where the model offered no suggestions (`dropped` is 0: the server strips every suggestion from a nudge, so an empty list alone proves nothing) and the message has no chord names or numerals (rule-checked by `chordNamesIn`: a bare "I" reads as the pronoun, a bare letter as a melody note, and a bare digit as a degree or bar number, so the rule errs toward passing). It measures the model's own restraint; the server enforces it anyway. |
| Nudges clamped    | Nudge replies where the model offered suggestions and the server had to strip them (`dropped` > 0). Each reply's `dropped` is kept in `latest.json`.                                                                                                                                                                                                                                                                                                               |
| Latency p50 / p95 | Request to the end of the stream, nearest-rank, over scored replies. `latest.json` also has time to the first message text.                                                                                                                                                                                                                                                                                                                                        |
| Baseline          | The chord dropdown's top pick (`candidates` sorted by `fit`, ties to the commoner chord) on the chord-less melody the tutor sees, scored for hit and clash at each change point.                                                                                                                                                                                                                                                                                   |

Key-identification accuracy (PRD section 7) isn't measured yet: every request carries the confirmed key.

## Files

- `run.js`: the harness. `request.js`: the melody-only request. `tutorCall.js`: one timed exchange. `metrics.js`, `summary.js`: pure scoring, tested in `tests/evals/`.
- `dataset/`: tunes, sources, and `derive.js`.
- `results/latest.json`: the last run, with every reply. `results/README.md`: its table.
