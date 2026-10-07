/**
 * Harmonic function, which drives every color and shape in the app. The data
 * lives in contracts/functions.json; this is its only reader.
 *
 * @import { HarmonicFunction } from "../types.js"
 */

import functions from "../../contracts/functions.json" with { type: "json" };
import { formatNumeral, parseNumeral } from "./numerals.js";

const DIMINISHED = ["dim", "dim7", "m7b5"];

/**
 * Harmonic function of a numeral in a mode.
 * @param {string} numeral
 * @param {"major" | "minor"} mode
 * @returns {HarmonicFunction}
 */
export function functionOf(numeral, mode) {
  const parsed = parseNumeral(numeral);
  if (!parsed) return "other";
  // Applied chords, major-minor sevenths off V, and raised-root diminished
  // chords all point at a new target: dominant (contracts/functions.json).
  if (parsed.of) return "dominant";
  if (parsed.type === "7" && !(parsed.degree === 5 && parsed.accidental === 0)) return "dominant";
  if (DIMINISHED.includes(parsed.type) && parsed.accidental === 1) return "dominant";
  // The table lists triads; an added seventh or sixth doesn't change function.
  const triad = formatNumeral(parsed, { triad: true });
  const table = /** @type {Record<string, string[]>} */ (functions[mode]);
  for (const fn of ["tonic", "subdominant", "dominant"]) {
    if (table[fn].includes(triad)) return /** @type {HarmonicFunction} */ (fn);
  }
  return "other";
}

/**
 * How a harmonic function is drawn and explained: its shape, its color token
 * (a CSS custom property in tokens.css), and its one-line meaning, all from
 * contracts/functions.json. The piano, the chips, and the staff read it, so
 * a function always looks the same everywhere.
 * @param {HarmonicFunction} fn
 * @returns {{ shape: string, color: string, meaning: string }}
 *   e.g. { shape: "circle", color: "--fn-tonic", meaning: "home, rest" }
 */
export function functionInfo(fn) {
  // Anything outside the four functions reads as the neutral 'other', as functionOf would.
  const { shape, color, meaning } = functions.functions[fn] ?? functions.functions.other;
  return { shape, color, meaning };
}
