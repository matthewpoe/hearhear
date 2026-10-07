/**
 * Chord names relative to a key: Roman numerals (parse and format), Nashville
 * numbers, and letter names. One table of chord-type forms, so parsing and
 * formatting can never disagree.
 *
 * @import { Key, ChordSpec } from "../types.js"
 */

import { Note as TNote } from "tonal";
import { DEGREE_INTERVALS, degreeOf } from "./pitch.js";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * How each chord type in contracts/song.schema.json is written as a numeral:
 * case (lowercase = minor-third family) and suffix.
 * @type {{ type: string, lower: boolean, suffix: string, nashville: string }[]}
 */
const NUMERAL_FORMS = [
  { type: "M", lower: false, suffix: "", nashville: "" },
  { type: "7", lower: false, suffix: "7", nashville: "7" },
  { type: "maj7", lower: false, suffix: "maj7", nashville: "maj7" },
  { type: "6", lower: false, suffix: "6", nashville: "6" },
  { type: "sus2", lower: false, suffix: "sus2", nashville: "sus2" },
  { type: "sus4", lower: false, suffix: "sus4", nashville: "sus4" },
  { type: "aug", lower: false, suffix: "+", nashville: "+" },
  { type: "m", lower: true, suffix: "", nashville: "m" },
  { type: "m7", lower: true, suffix: "7", nashville: "m7" },
  { type: "m6", lower: true, suffix: "6", nashville: "m6" },
  { type: "dim", lower: true, suffix: "°", nashville: "°" },
  { type: "dim7", lower: true, suffix: "°7", nashville: "°7" },
  { type: "m7b5", lower: true, suffix: "ø7", nashville: "ø7" },
];

/**
 * The diatonic chords a secondary dominant can point at, by degree. The tonic
 * is plain V7, and a diminished chord is never tonicized. Minor tonicizes only
 * iv, V, and VI, as its blues and New Orleans idioms do: A7 in E minor is the
 * IV7 of a minor blues, not V7/VII, and D7 is VII7. Minor's degree 5 is
 * written V, matching the dropdown.
 */
const APPLIED_TARGETS = {
  major: [null, "ii", "iii", "IV", "V", "vi", null],
  minor: [null, null, null, "iv", "V", "VI", null],
};

/** The quality mark a chord type keeps when written as its triad. */
const TRIAD_MARKS = { dim: "°", dim7: "°", m7b5: "°", aug: "+" };

/** @param {number} accidental */
const accidentalPrefix = (accidental) => (accidental === -1 ? "b" : accidental === 1 ? "#" : "");

/**
 * A parsed Roman numeral. `type` is the Tonal chord type from the song schema,
 * so every chord the app can hold has exactly one numeral and back.
 * @typedef {{
 *   degree: number, accidental: -1 | 0 | 1, type: string, of: ParsedNumeral | null
 * }} ParsedNumeral
 */

/**
 * Parse a Roman numeral. Uppercase is major, lowercase minor; suffixes `7`,
 * `maj7`, `6`, `sus2`, `sus4`, `+`, `°` (or `o`), `°7`, and `ø7` (or `ø`);
 * a leading `b` or `#` marks a chromatic root; `/x` is an applied chord.
 * @param {string} text e.g. "V7", "bVII", "vii°", "iiø7", "Imaj7", "V7/IV"
 * @returns {ParsedNumeral | null} null if it does not parse
 */
export function parseNumeral(text) {
  const [head, target, extra] = text.trim().split("/");
  if (extra !== undefined) return null;
  const m = head.match(/^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/);
  if (!m) return null;
  const [, acc, roman, rawSuffix] = m;
  const suffix = rawSuffix.replace(/^o/, "°").replace(/^ø$/, "ø7");
  const lower = roman === roman.toLowerCase();
  const form = NUMERAL_FORMS.find((f) => f.lower === lower && f.suffix === suffix);
  if (!form) return null;
  const of = target === undefined ? null : parseNumeral(target);
  if (target !== undefined && !of) return null;
  return {
    degree: ROMAN.indexOf(roman.toUpperCase()) + 1,
    accidental: acc === "b" ? -1 : acc === "#" ? 1 : 0,
    type: form.type,
    of,
  };
}

/**
 * Write a parsed numeral out; the one formatter, so parseNumeral, numeralOf,
 * and functionOf can never disagree. `triad` keeps only the triad's quality
 * mark and drops any target (iiø7 → "ii°", V7 → "V"), the way
 * contracts/functions.json lists chords.
 * @param {ParsedNumeral} parsed
 * @param {{ triad?: boolean }} [options]
 * @returns {string} e.g. "bVI", "V7/IV"; "?" for a type with no numeral form
 */
