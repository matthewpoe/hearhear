/**
 * The computer keyboard as the instrument: fixed rows, so the same key
 * always plays the same degree.
 *
 * @import { ScaleDegree } from "../types.js"
 */

/** Each row's keys, one per scale degree, lined up under the number row. */
const ROWS = [
  { keys: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU"], octave: -1 },
  { keys: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"], octave: -2 },
  { keys: ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7"], octave: 0 },
  { keys: ["Digit8", "Digit9", "Digit0"], octave: 1 },
];

/**
 * Map a physical key (KeyboardEvent.code) and modifiers to a scale degree.
 * Number row = home octave, with 8 9 0 continuing to 1 2 3 above; Q–U = one
 * octave below; A–J = two below. Shift raises, Alt/Option lowers; both at
 * once cancel out.
 * @param {string} code e.g. "Digit5", "KeyU"
 * @param {{ shift: boolean, alt: boolean }} modifiers
 * @returns {ScaleDegree | null} null for keys that are not note keys
 */
export function keyEventToDegree(code, { shift, alt }) {
  const row = ROWS.find((r) => r.keys.includes(code));
  if (!row) return null;
  return {
    degree: /** @type {ScaleDegree["degree"]} */ (row.keys.indexOf(code) + 1),
    accidental: shift === alt ? 0 : shift ? 1 : -1,
    octave: row.octave,
  };
}
