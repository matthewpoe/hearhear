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
  parseNumeral,
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
 * with ties going to the commoner chord, as the dropdown orders them. It is
 * judged on the bare melody, like the tutor, so a reference chord placed
 * later in the song can't shorten the span it is fitted over.
 * @param {Song} song
 * @param {string} noteId
 * @returns {ChordSpec}
 */
export function baselineChord(song, noteId) {
  const melody = { ...song, chords: [] };
  return candidates(song.key)
    .map((chord, order) => ({ chord, order, score: fit(melody, noteId, chord) }))
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
const CHORD_NOUN = "(?:chord|triad|seventh)";
const LETTER_PHRASE = new RegExp(
  `\\b[A-G][#b♯♭]? (?:(?:major|minor|diminished|augmented)(?: ${CHORD_NOUN})?|${CHORD_NOUN})\\b`,
  "g",
);
const ENDS_IN_CHORD_NOUN = new RegExp(`${CHORD_NOUN}$`);
/** "in G major", "the key of E minor", "G major scale": naming the key, not a chord. */
const KEY_BEFORE = /\b(?:in|key of|key is)\s+$/i;
const KEY_AFTER = /^\s+(?:key|scale)\b/i;

/**
 * Chord names and numerals in a tutor message, which a nudge must not give.
 * Rule-checked, so it errs toward letting prose through: a bare "I" or "i" is
 * read as the pronoun, a bare letter as a melody note ("the long E"), and a
 * bare digit as a scale degree or bar number, and "in G major" names the key.
 * Anything with a chord suffix (Em, A7, 6m, V7/IV), any other Roman numeral,
 * "G chord", or "D major" (with or without "triad" after it) is flagged.
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
  const phrases = [...message.matchAll(LETTER_PHRASE)]
    .filter(
      (m) =>
        ENDS_IN_CHORD_NOUN.test(m[0]) ||
        !(
          KEY_BEFORE.test(message.slice(0, m.index)) ||
          KEY_AFTER.test(message.slice(m.index + m[0].length))
        ),
    )
    .map((m) => m[0]);
  return [...named, ...phrases];
}

/**
 * Did the model hold back the answer at a nudge, on its own? The server
 * withholds every suggestion from a nudge, so an empty list proves nothing:
 * the model held back only if it offered nothing at all (`dropped`, the
 * invalid ones, plus `withheld`, the valid ones the server held back, is 0)
 * and its message names no chord or numeral.
 * @param {{ message: string, dropped: number, withheld: number }} reply
 */
export const nudgeWithholds = (reply) =>
  reply.dropped + reply.withheld === 0 && chordNamesIn(reply.message).length === 0;

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
 * @param {{ bar: number, beat: number, reference: ChordSpec | null }} point no hit without a reference
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
    if (atPoint && point.reference && sameHarmony(chord, point.reference)) hit = true;
  }
  return { suggestions: suggestions.length, agreeing, onOnset, clashing, hit };
}

/**
 * The least `fit` a plausible chord needs over the bare melody from its note
 * to the end of its bar. Set from the hymn baseline's distribution (see
 * evals/README.md): the hymnals' own chords reach it at nearly every change
 * point, and a chord below it fights most of the melody it would sit under.
 */
export const FIT_THRESHOLD = 0.5;

/** Each mode's diatonic triads, with minor's raised V and vii° beside its natural v and VII. */
const DIATONIC = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor: ["i", "ii°", "III", "iv", "v", "V", "VI", "VII", "vii°"],
};

/**
 * Is a chord in the vocabulary a player would recognize in this key: a
 * diatonic chord, the dropdown's applied, borrowed, or passing chords
 * (`candidates` extended), or any applied dominant (V/x, V7/x) or
 * leading-tone chord (vii°/x) the numeral names? A seventh or sixth counts as
 * its triad.
 * @param {string} numeral
 * @param {ChordSpec} chord
 * @param {Key} key
 */
export function recognized(numeral, chord, key) {
  const parsed = parseNumeral(numeral);
  if (parsed?.of && !parsed.accidental) {
    const dominant = parsed.degree === 5 && ["M", "7"].includes(parsed.type);
    const leading = parsed.degree === 7 && ["dim", "dim7", "m7b5"].includes(parsed.type);
    if (dominant || leading) return true;
  }
  const known = [
    ...DIATONIC[key.mode].map((n) => /** @type {ChordSpec} */ (chordFromNumeral(n, key))),
    ...candidates(key, { extended: true }),
  ];
  return known.some((k) => sameHarmony(k, chord));
}

/**
 * Is a suggestion a plausible, playable chord at a melody note? Judged by
 * code alone, with no reference: its numeral and letter agree; the note is a
 * chord tone or a tension over it (`analyzeNoteOverChord`), not a clash; it
 * fits the bare melody at or above `threshold` (FIT_THRESHOLD; other values
 * only for the results' sensitivity line); and it is `recognized`.
 * @param {{ numeral: string, letter: string }} suggestion
 * @param {Song} song
 * @param {import("../src/types.js").Note} note
 * @param {number} [threshold]
 */
