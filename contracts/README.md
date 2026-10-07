# Contracts

Phase 0 froze these interfaces so the Phase 1 streams can build in parallel. **A stream changes a contract only by asking Matthew**, and the change and its reason are logged in `docs/decisions/<stream>.md`.

## Data contracts (JSON)

| File                        | What                                                                                      | Source of truth                                                   | Consumers                         |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `song.schema.json`          | The song model: absolute pitches in ticks (12 per quarter), plus key and meter hypotheses | This file                                                         | store, content validation, evals  |
| `tutor-request.schema.json` | `POST /api/tutor` body: a readable snapshot with no MIDI, the question, and history       | **Generated** from `server/hearhear/models.py` (`make contracts`) | tutor panel, evals                |
| `tutor-reply.schema.json`   | The tutor's reply, sent as the structured-output schema (`output_config.format`)          | **Generated** from `server/hearhear/models.py`                    | proxy, tutor panel, evals         |
| `tutor-sse.md`              | The streaming protocol and error codes                                                    | This file                                                         | proxy, tutor panel, evals         |
| `functions.json`            | Harmonic function per numeral and mode, with its color token and shape                    | This file                                                         | `functionOf` only                 |
| `fixtures/tutor/*.json`     | SSE shape fixtures for fixture mode and tests                                             | This directory                                                    | proxy (fixture mode), tutor panel |

Wire format is snake_case (Python side); the in-browser song model is camelCase. `toTutorSnapshot` is the only place that crosses between the two.

## Code contracts (JSDoc'd modules)

These modules are the contract: their exported names, parameters, and return shapes are frozen. Each Phase 0 stub returns plausible values, and the owning stream replaces the bodies.

| Module                     | Owner                 | Exports                                                                                                                                                                                                                                                         |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/theory/index.js`      | A                     | spell, degreeToMidi, midiToDegree, keyEventToDegree, parseNumeral, numeralOf, nashvilleOf, letterOf, chordFromNumeral, functionOf, chordTones, analyzeNoteOverChord, candidates, fit, rankKeys, guessRhythm, voice, positionOf, rebar, transposeSong, rekeySong |
| `src/audio/index.js`       | B                     | audioStatus, unlock, preload, noteOn, noteOff, playPhrase, auditionChord, auditionDebounced, drone, playWithClick, stop                                                                                                                                         |
| `src/staff/staffEvents.js` | C                     | onNoteClick, emitNoteClick, highlight, clearHighlight, registerNoteElements                                                                                                                                                                                     |
| `src/store/song.js`        | Phase 0 (implemented) | song store and actions (see file)                                                                                                                                                                                                                               |
| `src/store/ui.js`          | Phase 0 (implemented) | UI-state store; never bumps the song version                                                                                                                                                                                                                    |
| `src/store/snapshot.js`    | Phase 0 (implemented) | toTutorSnapshot                                                                                                                                                                                                                                                 |
| `src/store/suggestions.js` | Phase 0 (implemented) | suggestions store, isStale                                                                                                                                                                                                                                      |

## Shared surfaces: who writes, who reads

- **Tutor suggestions:** Stream F validates each reply client-side and writes `suggestions`. Stream D2 reads it and offers each suggestion as an alternative to audition. Nothing applies a suggestion to the song except the user choosing it in D2's dropdown.
- **Chord chip row** (the chords under the staff, colored by function): Stream D2 owns it. Stream C renders letter names in the abcjs lead sheet, and must not draw a second chip row.
- **Audition:** D2 calls `auditionChord(voicing, range, { atTick })`. Stream B plays the melody and every other placed chord exactly as in the song, so A/B comparisons differ only in the candidate's harmony.
- **Demos hide the answer.** When a demo starts (Stream D3), it loads the tune with `key.provisional: true` and sets `ui.keyLabelsHidden`. While that flag is set, Streams C, D1, and D2 show no degrees, numerals, Nashville numbers, or function colors. Committing a key guess clears it. Free play never sets it.
- **Voicing.** Every chord in a passage is voiced with `voice(chord, previous, { below })`, where `below` is the passage's lowest melody note. The left hand never collides with the melody, and alternatives share a register.
