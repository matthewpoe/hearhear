# Contracts

Phase 0 froze these interfaces so the Phase 1 streams can build in parallel. **A stream changes a contract only by asking Matthew**, and the change and its reason are logged in `docs/decisions/<stream>.md`.

## Data contracts (JSON)

| File                        | What                                                                                      | Source of truth                                                   | Consumers                         |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `song.schema.json`          | The song model: absolute pitches in ticks (12 per quarter), plus key and meter hypotheses | This file                                                         | store, content validation, evals  |
| `tutor-request.schema.json` | `POST /api/tutor` body: a readable snapshot with no MIDI, the question, and history       | **Generated** from `server/hearhear/models.py` (`make contracts`) | tutor panel, evals                |
| `tutor-tool.schema.json`    | The forced `tutor_reply` tool's `input_schema`                                            | **Generated** from `server/hearhear/models.py`                    | proxy, tutor panel, evals         |
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
