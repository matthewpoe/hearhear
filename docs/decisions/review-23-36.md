# Fixes from the review of PRs 23–36

Four items from Matthew's review of PRs 23–36, on `fix/review-23-36`.

## 1. persist.js reads the song schema

- `src/store/persist.js` imports `contracts/song.schema.json` with a JSON import attribute (`with { type: "json" }`), which the app already uses for content files. Vite bundles it and node:test reads it, with no Ajv in the browser.
- Every pattern, enum, and bound in `isSong` now comes from the schema. Two schema rules that persist.js had skipped are now checked as well: the chord's `noteId` pattern and the 400-item caps on notes and chords.
- **letters.js and numerals.js keep their tables.** They aren't derived from the schema. Each table says more than a type list: the suffix spellings a type accepts, and a type's numeral case and suffix. Deriving them would mean a second table keyed by schema type. Instead, `SUFFIX_TYPES` and `NUMERAL_FORMS` are exported, and `tests/theory/chordTypes.test.js` holds each to exactly the schema's chord types (no missing ones, no extras, no duplicates in the numeral table).
- `tests/store/persistSchema.test.js` runs Ajv against persist.js's recall for every schema chord type plus near misses, at each numeric bound (min − 1, min, max, max + 1, and a fraction), and for beat units, modes, tonics, roots, and title lengths. The expected answer is "the schema accepts it and `validateSong` passes", since recall also runs `validateSong`. One case can't separate the two checks: a `pickupTicks` of 144 is the schema's maximum, but `validateSong` rejects it in 4/4.

## 2. One rule for "a field owns this key"

- `src/lib/fieldOwnsKey.js` replaces NumberRow's `isFormField` and historyShortcut's `isTextField`. It follows NumberRow's rule, the stricter one: text fields, selects, sliders, and editable content own every key, and a radio or checkbox owns only its arrows.
- **Behavior change:** Cmd/Ctrl-Z with a select or slider focused (the toolbar's re-key select, say) now goes to the field, not the song's undo history. Arrows and digits there already went to the field. With a radio, checkbox, or button focused, undo works as before.
- The helper is duck-typed (any object with `closest`), so it runs in node:test without a DOM.

## 3. The masthead cut-off

- **Found:** two focus calls without `preventScroll`. One is in `ChordDropdown.svelte`'s `close()`, which hands focus back to the note that opened the dropdown. The other is in `Staff.svelte`, where the redraw refocuses the note that had focus. When the note wasn't fully in view (above the window, or under the dock's scroll padding), either call scrolled the page. Both now pass `preventScroll: true`. LabelControls is untouched.
- **What the 17 px and 62 px were:** the overnight screenshot script clicks with Playwright locators, which scroll their target into view before clicking. Probes at 1280×800 showed the page moving before the pointer went down, and then the plain focus call scrolling it again. In the "V and I" shot, part of the movement is also the guess result's own smooth scroll after the D chip (from PR #35, intended). Clicked in place, a label style didn't move the page at all, so there was nothing to fix there.
- **The check:** `tests/e2e/scroll.spec.js` runs at 1280×800 and clicks with `page.mouse`, as a user does. It opens the dropdown on bar 4's held E, scrolls the note just off the top with the dropdown still open, picks the first option, and asserts `window.scrollY` is unchanged. Without the fix it fails (241 expected, 179 received). With the fix it passes.
- Arrow-key moves between notes still scroll the focused note into view, which they should.

## 4. Eval concurrency

- `evals/run.js` builds the full request list first, then sends it through a pool of `--concurrency` workers (default 4, the server's `TUTOR_MAX_CONCURRENT`). Each record is stored at its request's index, and the per-tune summaries and baseline are computed after the run from the requests actually sent, so `--limit` gives the same records and baseline counts as before.
- An access refusal (401/429) still calls `process.exit(1)` from inside the worker, which ends the run with the other requests still in flight. Against a stand-in server that refuses everything after 200 ms, the run sent 4 requests (one per worker), printed the access message, and exited 1.
- **Fixture check:** I ran the full fixture eval (123 requests) at `--concurrency 1` and at the default 4 against a local fixture server. Apart from `ms`, `firstDeltaMs`, `latencyMs`, and the run date, the two `latest.json` files were identical. Both differ from the committed `latest.json`, because the fixture replies' text has changed since that file was generated. So the results files were restored and not committed.
