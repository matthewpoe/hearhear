/**
 * The eval's metrics, as pure functions over one song and the tutor's replies.
 * Theory comes from src/theory, so the eval judges chords exactly as the app
 * does; tonal is used only to read Claude's letter-name symbols.
 *
 * @import { ChordSpec, Key, Song } from "../src/types.js"
 */

import { Chord, Note } from "tonal";
import {
  analyzeNoteOverChord,
  candidates,
  chordFromNumeral,
  fit,
  positionOf,
} from "../src/theory/index.js";

/** Snapshot beats are rounded to three places (src/store/snapshot.js). */
const BEAT_TOLERANCE = 0.001;

/**
 * A count out of a total. The total travels with the rate so a reader sees
 * "3 of 12", never a bare percentage from a tiny sample.
 * @typedef {{ count: number, total: number }} Rate
 */

/**
 * @param {number} count
 * @param {number} total
 * @returns {Rate}
 */
export const rate = (count, total) => ({ count, total });

/**
 * Nearest-rank percentile, or null for no samples.
 * @param {number[]} values
 * @param {number} p 0..100
 */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

/**
 * Read a letter-name chord symbol ("F#m", "Bb7", "B°", "Bø7") into a root and
 * an interval pattern, or null if it isn't a chord symbol.
 * @param {string} letter
 */
function readLetter(letter) {
  const chord = Chord.get(letter.replace(/ø7?/, "m7b5"));
  return chord.empty || !chord.tonic ? null : chord;
}

/**
 * Do the numeral and the letter name the same chord in this key? Compared by
 * chord identity, not spelling: A# and Bb are the same root, and "dim" and
 * "°" the same chord.
 * @param {string} numeral
 * @param {string} letter
 * @param {Key} key
 */
export function numeralAgreesWithLetter(numeral, letter, key) {
  const fromNumeral = chordFromNumeral(numeral, key);
  const fromLetter = readLetter(letter);
  if (!fromNumeral || !fromLetter) return false;
  return (
    Note.chroma(fromNumeral.root) === Note.chroma(/** @type {string} */ (fromLetter.tonic)) &&
    Chord.getChord(fromNumeral.type).chroma === fromLetter.chroma
  );
}

/**
 * Do two chords share a root and triad quality? A seventh or sixth counts as
 * its triad, so V7 matches a reference V and C6 matches C.
 * @param {ChordSpec} a
 * @param {ChordSpec} b
 */
export function sameHarmony(a, b) {
  return (
    Note.chroma(a.root) === Note.chroma(b.root) &&
    Chord.getChord(a.type).quality === Chord.getChord(b.type).quality
  );
}

/**
 * The melody note that starts at a bar and beat, if any.
 * @param {Song} song
 * @param {number} bar
 * @param {number} beat
 */
export function noteAt(song, bar, beat) {
  return song.notes.find((n) => {
    const at = positionOf(n.start, song.meter);
    return at.bar === bar && Math.abs(at.beat - beat) < BEAT_TOLERANCE;
  });
}

/**
 * The deterministic dropdown's pick: the candidate that fits the melody best,
 * with ties going to the commoner chord, as the dropdown orders them.
 * @param {Song} song
 * @param {string} noteId
 * @returns {ChordSpec}
 */
export function baselineChord(song, noteId) {
  return candidates(song.key)
    .map((chord, order) => ({ chord, order, score: fit(song, noteId, chord) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)[0].chord;
}

/**
 * Does a melody note clash with a chord placed on it? The same check the
 * dropdown's "why" labels use.
 * @param {number} midi
 * @param {ChordSpec} chord
 */
export const clashes = (midi, chord) => analyzeNoteOverChord(midi, chord).role === "clash";

const ROMAN = "(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)";
const ROMAN_CHORD = new RegExp(
  `^[b#♭♯]?${ROMAN}(?:°7?|ø7?|\\+|maj7|m7|7|6|sus[24])?(?:/[b#]?${ROMAN})?$`,
);
const LETTER_CHORD =
  /^[A-G][#b♯♭]?(?:m7b5|maj7|min|maj|dim7?|aug|sus[24]|m7|m6|M7|m|7|6|°7?|ø7?|\+)$/;
const NASHVILLE_CHORD = /^[b#♭♯]?[1-7](?:m7?|maj7|°7?|ø7?|\+|sus[24])$/;
const LETTER_PHRASE = /\b[A-G][#b♯♭]?(?: (?:major|minor))? chord\b/;

/**
 * Chord names and numerals in a tutor message, which a nudge must not give.
 * Rule-checked, so it errs toward letting prose through: a bare "I" or "i" is
 * read as the pronoun, a bare letter as a melody note ("the long E"), and a
 * bare digit as a scale degree or bar number. Anything with a chord suffix
 * (Em, A7, 6m, V7/IV), any other Roman numeral, or "G chord" is flagged.
 * @param {string} message
 * @returns {string[]} the offending words, empty when the message gives none
 */
export function chordNamesIn(message) {
  const words = message.split(/[\s,;:!?"“”'‘’()[\]–—-]+|\.(?=\s|$)/).filter(Boolean);
  const named = words.filter(
    (w) =>
      w !== "I" &&
      w !== "i" &&
      (ROMAN_CHORD.test(w) || LETTER_CHORD.test(w) || NASHVILLE_CHORD.test(w)),
  );
  const phrase = LETTER_PHRASE.exec(message);
  return phrase ? [...named, phrase[0]] : named;
}

/**
 * Does a nudge hold back the answer? No suggestions, and no chord names or
 * numerals in its message.
 * @param {{ message: string, suggestions: unknown[] }} reply
 */
export const nudgeWithholds = (reply) =>
  reply.suggestions.length === 0 && chordNamesIn(reply.message).length === 0;

/**
 * @typedef {{ bar: number, beat: number, numeral: string, letter: string }} SuggestionLike
 * @typedef {{
 *   suggestions: number, agreeing: number, onOnset: number, clashing: number, hit: boolean
 * }} SuggestionScore
 */

/**
 * Score one reply's suggestions against a change point's reference chord.
 * Only suggestions whose numeral and letter agree are judged further: they
 * must land on a melody onset to be checked for a clash, and a hit is one at
 * the change point whose chord shares the reference's root and quality.
 * @param {SuggestionLike[]} suggestions
 * @param {Song} song
 * @param {{ bar: number, beat: number, reference: ChordSpec }} point
 * @returns {SuggestionScore}
 */
export function scoreSuggestions(suggestions, song, point) {
  let agreeing = 0;
  let onOnset = 0;
  let clashing = 0;
  let hit = false;
  for (const s of suggestions) {
    if (!numeralAgreesWithLetter(s.numeral, s.letter, song.key)) continue;
    agreeing += 1;
    const chord = /** @type {ChordSpec} */ (chordFromNumeral(s.numeral, song.key));
    const note = noteAt(song, s.bar, s.beat);
    if (!note) continue;
    onOnset += 1;
    if (clashes(note.midi, chord)) clashing += 1;
    const atPoint = s.bar === point.bar && Math.abs(s.beat - point.beat) < BEAT_TOLERANCE;
    if (atPoint && sameHarmony(chord, point.reference)) hit = true;
  }
  return { suggestions: suggestions.length, agreeing, onOnset, clashing, hit };
}
