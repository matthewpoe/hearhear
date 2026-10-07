# Song limits and other review follow-ups (PRs 37–47)

Format: **date — decision.** Why. _Rejected:_ alternatives.

## Song limits in one place

- **2026-10-07 — `src/store/songLimits.js` reads every song bound from `contracts/song.schema.json`:** the title's 120 characters, the 30–240 tempo range, the 400-note cap, the lyric's 40 characters, and the 1–3 swing range. `take.js`, `song.js`, `snapshot.js`, and `persist.js` import them instead of repeating the numbers. The schema already had each bound, so none was invented. _Rejected:_ a hand-written constants file (a second source that can drift from the schema).
- **2026-10-07 — The 96 BPM default is the schema's `tempo.default`.** The schema had no default, so one was added (an annotation; it changes no validation). `rhythm.js` reads it as `DEFAULT_TEMPO` and derives its 625 ms default beat from it; `songLimits.js` re-exports that one constant for `take.js` and `emptySong`. The theory core can't import from the store (an ESLint rule keeps it pure), so the constant is defined on the theory side and the store re-exports it. _Rejected:_ defining it in `songLimits.js` and importing it into `rhythm.js` (breaks the theory core's import rule); passing the default beat into `guessRhythm` (widens its API for one constant).
- **2026-10-07 — One title rule, `isTitle` in `songLimits.js`, for `rename` and `persist.js`'s recall check.** Both already counted code points, as JSON Schema counts `maxLength`; now they share the code instead of each restating it (#44's `isText` in `persist.js` is gone). `persist.js`'s other checks already read the schema's rule objects directly (#44), so they stay. `isLyric` now counts code points too, matching the schema and `validate-content` (Ajv), where it had counted UTF-16 units. _Rejected:_ UTF-16 length anywhere (disagrees with the schema and Ajv).
- **2026-10-07 — The server keeps its own constants, checked by a test.** `server/tests/test_song_limits.py` asserts that `MAX_TITLE_CHARS`, `MAX_NOTES`, and the snapshot's tempo and swing bounds equal the song schema's. _Rejected:_ having `models.py` read the song schema at import (the request contract is generated from the models; a test keeps the models the single source for it and still catches drift).

## Forgetting a draft

- **2026-10-07 — `installPersistence` installs a `forget(id)` that cancels a pending save of that song before removing its saved copy.** The song store exposes it as `song.forget(id)`, beside `open()`, through the same hooks persist.js already installs, so the recorder needs no new wiring and works the same in tests and the app. `recorder.js` calls it for a re-take's draft directly; the `queueMicrotask` that waited for the save to run first is gone, and so is `shelf.forget`, which only the recorder used. _Rejected:_ passing persist's return value to the recorder (the recorder is built at import, before `main.js` installs persistence, so it would need a late-bound setter).

## Swing in the tutor snapshot

- **2026-10-07 — The snapshot sends the song's optional `swing` as-is, and leaves it out when the song has none.** The request model takes it as an optional number from 1 to 3, the song schema's range. The prompt already renders the snapshot as JSON data with `exclude_none`, so `swing` reaches Claude as a plain field with no prompt change. It stays even while the key is hidden: a swing ratio says nothing about the key. _Rejected:_ a sentence in the system prompt about swing (out of scope here; the data is enough for the tutor to mention feel).
