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

The script saves only clean replies. A reply with `fallback: true`, an `error` event, an HTTP error, or a suggestion that fails the content checks is reported and not saved, and the run moves on; a follow-up whose earlier exchange was not saved is skipped. A `401 access_required` or `429 access_locked` stops the run. `scripts/validate-content.js` (part of `make check`) applies the same checks to every saved file: each suggestion on a note onset, numeral and letter agreeing in the song's key, no error, no fallback.

## Not wired in yet

The app doesn't play recorded lessons yet: the guided-path runner that uses them is separate work. The hook is the fixture replay: `replay_fixture` in `server/hearhear/tutor.py` already sleeps each event's `delayMs` and plays the events in order, so it can serve a file from `content/lessons/recorded/` in place of a shape fixture.
