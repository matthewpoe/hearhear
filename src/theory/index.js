/**
 * The theory core's public API (Stream A). Pure functions: no DOM, audio, or
 * store imports (enforced by ESLint). Everything relative-pitch lives here, so
 * the app, the store, and the Node eval harness share one definition.
 *
 * CONTRACT: exported names, parameters, and return shapes are frozen (see
 * contracts/README.md). Each concept lives in its own file.
 */

export { spell, degreeToMidi, midiToDegree } from "./pitch.js";
export { keyEventToDegree } from "./keyboard.js";
export { parseNumeral, numeralOf, nashvilleOf, letterOf, chordFromNumeral } from "./numerals.js";
export { functionOf } from "./harmonicFunction.js";
export { chordTones, analyzeNoteOverChord } from "./harmony.js";
export { candidates } from "./candidates.js";
export { fit } from "./fit.js";
export { rankKeys } from "./keyFinding.js";
export { guessRhythm } from "./rhythm.js";
export { voice } from "./voicing.js";
export { TICKS_PER_QUARTER, positionOf, rebar, ticksPerBar, ticksPerBeat } from "./meter.js";
export { transposeSong, rekeySong } from "./keyChange.js";
