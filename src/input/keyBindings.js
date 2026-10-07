/**
 * Which computer key plays each piano key, for the labels on the on-screen
 * piano. The mapping itself is the theory core's (keyEventToDegree and
 * degreeToMidi); this only inverts it for display.
 *
 * @import { Key } from "../types.js"
 */

import { degreeToMidi, keyEventToDegree } from "../theory/index.js";

/** The three note rows, by KeyboardEvent.code. */
const NOTE_CODES = [
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => `Digit${d}`),
  ..."QWERTYU".split("").map((l) => `Key${l}`),
  ..."ASDFGHJ".split("").map((l) => `Key${l}`),
];

/**
 * @typedef {"shift" | "alt" | null} Modifier
 * @typedef {{ code: string, modifier: Modifier }} KeyBinding
 */

/** Plain keys first, then raised, then lowered: each pitch gets the simplest way to play it. */
const MODIFIERS = /** @type {const} */ ([null, "shift", "alt"]);

/**
 * Map each playable pitch to the computer key that plays it.
 * @param {Key} key
 * @param {number} windowOctave
 * @returns {Map<number, KeyBinding>}
 */
export function keyBindings(key, windowOctave) {
  /** @type {Map<number, KeyBinding>} */
  const bindings = new Map();
  for (const modifier of MODIFIERS) {
    for (const code of NOTE_CODES) {
      const modifiers = { shift: modifier === "shift", alt: modifier === "alt" };
      const degree = keyEventToDegree(code, modifiers);
      if (!degree) continue;
      const midi = degreeToMidi(degree, key, windowOctave);
      if (!bindings.has(midi)) bindings.set(midi, { code, modifier });
    }
  }
  return bindings;
}

const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "");

/** "Digit5" → "5", "KeyQ" → "Q". @param {string} code */
const keyName = (code) => code.replace(/^(Digit|Key)/, "");

/**
 * Short label for a piano key, e.g. "Q", "⇧4", "⌥7" (Mac) or "Alt 7".
 * @param {KeyBinding} binding
 */
export function bindingLabel({ code, modifier }) {
  const prefix = { shift: "⇧", alt: isMac ? "⌥" : "Alt ", none: "" }[modifier ?? "none"];
  return prefix + keyName(code);
}

/**
 * Spoken form for an accessible name, e.g. "Shift 4", "Option 7".
 * @param {KeyBinding} binding
 */
export function bindingSpoken({ code, modifier }) {
  const prefix = { shift: "Shift ", alt: isMac ? "Option " : "Alt ", none: "" }[modifier ?? "none"];
  return prefix + keyName(code);
}
