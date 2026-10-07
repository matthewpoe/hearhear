/**
 * Harmonic function, which drives every color and shape in the app. The data
 * lives in contracts/functions.json; this is its only reader.
 *
 * @import { HarmonicFunction } from "../types.js"
 */

import functions from "../../contracts/functions.json" with { type: "json" };
import { NUMERAL_FORMS, ROMAN, parseNumeral } from "./numerals.js";

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
  const diminished = DIMINISHED.includes(parsed.type);
  // Applied chords, major-minor sevenths off V, and raised-root diminished
  // chords all point at a new target: dominant (contracts/functions.json).
  if (parsed.of) return "dominant";
  if (parsed.type === "7" && !(parsed.degree === 5 && parsed.accidental === 0)) return "dominant";
  if (diminished && parsed.accidental === 1) return "dominant";
  // The table lists triads; an added seventh or sixth doesn't change function.
  const lower = NUMERAL_FORMS.some((f) => f.type === parsed.type && f.lower);
  const roman = ROMAN[parsed.degree - 1];
  const base =
    { "-1": "b", 0: "", 1: "#" }[parsed.accidental] +
    (lower ? roman.toLowerCase() : roman) +
    (diminished ? "°" : parsed.type === "aug" ? "+" : "");
  const table = /** @type {Record<string, string[]>} */ (functions[mode]);
  for (const fn of ["tonic", "subdominant", "dominant"]) {
    if (table[fn].includes(base)) return /** @type {HarmonicFunction} */ (fn);
  }
  return "other";
}
