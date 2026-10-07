/**
 * The theory core's public API (Stream A). Pure functions: no DOM, audio, or
 * store imports (enforced by ESLint). Everything relative-pitch lives here, so
 * the app, the store, and the Node eval harness share one definition.
 *
 * CONTRACT: exported names, parameters, and return shapes are frozen (see
 * contracts/README.md). Bodies marked STUB(A) are Phase 0 placeholders that
 * return plausible values; Stream A replaces them and adds tests.
 *
 * @import { Key, Meter, Note, Chord, ChordSpec, Song, ScaleDegree, HarmonicFunction, NoteRole } from "../types.js"
 */

import { Chord as TChord, Interval, Note as TNote } from "tonal";
import functions from "../../contracts/functions.json" with { type: "json" };
import { positionOf, ticksPerBar } from "./meter.js";

export { TICKS_PER_QUARTER, positionOf, ticksPerBar, ticksPerBeat } from "./meter.js";

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/** @param {Key} key MIDI of degree 1 in the home octave. STUB(A): register choice. */
function tonicMidi(key) {
  const chroma = /** @type {number} */ (TNote.chroma(key.tonic));
  return 60 + (chroma > 6 ? chroma - 12 : chroma);
}

// --- Pitch and key ---------------------------------------------------------

/**
 * Spell a MIDI pitch in the context of a key, e.g. 66 in D major → "F#4".
 * @param {number} midi
 * @param {Key} key
 * @returns {string}
 */
export function spell(midi, key) {
  // STUB(A): flat keys spell with flats, everything else with sharps.
  const flatKey = key.tonic.includes("b") || key.tonic === "F";
  return flatKey ? TNote.fromMidi(midi) : TNote.fromMidiSharps(midi);
}

/**
 * Resolve a scale degree to an absolute pitch. Minor keys use natural minor.
 * @param {ScaleDegree} degree
 * @param {Key} key
 * @param {number} [windowOctave=0] The arrow keys' octave shift of the whole input window.
 * @returns {number} MIDI
 */
export function degreeToMidi({ degree, accidental, octave }, key, windowOctave = 0) {
  const step = SCALES[key.mode][degree - 1];
  return tonicMidi(key) + step + accidental + 12 * (octave + windowOctave);
}

/**
 * The inverse of degreeToMidi: which degree (and octave dot) a pitch is in a key.
 * @param {number} midi
 * @param {Key} key
 * @returns {ScaleDegree}
 */
export function midiToDegree(midi, key) {
  const fromTonic = midi - tonicMidi(key);
  const octave = Math.floor(fromTonic / 12);
  const pc = fromTonic - octave * 12;
  const scale = SCALES[key.mode];
  const exact = scale.indexOf(pc);
  // STUB(A): chromatic notes read as a raised degree below; real spelling is contextual.
  const index = exact >= 0 ? exact : scale.indexOf(pc - 1);
  const degree = /** @type {ScaleDegree["degree"]} */ (index + 1);
  return { degree, accidental: exact >= 0 ? 0 : 1, octave };
}

const ROW_DEGREES = {
  Digit: ["1", "2", "3", "4", "5", "6", "7"],
  upper: ["Q", "W", "E", "R", "T", "Y", "U"],
  lower: ["A", "S", "D", "F", "G", "H", "J"],
};

/**
 * Map a physical key (KeyboardEvent.code) and modifiers to a scale degree.
 * Number row = home octave, with 8 9 0 continuing to 1 2 3 above; Q–U = one
 * octave below; A–J = two below. Shift raises, Alt/Option lowers.
 * @param {string} code e.g. "Digit5", "KeyU"
 * @param {{ shift: boolean, alt: boolean }} modifiers
 * @returns {ScaleDegree | null} null for keys that are not note keys
 */