export function formatNumeral(parsed, { triad = false } = {}) {
  const form = NUMERAL_FORMS.find((f) => f.type === parsed.type);
  if (!form) return "?";
  const roman = ROMAN[parsed.degree - 1];
  const head = accidentalPrefix(parsed.accidental) + (form.lower ? roman.toLowerCase() : roman);
  if (triad) return head + (TRIAD_MARKS[/** @type {keyof TRIAD_MARKS} */ (parsed.type)] ?? "");
  return head + form.suffix + (parsed.of ? `/${formatNumeral(parsed.of)}` : "");
}

/**
 * The diatonic chord a dominant seventh resolves to by fifth, if it is a
 * secondary dominant in this key: D7 in D major → IV.
 * @param {ChordSpec} chord
 * @param {Key} key
 * @returns {ParsedNumeral | null}
 */
function appliedTarget(chord, key) {
  if (chord.type !== "7") return null;
  const resolution = TNote.pitchClass(TNote.transpose(chord.root, "4P"));
  const degree = DEGREE_INTERVALS[key.mode].findIndex(
    (interval) => TNote.transpose(key.tonic, interval) === resolution,
  );
  const target = degree >= 0 ? APPLIED_TARGETS[key.mode][degree] : null;
  return target ? parseNumeral(target) : null;
}

/**
 * The Roman numeral of a chord in a key, e.g. A7 in D major → "V7",
 * Bb in D major → "bVI", D7 in D major → "V7/IV" (a secondary dominant is
 * named by where it resolves). "?" when the root is more than a semitone
 * from the scale.
 * @param {ChordSpec} chord
 * @param {Key} key
 * @returns {string}
 */
export function numeralOf(chord, key) {
  const target = appliedTarget(chord, key);
  if (target) return formatNumeral({ degree: 5, accidental: 0, type: "7", of: target });
  const { degree, accidental } = degreeOf(chord.root, key);
  if (Math.abs(accidental) > 1) return "?";
  return formatNumeral({
    degree,
    accidental: /** @type {ParsedNumeral["accidental"]} */ (accidental),
    type: chord.type,
    of: null,
  });
}

/**
 * Nashville number counted from the current tonic in major and minor alike
 * (1m in a minor key, never 6m), e.g. Em in D major → "2m", Bb in D → "b6".
 * Secondary dominants are plain numbers with their quality (VI7 → "67").
 * Sevenths come back as a plain "7"; the view superscripts them.
 * @param {ChordSpec} chord
 * @param {Key} key
 * @returns {string}
 */
export function nashvilleOf(chord, key) {
  const { degree, accidental } = degreeOf(chord.root, key);
  const form = NUMERAL_FORMS.find((f) => f.type === chord.type);
  if (!form || Math.abs(accidental) > 1) return "?";
  return `${accidentalPrefix(accidental)}${degree}${form.nashville}`;
}

/**
 * Letter-name chord symbol, e.g. { root: "A", type: "7" } → "A7".
 * @param {ChordSpec} chord
 * @returns {string}
 */
export function letterOf(chord) {
  const suffix = { M: "", dim: "°", dim7: "°7", m7b5: "ø7", aug: "+" }[chord.type] ?? chord.type;
  return chord.root + suffix;
}

/**
 * The chord a numeral names in a key, e.g. "V7" in D major → { root: "A", type: "7" },
 * "V7/IV" in D major → { root: "D", type: "7" }.
 * @param {string} numeral
 * @param {Key} key
 * @returns {ChordSpec | null} null if the numeral does not parse
 */
export function chordFromNumeral(numeral, key) {
  const parsed = parseNumeral(numeral);
  return parsed ? { root: resolveRoot(parsed, key), type: parsed.type } : null;
}

/**
 * The root a parsed numeral names in a key. An applied chord is measured from
 * its target's root, as if that root were a major tonic.
 * @param {ParsedNumeral} parsed
 * @param {Key} key
 * @returns {string} a pitch class
 */
function resolveRoot(parsed, key) {
  const { tonic, mode } = parsed.of
    ? { tonic: resolveRoot(parsed.of, key), mode: /** @type {const} */ ("major") }
    : key;
  const diatonic = TNote.transpose(tonic, DEGREE_INTERVALS[mode][parsed.degree - 1]);
  const shift = { "-1": "-1A", 0: "1P", 1: "1A" }[parsed.accidental];
  return TNote.pitchClass(TNote.transpose(diatonic, shift));
}
