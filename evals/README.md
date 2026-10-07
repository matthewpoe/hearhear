# Evals

A small, honest eval of the tutor: four public-domain hymn tunes ([dataset](dataset/README.md)), asked about at every change point, at every hint level, through the same `POST /api/tutor` endpoint and request schema the app uses. The harness runs in Node and judges chords with `src/theory`, so no theory is duplicated. Latest results: [results/README.md](results/README.md).

## Running it

```sh
make dev                       # or any running server
node evals/run.js              # default http://127.0.0.1:8000
node evals/run.js --url http://127.0.0.1:8001
```

- `EVAL_URL` replaces `--url`.
- `TUTOR_MODEL` names the model under test in live mode (default `claude-opus-5-5`); set it to the server's `TUTOR_MODEL`.
- `TUTOR_ACCESS_CODE`, when set, is sent as `X-Tutor-Access` (the live tutor's passphrase). Fixture mode needs none.

One run is 123 requests (41 change points × 3 levels). The server's default limit is 10 a minute and 100 a day per IP, so run against a local server with `TUTOR_RATE_LIMIT` raised. The harness waits out a 429's `Retry-After` and retries, up to three times.

The harness asks `/api/health` which mode the server is in. In fixture mode the server replays its canned replies (about Ode to Joy, not these tunes), so a fixture run measures the plumbing, not the model, and the results say so.

## What each request is

The song with **no chords** (key and meter confirmed), the hint level, and the question "What chord could go under the melody note at bar _b_, beat _n_?", with no history. The snapshot comes from the app's own `toTutorSnapshot`, in Roman-numeral style.

## Metrics

Each is reported as a count out of a total, per tune and level, and overall.

| Metric            | Definition                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Excluded          | Replies whose `suggestions` event has `served_by` other than the model under test (the refusal fallback). Left out of every other metric and counted. In fixture mode the model under test is `"fixture"`.                                                        |
| Failed            | HTTP errors, upstream errors, and broken streams. Counted, not scored.                                                                                                                                                                                            |
| Schema valid      | Replies that match `contracts/tutor-reply.schema.json`, out of replies plus `invalid_output` errors (output the server itself caught).                                                                                                                            |
| Numeral = letter  | Suggestions whose numeral and letter name the same chord in the song's key, compared by chord identity (A# = Bb, dim = °), out of all suggestions.                                                                                                                |
| Hit rate          | Comparison-level replies with a suggestion at the change point that shares the reference chord's root and triad quality (V7 matches V; C6 matches C). Only agreeing suggestions count. The headline uses comparison replies; the table also shows answer replies. |
| Clash rate        | Agreeing suggestions on a melody onset whose melody note `analyzeNoteOverChord` calls a clash, out of agreeing suggestions on an onset.                                                                                                                           |
| Nudge withholds   | Nudge replies with no suggestions and no chord names or numerals in the message (rule-checked by `chordNamesIn`: a bare "I" reads as the pronoun, a bare letter as a melody note, and a bare digit as a degree or bar number, so the rule errs toward passing).   |
| Latency p50 / p95 | Request to the end of the stream, nearest-rank, over scored replies. `latest.json` also has time to the first message text.                                                                                                                                       |
| Baseline          | The chord dropdown's top pick (`candidates` sorted by `fit`, ties to the commoner chord), scored for hit and clash at each change point.                                                                                                                          |

Key-identification accuracy (PRD section 7) isn't measured yet: every request carries the confirmed key.

## Files

- `run.js`: the harness. `tutorCall.js`: one timed exchange. `metrics.js`, `summary.js`: pure scoring, tested in `tests/evals/`.
- `dataset/`: tunes, sources, and `derive.js`.
- `results/latest.json`: the last run, with every reply. `results/README.md`: its table.