export function keyEventToDegree(code, { shift, alt }) {
  const accidental = shift && !alt ? 1 : alt && !shift ? -1 : 0;
  /** @param {number} index @param {number} octave */
  const at = (index, octave) => ({
    degree: /** @type {ScaleDegree["degree"]} */ (index + 1),
    accidental: /** @type {ScaleDegree["accidental"]} */ (accidental),
    octave,
  });
  const digit = code.match(/^Digit(\d)$/)?.[1];
  if (digit) {
    const n = Number(digit);
    if (n >= 1 && n <= 7) return at(n - 1, 0);
    return at({ 8: 0, 9: 1, 0: 2 }[n] ?? 0, 1);
  }
  const letter = code.match(/^Key([A-Z])$/)?.[1];
  if (!letter) return null;
  const upper = ROW_DEGREES.upper.indexOf(letter);
  if (upper >= 0) return at(upper, -1);
  const lower = ROW_DEGREES.lower.indexOf(letter);
  if (lower >= 0) return at(lower, -2);
  return null;
}

// --- Chord naming -------------------------------------------------------------

/** Diatonic intervals from the tonic, by mode (natural minor). */
const DEGREE_INTERVALS = {
  major: ["1P", "2M", "3M", "4P", "5P", "6M", "7M"],
  minor: ["1P", "2M", "3m", "4P", "5P", "6m", "7m"],
};

/**
 * How each chord type in contracts/song.schema.json is written as a numeral:
 * case (lowercase = minor-third family) and suffix. One table, so parsing and
 * formatting can never disagree.
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
 * Scale degree of a chord root, by letter name, so spelling decides the degree
 * (Bb in D major is b6, A# would be #5).
 * @param {string} root
 * @param {Key} key
 * @returns {{ degree: number, accidental: number }}
 */
function rootDegree(root, key) {
  const letters = "CDEFGAB";
  const degree = ((letters.indexOf(root[0]) - letters.indexOf(key.tonic[0]) + 7) % 7) + 1;
  const diatonic = TNote.transpose(key.tonic, DEGREE_INTERVALS[key.mode][degree - 1]);
  const accidental =
    (((((TNote.chroma(root) ?? 0) - (TNote.chroma(diatonic) ?? 0)) % 12) + 18) % 12) - 6;
  return { degree, accidental };
}

/**
 * The Roman numeral of a chord in a key, e.g. A7 in D major → "V7",
 * Bb in D major → "bVI". "?" when the root is more than a semitone from the scale.
 * @param {ChordSpec} chord
 * @param {Key} key
 * @returns {string}
 */
export function numeralOf(chord, key) {
  // STUB(A): no applied-chord detection (V7/IV comes out as I7).
  const { degree, accidental } = rootDegree(chord.root, key);
  const form = NUMERAL_FORMS.find((f) => f.type === chord.type);
  if (!form || Math.abs(accidental) > 1) return "?";
  const roman = ROMAN[degree - 1];
  const prefix = accidental === -1 ? "b" : accidental === 1 ? "#" : "";
  return prefix + (form.lower ? roman.toLowerCase() : roman) + form.suffix;
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
  const { degree, accidental } = rootDegree(chord.root, key);
  const form = NUMERAL_FORMS.find((f) => f.type === chord.type);
  if (!form || Math.abs(accidental) > 1) return "?";
  const prefix = accidental === -1 ? "b" : accidental === 1 ? "#" : "";
  return `${prefix}${degree}${form.nashville}`;
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
  if (!parsed) return null;
  // An applied chord is measured from its target's root, as if that root were a major tonic.
  const home = parsed.of ? chordFromNumeral(numeral.split("/")[1], key) : null;
  const tonic = home ? home.root : key.tonic;
  const mode = home ? "major" : key.mode;
  const diatonic = TNote.transpose(tonic, DEGREE_INTERVALS[mode][parsed.degree - 1]);
  const shift = { "-1": "-1A", 0: "1P", 1: "1A" }[parsed.accidental];
  const root = TNote.pitchClass(TNote.transpose(diatonic, shift));
  return { root, type: parsed.type };
}

