/**
 * What a tutor message says, read by rule: the bars it cites, the numbered
 * tests it lists, the repeats in the melody it should point out, and the
 * chords it names as alternatives. Pure functions; theory comes from
 * src/theory, so a named chord is read exactly as the app reads a label.
 *
 * Every rule here errs toward letting ordinary prose through: a reply is
 * marked down only for what the rule can see plainly.
 *
 * @import { ChordSpec, Key, Song } from "../src/types.js"
 * @import { SuggestionLike } from "./metrics.js"
 */

import { Note as TNote } from "tonal";
import { chordFromLetter, chordFromNumeral } from "../src/theory/index.js";
import { NUMERAL_FORMS } from "../src/theory/numerals.js";
import { DEGREE_INTERVALS } from "../src/theory/pitch.js";
import { BEAT_TOLERANCE, sameHarmony } from "./metrics.js";

/**
 * One place the message points at: a bar, or a run of bars, and a beat when
 * it names one ("bar 5, beat 3"). `index` is where it starts in the text.
 * @typedef {{ from: number, to: number, beat: number | null, index: number }} BarCitation
 */

const BAR_WORD = /\b(?:bars?|measures?)\s+/gi;
const NUMBER_OR_RANGE = /^(\d+)(?:\s*(?:[-–—]|to|through|thru)\s*(\d+))?/i;
const LIST_JOIN = /^(?:\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*)/i;
const BEAT_AFTER = /^,?\s*beats?\s+(\d+(?:\.\d+)?)/i;
/** What may follow a bar reached by a bare comma: another item, "and", or the list's end. */
const LIST_GOES_ON = /^(?:\s*,|\s+and\b|\s*&|\s*[.;:!?)\]]|\s*$)/i;

/**
 * The bars a message cites: "bar 5", "bars 5–8", "bars 1, 5, and 9",
 * "measures 3 to 4", each with its beat when one follows ("bar 5, beat 3").
 * A bare number is never read as a bar, nor is one after a comma unless the
 * list goes on or ends there: "bar 3, 5 times" cites bar 3 only.
 * @param {string} text
 * @returns {BarCitation[]}
 */
export function barCitations(text) {
  /** @type {BarCitation[]} */
  const cited = [];
  for (const m of text.matchAll(BAR_WORD)) {
    let at = /** @type {number} */ (m.index) + m[0].length;
    let afterComma = false;
    for (;;) {
      const range = text.slice(at).match(NUMBER_OR_RANGE);
      if (!range) break;
      // "bar 3, 5 times": a number after a bare comma is a bar only when the list goes on or ends.
      if (afterComma && !LIST_GOES_ON.test(text.slice(at + range[0].length))) break;
      const from = Number(range[1]);
      const to = range[2] === undefined ? from : Number(range[2]);
      at += range[0].length;
      const beat = range[2] === undefined ? text.slice(at).match(BEAT_AFTER) : null;
      cited.push({
        from: Math.min(from, to),
        to: Math.max(from, to),
        beat: beat ? Number(beat[1]) : null,
        index: /** @type {number} */ (m.index),
      });
      if (beat) break;
      const join = text.slice(at).match(LIST_JOIN);
      if (!join || !/^\d/.test(text.slice(at + join[0].length))) break;
      afterComma = !/and|&/i.test(join[0]);
      at += join[0].length;
    }
  }
  return cited;
}

/**
 * The bars a song has, as the tutor's snapshot numbers them: bar 0 is the
 * pickup, when there is one, and the last bar is the one the last note
 * starts in.
 * @param {{ bars: { bar: number }[] }} snapshot
 */
export const barsOf = (snapshot) => new Set(snapshot.bars.map((b) => b.bar));

/**
 * The bars a message cites that the song doesn't have ("bar 99" in a
 * 16-bar song). Every bar of a cited range must exist.
 * @param {string} message
 * @param {Set<number>} bars
 * @returns {number[]} the missing bars, empty when every cited bar exists
 */
export function missingBars(message, bars) {
  const missing = new Set();
  for (const { from, to } of barCitations(message)) {
    for (let b = from; b <= to; b += 1) if (!bars.has(b)) missing.add(b);
  }
  return [...missing].sort((a, b) => a - b);
}

/**
 * Two runs of bars, each 2 or more long, with the same melody by scale degree.
 * @typedef {{ first: [number, number], second: [number, number] }} Repeat
 */

/**
 * The repeats in a melody, found by code: two runs of 2 or more whole bars
 * (after any pickup) whose notes have the same scale-degree sequence bar by
 * bar, not overlapping. Only maximal ones: a repeat that extends a bar
 * either way is reported once, at its full length. A bar with no note
 * starting in it never matches, so held notes and rests can't make one.
 * @param {{ bars: { bar: number, notes: { degree: string }[] }[] }} snapshot
 * @returns {Repeat[]}
 */
