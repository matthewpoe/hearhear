# Recorded lessons

Real exchanges with the live tutor, saved so the demo can play them back with no API key and no passphrase. `plan.json` lists what to record; `recorded/<id>.json` holds what came back.

## Recording them

```sh
export ANTHROPIC_API_KEY=… TUTOR_ACCESS_CODE=…   # in your shell, never a file
make capture-lessons                              # asks first; CONFIRM=1 skips the question
```

It prints how many requests the plan sends and a rough size (8 requests, a few cents each), asks, then starts a local live server on a free port (`TUTOR_RATE_LIMIT="60/minute;1000/day"`, `TUTOR_DAILY_TOKEN_BUDGET=2000000`), records each exchange, and stops the server. To record from the deployed site instead, set `TUTOR_URL=https://…`: then only `TUTOR_ACCESS_CODE` is needed, sent as the passphrase header, and no server starts. Neither value is read from `.env` or printed.

`node scripts/capture-lessons.js --url … --only <id>` re-records one exchange. A follow-up re-recorded alone takes its history from the saved file of the exchange it follows.

## The plan

Each exchange in `plan.json` gives the song, whether the key is committed or still provisional, whether key labels are hidden (`key_hidden`), the chords placed (by bar, beat, and numeral), the hint level, and the question. The script builds the snapshot through the app's own song store and `toTutorSnapshot`, so the request is the one the app would send. `follows` names an earlier exchange: its question and the tutor's recorded reply become this exchange's history.

## What a recorded file holds

The shape of `contracts/fixtures/tutor/*.json` (`name`, `song`, `description`, and `events` as `{ event, data, delayMs }`, where `delayMs` is the real wait before each event), plus `request`, `served_by`, `fallback`, `model`, `date`, and `follows` for a follow-up.

The script saves only clean replies. A reply with `fallback: true`, an `error` event, an HTTP error, a suggestion that fails the content checks, or, when key labels are hidden, a message that names the key (the tonic as a note or chord name, or a phrase like "E minor") is reported and not saved, and the run moves on; a follow-up whose earlier exchange was not saved is skipped. A `401 access_required` or `429 access_locked` stops the run. `scripts/validate-content.js` (part of `make check`) applies the same checks to every saved file: each suggestion on a note onset, numeral and letter agreeing in the song's key, no error, no fallback, and no named key behind hidden labels.

## Playing them back

`X-Tutor-Fixture: lesson:<id>` replays `recorded/<id>.json` with its recorded pacing, in fixture and live mode alike, before the passphrase gate and the budget: they are committed files, so they cost nothing and need no passphrase (contracts/tutor-sse.md, "Recorded lessons"). An id that isn't recorded gets `404 lesson_not_found`. The guided path (`content/guided-path.json`) names the lesson its tutor step asks, and sends the header only when that lesson is recorded; otherwise it asks the tutor as anyone would. The Docker image copies this folder (kept by `recorded/.gitkeep` while it's empty). Commit a lesson before, or in, the deploy that names it: the app names only lessons in its own build, and the server answers any other name with a 404. A replay pauses at most 1.5 s between events, whatever the file's `delayMs`.