/**
 * Harmonic function of a numeral, which drives every color and shape in the
 * app. Data lives in contracts/functions.json.
 * @param {string} numeral
 * @param {"major" | "minor"} mode
 * @returns {HarmonicFunction}
 */
export function functionOf(numeral, mode) {
  const parsed = parseNumeral(numeral);
  if (!parsed) return "other";
  const diminished = ["dim", "dim7", "m7b5"].includes(parsed.type);
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

// --- Harmony -------------------------------------------------------------------

/**
 * Pitch classes of a chord, root first, e.g. A7 → ["A", "C#", "E", "G"].
 * @param {ChordSpec} chord
 * @returns {string[]}
 */
export function chordTones(chord) {
  return TChord.getChord(chord.type, chord.root).notes;
}

/**
 * What a melody note is over a chord. This one function drives the dropdown's
 * "why" labels, fit, the clash check, and the evals.
 * @param {number} midi
 * @param {ChordSpec} chord
 * @returns {{ role: NoteRole, interval: string }}
 */
export function analyzeNoteOverChord(midi, chord) {
  // STUB(A): interval class only, no tension-vs-clash judgment.
  const semis = (midi - (TNote.chroma(chord.root) ?? 0) + 120) % 12;
  const interval = Interval.fromSemitones(semis);
  const tones = chordTones(chord).map((n) => TNote.chroma(n));
  if (!tones.includes(midi % 12)) return { role: semis === 1 ? "clash" : "tension", interval };
  /** @type {Record<number, NoteRole>} */
  const roles = { 0: "root", 3: "third", 4: "third", 6: "fifth", 7: "fifth", 8: "fifth" };
  return { role: roles[semis] ?? "seventh", interval };
}

/**
 * The likely suspects for the dropdown, in the current key and mode, unordered.
 * @param {Key} key
 * @param {{ extended?: boolean }} [options] extended: secondary dominants, borrowed, passing diminished
 * @returns {ChordSpec[]}
 */
export function candidates(key, { extended = false } = {}) {
  const numerals =
    key.mode === "major" ? ["I", "IV", "V", "vi", "ii", "iii"] : ["i", "iv", "V", "III", "VI"];
  // STUB(A): extended vocabulary.
  const extra = extended ? ["V7/IV", "V7/V", "bVII", "iv"] : [];
  return [...numerals, ...extra].map((n) => chordFromNumeral(n, key)).filter((c) => c !== null);
}

/**
 * How well a chord fits the melody around a note: melody notes within the
 * chord's span, weighted by beat strength and duration.
 * @param {Song} song
 * @param {string} noteId the note the chord would sit on
 * @param {ChordSpec} chord
 * @returns {number} 0..1
 */
export function fit(song, noteId, chord) {
  // STUB(A): only the anchor note, unweighted.
  const note = song.notes.find((n) => n.id === noteId);
  if (!note) return 0;
  const score = { root: 1, third: 1, fifth: 0.9, seventh: 0.7, tension: 0.4, clash: 0.1 };
  return score[analyzeNoteOverChord(note.midi, chord).role];
}

/**
 * Rank all 24 keys by Krumhansl-Schmuckler correlation. Candidates, never a
 * verdict: out-of-scale notes are annotations, not filters ("F natural is
 * outside D major"), so a blue-note melody keeps its real key in the running.
 * @param {Note[]} notes
 * @returns {{ key: Key, score: number, outOfScale: { noteId: string, pitch: string }[] }[]}
 *   24 entries, best first; `pitch` is spelled in that key, e.g. "F4"
 */
export function rankKeys(notes) {
  void notes; // STUB(A): fixed order, C major first.
  const tonics = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
  return ["major", "minor"].flatMap((mode, m) =>
    tonics.map((tonic, i) => ({
      key: { tonic, mode: /** @type {Key["mode"]} */ (mode), provisional: true },
      score: 1 - (m * 12 + i) / 24,
      outOfScale: [],
    })),
  );
}

/**
 * Guess rhythm from key-down/up times. The most common gap between onsets is
 * the beat (a quarter); other gaps snap to ½, 1, 1½, 2, 3, or 4 beats; a
 * pause over half a beat after a release becomes a rest; the last note's
 * length comes from its release.
 * @param {{ downMs: number, upMs: number }[]} events in order
 * @returns {{ notes: { start: number, dur: number }[], beatMs: number }} notes in ticks
 *   from 0; `beatMs` is the detected beat, so record mode can set the tempo
 */
export function guessRhythm(events) {
  // STUB(A): plain quarter notes at the first gap's tempo.
  const beatMs = events.length > 1 ? events[1].downMs - events[0].downMs : 625;
  return { notes: events.map((_, i) => ({ start: i * 12, dur: 12 })), beatMs };
}

/**
 * Voice a chord with nearest-inversion voice leading in a fixed register below
 * the melody, so auditioned alternatives differ only in harmony.
 * @param {ChordSpec} chord
 * @param {number[] | null} previous the previous chord's voicing, if any
 * @param {{ low: number, high: number }} [register] MIDI bounds, default C3–C4
 * @returns {number[]} MIDI, ascending
 */
export function voice(chord, previous, register = { low: 48, high: 60 }) {
  void previous; // STUB(A): root position, no voice leading.
  const rootMidi =
    register.low + (((((TNote.chroma(chord.root) ?? 0) - register.low) % 12) + 12) % 12);
  return chordTones(chord).map((pc) => {
    const up = ((((TNote.chroma(pc) ?? 0) - rootMidi) % 12) + 12) % 12;
    return rootMidi + up;
  });
}

// --- Meter and transforms ---------------------------------------------------

/**
 * Lay out bars for a meter hypothesis. Notes never move; only bar lines do.
 * Bar 0 is the pickup when meter.pickupTicks > 0.
 * @param {Song} song
 * @param {Meter} meter
 * @returns {{ index: number, startTick: number, noteIds: string[] }[]}
 */
export function rebar(song, meter) {
  const end = song.notes.reduce((max, n) => Math.max(max, n.start + n.dur), 0);
  const barTicks = ticksPerBar(meter);
  const firstBar = meter.pickupTicks > 0 ? 0 : 1;
  const lastBar = end === 0 ? firstBar : positionOf(end - 1, meter).bar;
  const bars = [];
  for (let index = firstBar; index <= lastBar; index++) {
    const startTick = index === 0 ? 0 : meter.pickupTicks + (index - 1) * barTicks;
    const noteIds = song.notes
      .filter((n) => positionOf(n.start, meter).bar === index)
      .map((n) => n.id);
    bars.push({ index, startTick, noteIds });
  }
  return bars;
}

/**
 * Move melody, chords, and tonic together by a number of semitones.
 * @param {Song} song
 * @param {number} semitones
 * @returns {Song}
 */
export function transposeSong(song, semitones) {
  // STUB(A): enharmonic choice (F# vs Gb) per the PRD's conventional-key list.
  const interval = Interval.fromSemitones(semitones);
  /** @param {string} pc */
  const move = (pc) => TNote.simplify(TNote.transpose(pc, interval));
  return {
    ...song,
    key: { ...song.key, tonic: move(song.key.tonic) },
    notes: song.notes.map((n) => ({ ...n, midi: n.midi + semitones })),
    chords: song.chords.map((c) => ({ ...c, root: move(c.root) })),
  };
}

/**
 * Change the key hypothesis only; notes and chords stay as heard and every
 * label re-derives.
 * @param {Song} song
 * @param {Key} key
 * @returns {Song}
 */
export function rekeySong(song, key) {
  return { ...song, key };
}