export function plausible(suggestion, song, note, threshold = FIT_THRESHOLD) {
  if (!numeralAgreesWithLetter(suggestion.numeral, suggestion.letter, song.key)) return false;
  const chord = /** @type {ChordSpec} */ (chordFromNumeral(suggestion.numeral, song.key));
  if (clashes(note.midi, chord)) return false;
  if (fit({ ...song, chords: [] }, note.id, chord) < threshold) return false;
  return recognized(suggestion.numeral, chord, song.key);
}

/**
 * The dropdown's own top picks at a note: `candidates` sorted by fit on the
 * bare melody, ties to the commoner chord. `baselineChord` is the first.
 * @param {Song} song
 * @param {string} noteId
 * @param {number} [count]
 * @returns {ChordSpec[]}
 */
export function dropdownTop(song, noteId, count = 3) {
  const melody = { ...song, chords: [] };
  return candidates(song.key)
    .map((chord, order) => ({ chord, order, score: fit(melody, noteId, chord) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, count)
    .map((c) => c.chord);
}

/** Words that pass judgment on the player's choice instead of offering another. */
const VERDICT = /\b(?:wrong|incorrect|mistake|should have)\b/i;

/** The same words negated, which affirm the choice: "nothing wrong", "isn't a mistake". */
const NEGATED =
  /\b(?:nothing|not|isn['’]t|aren['’]t|no)\s+(?:(?:a|an|really|actually|at all)\s+)*(?:wrong|incorrect|mistake)\b/gi;

/**
 * Does a message pass a verdict ("wrong", "incorrect", "a mistake", "should
 * have")? Whole words, any case. A negated one ("there's nothing wrong with
 * V here", "not a mistake") affirms the choice, so it doesn't count.
 * @param {string} message
 */
export const usesVerdict = (message) => VERDICT.test(message.replace(NEGATED, ""));

/**
 * @typedef {{
 *   atPoint: number, considered: number, offTarget: number,
 *   distinct: number, plausible: number, beyond: number,
 *   alternatives: boolean,
 * }} AlternativesScore
 */

/** @param {ChordSpec} a @param {ChordSpec} b */
const sameChordSpec = (a, b) => Note.chroma(a.root) === Note.chroma(b.root) && a.type === b.type;

/**
 * Score a reply's ideas for the note asked about: the suggestions on it, the
 * ones weighed (`considered`: all but any of the chord the player placed and
 * asked about, which is not an alternative to itself), how many of those
 * aren't plausible (`offTarget`), the distinct chords they name, how many of
 * those are plausible, and how many plausible ones the dropdown's top 3
 * wouldn't have offered (`beyond`). It gives playable alternatives when at
 * least two distinct chords there are plausible. An off-target idea beside
 * them, such as a deliberate contrast, doesn't take that away: it is counted
 * in `offTarget`, reported on its own line.
 * @param {SuggestionLike[]} suggestions
 * @param {Song} song the melody, with no chords
 * @param {{ bar: number, beat: number }} point
 * @param {ChordSpec | null} [placed]
 * @param {number} [threshold] FIT_THRESHOLD; others only for the sensitivity line
 * @returns {AlternativesScore}
 */
export function scoreAlternatives(
  suggestions,
  song,
  point,
  placed = null,
  threshold = FIT_THRESHOLD,
) {
  const note = noteAt(song, point.bar, point.beat);
  const here = suggestions.filter(
    (s) => s.bar === point.bar && Math.abs(s.beat - point.beat) < BEAT_TOLERANCE,
  );
  const none = {
    atPoint: here.length,
    considered: 0,
    offTarget: 0,
    distinct: 0,
    plausible: 0,
    beyond: 0,
    alternatives: false,
  };
  if (!note) return none;
  const top = dropdownTop(song, note.id);
  /** @type {ChordSpec[]} */
  const seen = [];
  let considered = 0;
  let offTarget = 0;
  let good = 0;
  let beyond = 0;
  for (const s of here) {
    const agrees = numeralAgreesWithLetter(s.numeral, s.letter, song.key);
    const chord = agrees ? chordFromNumeral(s.numeral, song.key) : null;
    if (chord && placed && sameHarmony(chord, placed)) continue;
    considered += 1;
    const ok = plausible(s, song, note, threshold);
    if (!ok) offTarget += 1;
    if (!chord || seen.some((c) => sameChordSpec(c, chord))) continue;
    seen.push(chord);
    if (!ok) continue;
    good += 1;
    if (!top.some((t) => sameHarmony(t, chord))) beyond += 1;
  }
  return {
    atPoint: here.length,
    considered,
    offTarget,
    distinct: seen.length,
    plausible: good,
    beyond,
    alternatives: good >= 2,
  };
}
