/**
 * How a chord looks on a chip or option: its label in the user's label style,
 * plus its harmonic function's color and shape, all derived from the chord and
 * the current key hypothesis. Honors the key-label mode: hidden shows only a
 * neutral mark, with no label and no function, because a numeral or even a
 * letter name gives home away (decision D2).
 *
 * @import { ChordSpec, Key, LabelStyle, HarmonicFunction, Meter, Note } from "../types.js"
 * @import { KeyLabelMode } from "../store/ui.js"
 */

import {
  functionInfo,
  functionOf,
  letterOf,
  nashvilleOf,
  numeralOf,
  positionOf,
} from "../theory/index.js";

/**
 * @typedef {{
 *   mode: KeyLabelMode,
 *   text: string,
 *   sup: string,
 *   fn: HarmonicFunction | null,
 *   color: string | null,
 *   name: string,
 * }} ChordView
 * `sup` is a superscript seventh (Nashville). `fn` and `color` (a tokens.css
 * custom property name, from functionInfo) are null in hidden mode, where
 * `text` is empty too. `name` is the accessible name.
 */

/** The accessible name of a chord whose label is hidden until the guess. */
export const HIDDEN_NAME = "Chord, name hidden until you find home";

/** Chord types whose Nashville number ends in a seventh written as a superscript. */
const SEVENTHS = new Set(["7", "m7", "dim7", "m7b5"]);

/** @type {Record<HarmonicFunction, string>} */
const FUNCTION_NAMES = {
  tonic: "tonic, home",
  subdominant: "subdominant, moving away",
  dominant: "dominant, tension",
  other: "unusual here",
};

/**
 * @param {ChordSpec} chord
 * @param {Key} key
 * @param {KeyLabelMode} mode
 * @param {LabelStyle} style
 * @returns {ChordView}
 */
export function chordView(chord, key, mode, style) {
  if (mode === "hidden") {
    return { mode, text: "", sup: "", fn: null, color: null, name: HIDDEN_NAME };
  }
  const letters = letterOf(chord);
  const numeral = numeralOf(chord, key);
  const fn = functionOf(numeral, key.mode);
  const { text, sup } = styledLabel(chord, key, style, numeral, letters);
  const spoken = sup ? `${text} ${sup}` : text;
  return {
    mode,
    text,
    sup,
    fn,
    color: functionInfo(fn).color,
    name: `${spoken}, ${FUNCTION_NAMES[fn]}`,
  };
}

/**
 * @param {ChordSpec} chord
 * @param {Key} key
 * @param {LabelStyle} style
 * @param {string} numeral
 * @param {string} letters
 * @returns {{ text: string, sup: string }}
 */
function styledLabel(chord, key, style, numeral, letters) {
  if (style === "letters") return { text: letters, sup: "" };
  if (style === "roman+letters") return { text: `${numeral} · ${letters}`, sup: "" };
  if (style === "nashville") {
    const number = nashvilleOf(chord, key);
    return SEVENTHS.has(chord.type) && number.endsWith("7")
      ? { text: number.slice(0, -1), sup: "7" }
      : { text: number, sup: "" };
  }
  return { text: numeral, sup: "" };
}

/**
 * Where a note sits, for labels: "bar 2, beat 3". Bar 0 is the pickup.
 * @param {Note} note
 * @param {Meter} meter
 * @returns {string}
 */
export function whereOf(note, meter) {
  const { bar, beat } = positionOf(note.start, meter);
  return `bar ${bar}, beat ${beat}`;
}