export function findRepeats(snapshot) {
  /** @type {Map<number, string>} */
  const seq = new Map();
  for (const b of snapshot.bars) {
    if (b.bar >= 1 && b.notes.length) seq.set(b.bar, b.notes.map((n) => n.degree).join(" "));
  }
  const same = (/** @type {number} */ a, /** @type {number} */ b) =>
    seq.has(a) && seq.get(a) === seq.get(b);
  const numbers = [...seq.keys()].sort((a, b) => a - b);
  /** @type {Repeat[]} */
  const repeats = [];
  for (const i of numbers) {
    for (const j of numbers) {
      if (j <= i || same(i - 1, j - 1)) continue;
      let length = 0;
      while (i + length < j && same(i + length, j + length)) length += 1;
      if (length >= 2) {
        repeats.push({ first: [i, i + length - 1], second: [j, j + length - 1] });
      }
    }
  }
  return repeats;
}

/**
 * Does a citation point at a run of bars? It must start within a bar of the
 * run's start and end no more than a bar past its end, so "bars 1–4" cites
 * 1–4 (and 1–3, or 2–5), "bar 9" cites 9–12, and "bars 1–16" cites nothing
 * shorter.
 * @param {BarCitation} c
 * @param {[number, number]} span
 */
const cites = (c, [start, end]) => Math.abs(c.from - start) <= 1 && c.to <= end + 1;

/**
 * Does the message point out a repeat in the melody by both its places? It
 * passes when some repeat has each of its two runs cited by a different
 * citation. Null when the melody has no repeat to find.
 * @param {string} message
 * @param {Repeat[]} repeats
 * @returns {boolean | null}
 */
export function citesRepeat(message, repeats) {
  if (!repeats.length) return null;
  const cited = barCitations(message);
  return repeats.some((r) =>
    cited.some((a) => cites(a, r.first) && cited.some((b) => b !== a && cites(b, r.second))),
  );
}

/**
 * How many numbered tests (things to try) a message lists: list items that
 * start a line ("1.", "2)", "(3)", "Step 4:"), "(1)" inline, and "Test 2" or "test #2",
 * counted by distinct number. An inline "1." is not counted: "…in bar 4. Then"
 * reads the same.
 * @param {string} message
 */
