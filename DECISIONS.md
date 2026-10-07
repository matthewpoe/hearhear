# Decisions

Every product and engineering decision, including each time Matthew overrules Claude or a Fable reviewer. Streams log to `docs/decisions/<stream>.md`; Matthew folds those in here.

Format: **date — decision.** Why. _Rejected:_ alternatives.

## From the PRD (planning, Sep 26 – Oct 6, 2026)

- **2026-09-26 — Theme 1, Exploration & Understanding.** Hear Hear is a teacher that builds understanding of harmony by ear. Theme 2's "real control over iteration" is a supporting point, not a second theme. _Rejected:_ framing as a creative/generative tool.
- **2026-09-26 — Teacher, not transcriber.** The user does the ear work; the tool shortens the feedback loop. _Rejected:_ microphone transcription (rhythm is the hard problem, laptop-mic piano is messy, ScoreCloud already does it well).
- **2026-09-26 — Ear as verifier.** Every Claude suggestion is structured data the app can play; the user auditions and decides. _Rejected:_ trusting Claude's chord claims as text.
- **2026-09-27 — Per-note audition replaces automatic harmonization.** The dropdown plays each candidate under the melody. _Rejected:_ automatic Viterbi harmonization (does the ear work for the user).
- **2026-09-27 — Fixed-register, nearest-inversion voicing for audition.** A and B differ only in harmony, never register. Came from a failed A/B test in a real session.
- **2026-09-27 — Svelte 5 (runes) + Vite, plain JS with JSDoc.** Reactive views across one model, default escaping, scoped CSS, built-in transitions. _Rejected:_ plain JS modules; HTMX (the client owns the song model, Claude's output lands as data, not swapped HTML); TypeScript.
- **2026-09-27 — FastAPI proxy on Railway; all theory in the browser.** Hover audition never waits on the network; key and prompt stay server-side. No database, no login.
- **2026-09-27 — Absolute pitches plus a key hypothesis.** Re-key changes labels only; transpose moves everything; re-bar moves only bar lines.
- **2026-10-06 — The number row is the instrument.** Keys play scale degrees. _Rejected:_ the on-screen keyboard or letter keys as primary input (slow; ties input to a key).
- **2026-10-06 — Fixed octave rows.** Number row = home octave (8/9/0 continue up), Q–U one octave below, A–J two below; the same key always plays the same note. _Rejected:_ nearest-note octave placement (no muscle memory possible).
- **2026-10-06 — Rhythm guessing with manual fixes.** Most common inter-onset gap = the beat; snap to ½, 1, 1½, 2, 3, 4 beats; one key reverts to quarter notes. _Rejected:_ plain quarter-note entry; real-time swing capture (stretch).
- **2026-10-06 — Natural minor on the number row, raised 7th on Shift+7.** Folk and blues melodies move in natural minor.
- **2026-10-06 — Nashville counts from the minor tonic (1m, not 6m).** Chord 1 and melody degree 1 are always the same note.
- **2026-10-06 — Bauhaus function colors and shapes.** Tonic blue circle, subdominant yellow triangle, dominant red square (Kandinsky, 1923); never color alone.
- **2026-10-06 — Claude Opus 5.5 tutor with a forced tool call, streamed.** Malformed output can't reach playback; the proxy is useless as general Claude.
- **2026-10-06 — Public-domain demo tunes only.** Ode to Joy, St. James Infirmary (1929 publication). _Rejected:_ songs from Matthew's own sessions (copyrighted).

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
