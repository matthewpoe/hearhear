/**
 * Which computer key plays each piano key, for the labels on the on-screen
 * piano, and where the octave window may sit. The mapping itself is the
 * theory core's (keyEventToDegree and degreeToMidi); this only inverts it for
 * display and keeps it on the piano.
 *
 * @import { Key, ScaleDegree } from "../types.js"
 * @import { BottomRow } from "../store/ui.js"
 */

import { degreeToMidi, keyEventToDegree } from "../theory/index.js";
import { CHORD_CODES } from "./chordRow.js";

/** The on-screen piano and the samples: C2 to C6. */
export const LOWEST = 36;
export const HIGHEST = 84;

/** How far the arrows may ask to move the window; windowBounds narrows it per key. */
export const WINDOW_OCTAVE_LIMIT = 1;

/** The three note rows, by KeyboardEvent.code. */
export const NOTE_CODES = [
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => `Digit${d}`),
  ..."QWERTYU".split("").map((l) => `Key${l}`),
  ..."ASDFGHJ".split("").map((l) => `Key${l}`),
];

/**
 * @typedef {"shift" | null} Modifier
 * @typedef {{ code: string, modifier: Modifier }} KeyBinding
 */

/**
 * Plain keys first, then raised: each pitch gets the simplest way to play it.
 * Alt/Option lowers too, but every lowered degree is also a plain or raised
 * neighbour on the piano, so it never earns a label (the help text teaches it).
 */
const MODIFIERS = /** @type {const} */ ([null, "shift"]);

/** @param {number} midi */
export const onPiano = (midi) => midi >= LOWEST && midi <= HIGHEST;

/**
 * The windows (octave offsets) in which every plain key of the three rows
 * lands on the piano. Empty when no window fits them all.
 * @param {Key} key
 * @returns {number[]}
 */
function fittingWindows(key) {
  const plain = NOTE_CODES.map(
    (code) => /** @type {ScaleDegree} */ (keyEventToDegree(code, { shift: false, alt: false })),
  );
  const fitting = [];
  for (let w = -WINDOW_OCTAVE_LIMIT; w <= WINDOW_OCTAVE_LIMIT; w++) {
    if (plain.every((degree) => onPiano(degreeToMidi(degree, key, w)))) fitting.push(w);
  }
  return fitting;
}

/**
 * The lowest and highest window the arrows may reach in a key: those where
 * every plain key lands on the piano. When none fits (the rows span nearly the
 * whole piano, so a tonic high in the octave pushes the top keys past C6), the
 * window stays home and the few keys off the piano play nothing.
 * @param {Key} key
 * @returns {{ min: number, max: number }}
 */
export function windowBounds(key) {
  const fitting = fittingWindows(key);
  if (fitting.length === 0) return { min: 0, max: 0 };
  return { min: fitting[0], max: fitting[fitting.length - 1] };
}

/**
 * A window kept inside the key's bounds, for a stored window that a key
 * change may have left out of range.
 * @param {Key} key
 * @param {number} windowOctave
 */
export function clampWindow(key, windowOctave) {
  const { min, max } = windowBounds(key);
  return Math.max(min, Math.min(max, windowOctave));
}

/**
 * Map each piano pitch to the computer key that plays it. Keys whose pitch
 * falls off the piano are left out; the number row doesn't play them either.
 * While the bottom row plays chords, its keys play no single note.
 * @param {Key} key
 * @param {number} windowOctave
 * @param {BottomRow} [bottomRow]
 * @returns {Map<number, KeyBinding>}
 */
export function keyBindings(key, windowOctave, bottomRow = "notes") {
  const window = clampWindow(key, windowOctave);
  const codes =
    bottomRow === "chords" ? NOTE_CODES.filter((c) => !CHORD_CODES.includes(c)) : NOTE_CODES;
  /** @type {Map<number, KeyBinding>} */
  const bindings = new Map();
  for (const modifier of MODIFIERS) {
    for (const code of codes) {
      const degree = keyEventToDegree(code, { shift: modifier === "shift", alt: false });
      if (!degree) continue;
      const midi = degreeToMidi(degree, key, window);
      if (onPiano(midi) && !bindings.has(midi)) bindings.set(midi, { code, modifier });
    }
  }
  return bindings;
}

/**
 * Where each chord-row key's label goes on the piano: the root of its chord,
 * on the key that row plays as single notes (two octaves under the number
 * row), so every column still reads as one degree. Roots off the piano are
 * left out.
 * @param {Key} key
 * @param {number} windowOctave
 * @returns {Map<number, string>} MIDI → KeyboardEvent.code
 */
export function chordRowKeys(key, windowOctave) {
  const window = clampWindow(key, windowOctave);
  /** @type {Map<number, string>} */
  const keys = new Map();
  for (const code of CHORD_CODES) {
    const degree = /** @type {ScaleDegree} */ (
      keyEventToDegree(code, { shift: false, alt: false })
    );
    const midi = degreeToMidi(degree, key, window);
    if (onPiano(midi)) keys.set(midi, code);
  }
  return keys;
}

/** How each modifier reads on a key cap and aloud. */
const MODIFIER_LABELS = {
  shift: { visual: "⇧", spoken: "Shift " },
  none: { visual: "", spoken: "" },
};

/** "Digit5" → "5", "KeyQ" → "Q". @param {string} code */
const keyName = (code) => code.replace(/^(Digit|Key)/, "");

/**
 * Short label for a piano key, e.g. "Q", "⇧4".
 * @param {KeyBinding} binding
 */
export function bindingLabel({ code, modifier }) {
  return MODIFIER_LABELS[modifier ?? "none"].visual + keyName(code);
}

/**
 * Spoken form for an accessible name, e.g. "Shift 4".
 * @param {KeyBinding} binding
 */
export function bindingSpoken({ code, modifier }) {
  return MODIFIER_LABELS[modifier ?? "none"].spoken + keyName(code);
}
