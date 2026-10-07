/**
 * How a chord looks on a chip or option: its label in the user's label style,
 * plus its harmonic function's color and shape, all derived from the chord and
 * the current key hypothesis. Honors the key-label mode: hidden shows only the
 * letter name, with no function, so nothing gives home away.
 *
 * @import { ChordSpec, Key, LabelStyle, HarmonicFunction } from "../types.js"
 * @import { KeyLabelMode } from "../store/ui.js"
 */

import contract from "../../contracts/functions.json" with { type: "json" };
import { functionOf, letterOf, nashvilleOf, numeralOf } from "../theory/index.js";

/**
 * @typedef {{
 *   mode: KeyLabelMode,
 *   text: string,
 *   sup: string,
 *   fn: HarmonicFunction | null,
 *   shape: string | null,
 *   name: string,
 * }} ChordView
 * `sup` is a superscript seventh (Nashville). `fn` and `shape` are null in
 * hidden mode. `name` is the accessible name.
 */

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
  const letters = letterOf(chord);
  if (mode === "hidden") {
    return { mode, text: letters, sup: "", fn: null, shape: null, name: letters };
  }
  const numeral = numeralOf(chord, key);
  const fn = functionOf(numeral, key.mode);
  const { text, sup } = styledLabel(chord, key, style, numeral, letters);
  const spoken = sup ? `${text} ${sup}` : text;
  return {
    mode,
    text,
    sup,
    fn,
    shape: contract.functions[fn].shape,
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
