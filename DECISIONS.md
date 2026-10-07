# Decisions

Every product and engineering decision, including each time Matthew overrules Claude or a Fable reviewer. Streams log to `docs/decisions/<stream>.md`; Matthew folds those in here.

Format: **date — decision.** Why. _Rejected:_ alternatives.

## From the PRD (planning, Sep 26 – Oct 6, 2026)

Planning ran across three sessions (Sep 26, Sep 27, Oct 6). Entries with a specific date are confirmed by Matthew; entries marked Sep 26–Oct 6 were decided during planning on a day not recorded.

- **2026-10-06 — Theme 1, Exploration & Understanding.** Hear Hear is a teacher that builds understanding of harmony by ear. Theme 2's "real control over iteration" is a supporting point, not a second theme. _Rejected:_ framing as a creative/generative tool.
- **Sep 26–Oct 6 — Teacher, not transcriber.** The user does the ear work; the tool shortens the feedback loop. _Rejected:_ microphone transcription (rhythm is the hard problem, laptop-mic piano is messy, ScoreCloud already does it well).
- **Sep 26–Oct 6 — Ear as verifier.** Every Claude suggestion is structured data the app can play; the user auditions and decides. _Rejected:_ trusting Claude's chord claims as text.
- **Sep 26–Oct 6 — Per-note audition replaces automatic harmonization.** The dropdown plays each candidate under the melody. _Rejected:_ automatic Viterbi harmonization (does the ear work for the user).
- **Sep 26–Oct 6 — Fixed-register, nearest-inversion voicing for audition.** A and B differ only in harmony, never register. Came from a failed A/B test in a real session.
- **2026-10-06 — Svelte 5 (runes) + Vite, plain JS with JSDoc.** Reactive views across one model, default escaping, scoped CSS, built-in transitions. _Rejected:_ plain JS modules; HTMX (the client owns the song model, Claude's output lands as data, not swapped HTML); TypeScript.
- **Sep 26–Oct 6 — FastAPI proxy on Railway; all theory in the browser.** Hover audition never waits on the network; key and prompt stay server-side. No database, no login.
- **Sep 26–Oct 6 — Absolute pitches plus a key hypothesis.** Re-key changes labels only; transpose moves everything; re-bar moves only bar lines.
- **2026-09-27 — The number row is the instrument.** Keys play scale degrees. _Rejected:_ the on-screen keyboard or letter keys as primary input (slow; ties input to a key).
- **Sep 26–Oct 6 — Fixed octave rows.** Number row = home octave (8/9/0 continue up), Q–U one octave below, A–J two below; the same key always plays the same note. _Rejected:_ nearest-note octave placement (no muscle memory possible).
- **Sep 26–Oct 6 — Rhythm guessing with manual fixes.** Most common inter-onset gap = the beat; snap to ½, 1, 1½, 2, 3, 4 beats; one key reverts to quarter notes. _Rejected:_ plain quarter-note entry; real-time swing capture (stretch).
- **Sep 26–Oct 6 — Natural minor on the number row, raised 7th on Shift+7.** Folk and blues melodies move in natural minor.
- **Sep 26–Oct 6 — Nashville counts from the minor tonic (1m, not 6m).** Chord 1 and melody degree 1 are always the same note.
- **Sep 26–Oct 6 — Bauhaus function colors and shapes.** Tonic blue circle, subdominant yellow triangle, dominant red square (Kandinsky, 1923); never color alone.
- **Sep 26–Oct 6 — Claude Opus 5.5 tutor with a forced tool call, streamed (amended below).** Malformed output can't reach playback; the proxy is useless as general Claude.
- **Sep 26–Oct 6 — Public-domain demo tunes only.** Ode to Joy, St. James Infirmary (1930 Gotham Music edition). _Rejected:_ songs from Matthew's own sessions (copyrighted).

## Phase 0 (Oct 6, 2026)

- **2026-10-06 — Duration edits ripple.** `[`, `]`, `.` shift every later note by the change; `/` (make it a rest) keeps the time. _Rejected:_ fixed grid (halving leaves stray rests, doubling overlaps). — Matthew chose Claude's recommendation.
- **2026-10-06 — Alt/Option lowers a degree on every platform, with preventDefault; `-` one-shot flat as a fallback if any Windows Alt+letter can't be cancelled.** Stream D1 verifies on Windows Chrome, Edge, Firefox. _Rejected:_ latch only (two keystrokes per chromatic note); Alt with no fallback.
- **2026-10-06 — No MIDI numbers in the tutor snapshot.** Notes are spelled pitches with degree and duration; Pydantic bounds them with a spelled-pitch pattern limited to octaves 0–8 (the piano's range, without doing theory in Python). Amends the PRD's "MIDI 21 to 108" bound so it agrees with "never raw MIDI". _Rejected:_ sending MIDI for validation only.
- **2026-10-06 — Railway project created by Claude via MCP**, Serverless off.
- **2026-10-06 — Contract resolutions of PRD ambiguities:** the octave control is `transpose(±12)`; the tool's `numeral` field is always canonical Roman (prose follows the user's label style); suggestions anchor by `{bar, beat}` and resolve client-side to the note onset there, dropping and counting misses; deleting a note deletes its chord in the same undoable action.
- **2026-10-06 — Tutor JSON Schemas are generated from Pydantic models** and committed to `contracts/`; CI fails on drift. One source, never hand-copied.
- **2026-10-06 — `node:test` for JS unit tests.** Theory and store tests are plain Node; no Vitest dependency.
- **2026-10-06 — Tonal pinned to 6.4.3, not latest.** 6.5.0 (published Sep 28) ships without its `main`/`module` entry files and fails to import. Revisit when a fixed release lands.
- **2026-10-06 — `ajv` as a dev dependency.** Validates bundled songs and fixtures against the JSON Schemas in CI, and the JS snapshot against the Pydantic-generated request schema, so the contracts are checked in both languages without hand-copying. Not shipped to the browser.
- **2026-10-06 — Dropped `sse-starlette` and `pydantic-settings`** from the plan: `StreamingResponse` and a small `os.environ` loader cover both.
- **2026-10-06 — Snapshot positions are `{bar, beat}` numbers** rather than a `"3.2"` string, matching what the tutor tool returns. Bar 0 is the pickup.

## Fable checkpoint 1: Phase 0 contracts (Oct 6, 2026)

A fresh Fable reviewer read the repo cold and returned 2 high, 7 medium, and 8 low findings. Claude verified the high and CSP findings against the API docs and installed packages; Matthew chose the outcomes below.

- **2026-10-06 — H1 accepted: the tutor uses structured outputs, not a forced tool call.** Claude Opus 5.5 returns a 400 on forced `tool_choice` (`any`/`tool`), verified in the API reference. `output_config.format` with the `TutorReply` schema guarantees a schema-shaped reply on every turn and still streams; the proxy parses partial JSON from text deltas. The API does not enforce numeric or length bounds in that schema, so Pydantic validates every reply. **Amends the PRD's "forces a single tool (`tool_choice`)."** `contracts/tutor-tool.schema.json` is renamed `tutor-reply.schema.json`. _Rejected:_ a tool with `tool_choice: auto` + `strict` (a reply with no call becomes a retry, adding latency); switching to Claude Opus 5 to keep forced tools (older model).
- **2026-10-06 — H2 accepted: the numeral grammar covers every chord type in the song schema.** `ParsedNumeral` now carries the Tonal chord type; one table defines how each type is written as a numeral and a Nashville number (`maj7`, `6`, `sus2`, `sus4`, `+`, `°`, `°7`, `ø7`). Degrees are found by letter name, so Bb in D is bVI and G# is #iv. A contract test round-trips all 13 types from diatonic and chromatic roots in major and minor. `functionOf` now applies the secondary-dominant rules, so Imaj7 is tonic and I7 is dominant.
- **2026-10-06 — M1 accepted, narrowed: CSP adds `style-src-attr 'unsafe-inline'` only.** abcjs sets `style` attributes (verified in abcjs 6.7.1). `<style>` elements and all scripts stay `'self'`. _Rejected:_ `'unsafe-inline'` on `style-src` (Fable's suggestion; also allows injected `<style>` blocks). Claude also found that Tone.js loads AudioWorklet modules from `blob:` URLs, which `script-src 'self'` blocks: Stream B uses sampler and synth nodes that don't need worklets, and asks before adding `blob:` to `script-src`.
- **2026-10-06 — M2 handed to Stream E:** before relying on slowapi, verify with one curl how Railway's edge sets `X-Forwarded-For`, and key the limit on the entry Railway writes (rightmost), not the leftmost.
- **2026-10-06 — M3 accepted: `src/store/suggestions.js`.** Stream F writes validated tutor suggestions; Stream D2 reads them and owns the chord chip row. Ownership is in `contracts/README.md`.
- **2026-10-06 — M4 accepted: `auditionChord(voicing, range, { atTick })`.** The candidate replaces only the chord at `atTick`; melody and other chords play as in the song.
- **2026-10-06 — M5 accepted: the 422 error envelope is implemented and tested.** It reports where and why, never the submitted value.
- **2026-10-06 — M6 accepted with a change: body cap 128 KB, bars ≤ 400, note beats ≤ 96; tutor turns stay at 4,000 characters.** Fable proposed cutting turns to 1,000 characters, which would truncate real tutor replies in the history. **Amends the PRD's "body at most 64 KB."**
- **2026-10-06 — M7 accepted: ids come from a monotonic counter** and are never reissued after a delete.
- **2026-10-06 — All lows accepted:** `numeralOf` returns `"?"` rather than mislabeling (and now names chromatic roots); `rankKeys` returns `outOfScale: { noteId, pitch }[]`; `guessRhythm` returns `{ notes, beatMs }` so record mode can set the tempo; `playWithClick(range, meter)`; chord labels in the request are pattern-bound so they can't carry prose into the prompt; security headers moved to a pure ASGI middleware so streaming passes through; `make dev` uses a trap instead of `kill %1`; every CI action pinned to an exact release. Claude also fixed `HEAD /` returning 404 and added a CI job that builds the production image and checks it serves.
- **2026-10-06 — Stream E brief note from the review:** the system prompt treats everything in the snapshot and history, including `tutor` turns the client sends, as data, not instructions.

## Demo content

- **2026-10-06 — St. James Infirmary is encoded from the 1930 Gotham Music edition, not a modern songbook.** Matthew shared a songbook page transcribing Josh White's recording; Claude flagged that it is a later arrangement of a recording, which the PRD rules out, and Matthew chose to source the 1930 publication (public domain in the US since Jan 1, 2026) from IMSLP. The first phrase of the refrain, in E minor with a one-beat pickup; cut time written as 4/4. The songbook page was used only to sanity-check contour. Provenance in `content/songs/SOURCES.md`. _Rejected:_ simplifying the songbook transcription; encoding it as printed. Claude's earlier from-memory D-minor draft was wrong in key and shape.
- **2026-10-06 — St. James uses the third verse's words; lyrics stay out of the alpha.** All three verses in the 1930 edition share the encoded notes, so only `SOURCES.md` changes. Showing lyrics would add a schema field and compete with the scale-degree line under the staff; listed as an extension. _Rejected:_ an optional per-note lyric field.

## Repo and design (Oct 6, 2026)

- **2026-10-06 — The repo is public, and `main` is protected.** Branch protection on a private repo needs GitHub Pro; the submission is a public link anyway, and gitleaks scanned the full history clean. Required checks: lint/types/tests/build/audits, smoke + axe, production image, gitleaks; PRs required (0 approvals, since Matthew can't approve his own PRs); enforced for admins; no force pushes or deletion. _Rejected:_ GitHub Pro to stay private; a local pre-push hook only.
- **2026-10-06 — Light theme by default, dark theme on request, remembered.** Matthew asked for dark mode early so every stream styles against both themes from the start. Dark tokens are redefined under `:root[data-theme="dark"]` (screen only, so print stays light), with every text pair checked against WCAG AA in `tokens.css`. A classic same-origin script applies a remembered choice before first paint (no inline script, so the CSP stays strict). The smoke test runs axe in both themes and checks the choice survives a reload. _Rejected:_ dark by default (Claude's suggestion); following the OS setting.