export function numberedTests(message) {
  const numbers = new Set();
  for (const m of message.matchAll(/^\s*(?:(\d+)[.)]|\((\d+)\))\s/gm)) numbers.add(m[1] ?? m[2]);
  for (const m of message.matchAll(/(?:^|\s)\((\d+)\)\s/g)) numbers.add(m[1]);
  for (const m of message.matchAll(/\btest\s*#?(\d+)\b/gi)) numbers.add(m[1]);
  for (const m of message.matchAll(/^\s*step\s+(\d+)\s*:/gim)) numbers.add(m[1]);
  return numbers.size;
}

const ROMAN = "(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)";
const ROMAN_CHORD = new RegExp(
  `^[b#]?${ROMAN}(?:°7?|ø7?|o7|\\+|maj7|m7|7|6|sus[24])?(?:/[b#]?${ROMAN})?$`,
);
const LETTER_CHORD =
  /^[A-G][#b]?(?:m7b5|maj7|min|maj|dim7?|aug|sus[24]|m7|m6|M7|m|7|6|°7?|ø7?|o7|\+)$/;
const NASHVILLE = /^([b#]?)([1-7])(m7|m6|maj7|m|°7|°|ø7|\+|sus[24]|7|6)?$/;
const CHORD_NOUN = "(?:chord|triad|seventh)";
const LETTER_PHRASE = new RegExp(
  `\\b([A-G][#b]?) (?:(major|minor|diminished|augmented)(?: ${CHORD_NOUN})?|${CHORD_NOUN})\\b`,
  "g",
);
const ENDS_IN_CHORD_NOUN = new RegExp(`${CHORD_NOUN}$`);
/** "in G major", "the key of E minor", "G major scale": naming the key, not a chord. */
const KEY_BEFORE = /\b(?:in|key of|key is)\s+$/i;
const KEY_AFTER = /^\s+(?:key|scale)\b/i;
const QUALITY = { major: "M", minor: "m", diminished: "dim", augmented: "aug" };

/** Superscripts and music signs, read as their plain forms. */
const PLAIN = /** @type {Record<string, string>} */ ({
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "♭": "b",
  "♯": "#",
  º: "°",
});
const SUPERSCRIPT = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/;

/**
 * A Nashville number read into a chord: counted from the tonic in major and
 * minor alike, a bare number major (src/theory's `nashvilleOf`, reversed).
 * @param {string} token e.g. "5" with "7", "2m", "b7"
 * @param {Key} key
 * @returns {ChordSpec | null}
 */
function chordFromNashville(token, key) {
  const m = token.match(NASHVILLE);
  if (!m) return null;
  const [, acc, degree, suffix = ""] = m;
  const form = NUMERAL_FORMS.find((f) => f.nashville === suffix);
  if (!form) return null;
  const diatonic = TNote.transpose(key.tonic, DEGREE_INTERVALS[key.mode][Number(degree) - 1]);
  const shift = acc === "b" ? "-1A" : acc === "#" ? "1A" : "1P";
  return { root: TNote.pitchClass(TNote.transpose(diatonic, shift)), type: form.type };
}

/**
 * A chord the message names, where it starts, and the chord it is.
 * @typedef {{ text: string, index: number, chord: ChordSpec }} NamedChord
 */

/**
 * The chords a message names, in any label style: Roman numerals ("ii",
 * "V7/IV", "bVII"), letter symbols with a quality ("G7", "Em", "F#°"),
 * letter phrases ("D minor", "the C chord"), and Nashville numbers with a
 * quality or a superscript ("2m", "5⁷"). Read to be sure, not to be complete:
 * a bare "I" or "i" is the pronoun, a bare letter a melody note ("the long
 * E"), a bare digit a degree or a bar, "in G major" names the key, and
 * "Am I" is a question ("o" alone is never read as diminished: "Go", "Do"). A
 * name the theory can't read ("iim7") is left out.
 * @param {string} message
 * @param {Key} key
 * @returns {NamedChord[]}
 */
export function namedChords(message, key) {
  /** @type {NamedChord[]} */
  const named = [];
  const plain = message.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹♭♯º]/g, (c) => PLAIN[c]);
  const isKey = (/** @type {number} */ index, /** @type {number} */ end) =>
    KEY_BEFORE.test(plain.slice(0, index)) || KEY_AFTER.test(plain.slice(end));
  for (const m of message.matchAll(/[^\s,;:!?"“”'‘’()[\]–—-]+/g)) {
    const raw = m[0].replace(/\.$/, "");
    const token = raw.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹♭♯º]/g, (c) => PLAIN[c]);
    const index = /** @type {number} */ (m.index);
    /** @type {ChordSpec | null} */
    let chord = null;
    if (token === "I" || token === "i") continue;
    // A chord token ends at a non-letter: "D'you" or "Am'll" is a word, and "Am I" is a question.
    const rest = message.slice(index + raw.length);
    if (/^['’]\p{L}/u.test(rest) || (token === "Am" && /^\s+I\b/.test(rest))) continue;
    if (ROMAN_CHORD.test(token)) chord = chordFromNumeral(token, key);
    else if (LETTER_CHORD.test(token) && !isKey(index, index + raw.length)) {
      chord = chordFromLetter(token.replace(/^([A-G][#b]?)maj$/, "$1"));
    } else {
      // A bare digit is a degree or a bar: a Nashville number needs a quality or a superscript.
      const nash = token.match(NASHVILLE);
      const quality = nash?.[3] && !/^[67]$/.test(nash[3]);
      const superscript = /^[b#♭♯]?[1-7]/.test(raw) && SUPERSCRIPT.test(raw.slice(1));
      if (nash && (quality || superscript)) {
        chord = chordFromNashville(token, key);
      }
    }
    if (chord) named.push({ text: raw, index, chord });
  }
  for (const m of plain.matchAll(LETTER_PHRASE)) {
    const index = /** @type {number} */ (m.index);
    if (!ENDS_IN_CHORD_NOUN.test(m[0]) && isKey(index, index + m[0].length)) continue;
    const quality = /** @type {keyof typeof QUALITY | undefined} */ (m[2]);
    named.push({
      text: m[0],
      index,
      chord: { root: m[1], type: quality ? QUALITY[quality] : "M" },
    });
  }
  return named.sort((a, b) => a.index - b.index);
}

/**
 * Prose that gives a chord to the student's own chart: "your Dm", "your IV
 * and V", "you have IV here", "you've got V7", "instead of IV", "rather than
 * vi", "replace ii". Matched at the end of the sentence's text before the
 * chord, allowing other names joined by "and", "or", or commas between.
 */
const STUDENTS_BEFORE =
  /\b(?:your|you(?:['’]ve|\s+have|\s+had|\s+used|\s+put|\s+placed|\s+chose|\s+picked|\s+wrote|\s+tried)(?:\s+got)?|instead\s+of|rather\s+than|replac(?:e|es|ing))\s+(?:(?:the|a|an|own|current|chosen|placed|existing|chord|this|that)\s+)*(?:\S+\s*(?:,\s*(?:and|or)?|and|or)\s*)*$/i;
/** "IV, the chord you placed", "V (yours)", "the V you have". */
const STUDENTS_AFTER =
  /^\S*\s*(?:\(\s*yours\s*\)|,?\s*(?:the\s+(?:chord\s+)?)?(?:that\s+|which\s+)?you(?:['’]ve)?\s+(?:have|had|placed|put|used|chose|picked|wrote))/i;

/**
 * The sentences of a message, each with where it starts.
 * @param {string} message
 */
function sentences(message) {
  /** @type {{ text: string, index: number }[]} */
  const out = [];
  // A stop ends a sentence only before a space or the end: "V7/IV." does, "beat 3.5" doesn't.
  const re = /[^.!?\n]*(?:[.!?]+(?!\s|$)[^.!?\n]*)*(?:[.!?]+|$)/gm;
  for (const m of message.matchAll(re)) {
    if (m[0].trim()) out.push({ text: m[0], index: /** @type {number} */ (m.index) });
  }
  return out;
}

/**
 * Is a card at a cited place: one of the bars cited, at the cited beat when
 * there is one?
 * @param {SuggestionLike} s
 * @param {BarCitation[]} cited
 */
const atCited = (s, cited) =>
  cited.some(
    (c) =>
      s.bar >= c.from &&
      s.bar <= c.to &&
      (c.beat === null || Math.abs(s.beat - c.beat) < BEAT_TOLERANCE),
  );

/** @param {SuggestionLike} s @param {Key} key */
const cardChord = (s, key) => chordFromNumeral(s.numeral, key) ?? chordFromLetter(s.letter);

/**
 * The chart a reply is about: the student's chords, each at its bar and
 * beat as the snapshot gives them.
 * @typedef {{ bar: number, beat: number, chord: ChordSpec }[]} Chart
 */

/**
 * Every chord a message names as an alternative, and the ones with no card
 * in `suggestions` to audition.
 *
 * A chord's place is the bars its sentence cites, plus those of the last
 * sentence earlier on the same line that cites any ("In bar 7 the line climbs. ii under the 2 turns
 * it into a ii-V-I" puts that ii in bar 7). A chord counts as the student's
 * own, not an alternative, when the prose gives it to them
 * (`STUDENTS_BEFORE`, `STUDENTS_AFTER`), or when the chart has it at its
 * place ("IV at bar 3 sets up V"), or, with no place at all, anywhere in the
 * chart ("V wants home", about the student's V; in a check, the chord asked
 * about). An alternative has its card when a suggestion names the same root
 * and triad quality (V7 matches a V card), at its place if it has one.
 *
 * Limits: a chord named only to explain ("the E is the third of C") reads as
 * an alternative unless the chart has it there; a possessive the patterns
 * miss ("what you've got in bar 3 is IV") reads as one too; with no bar in
 * sight, a suggestion of a chord the chart has elsewhere ("try IV") reads as
 * the student's. Every chord in a sentence shares its place.
 * @param {string} message
 * @param {SuggestionLike[]} suggestions
 * @param {Key} key
 * @param {Chart} chart
 * @returns {{ alternatives: string[], uncarded: string[] }}
 */
export function namedAlternatives(message, suggestions, key, chart) {
  /** @type {string[]} */
  const alternatives = [];
  /** @type {string[]} */
  const uncarded = [];
  let line = -1;
  /** @type {BarCitation[]} */
  let earlier = [];
  for (const sentence of sentences(message)) {
    const lineOf = message.slice(0, sentence.index).split("\n").length;
    if (lineOf !== line) [line, earlier] = [lineOf, []];
    const own = barCitations(sentence.text);
    const place = [...earlier, ...own];
    if (own.length) earlier = own;
    const inChart = (/** @type {ChordSpec} */ chord) =>
      chart.some(
        (c) =>
          sameHarmony(c.chord, chord) &&
          (!place.length || atCited({ ...c, numeral: "", letter: "" }, place)),
      );
    for (const { text, index, chord } of namedChords(sentence.text, key)) {
      const before = sentence.text.slice(0, index);
      const after = sentence.text.slice(index);
      if (STUDENTS_BEFORE.test(before) || STUDENTS_AFTER.test(after)) continue;
      if (inChart(chord)) continue;
      alternatives.push(text);
      const carded = suggestions.some((s) => {
        const c = cardChord(s, key);
        return c && sameHarmony(c, chord) && (!place.length || atCited(s, place));
      });
      if (!carded) uncarded.push(text);
    }
  }
  return { alternatives, uncarded };
}
