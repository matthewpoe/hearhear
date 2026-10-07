/**
 * Song model → ABC notation for abcjs. The staff, the lead sheet, and print
 * all render this one string, so notation can never drift from the song.
 *
 * Layout: chord symbols above the staff in the user's label style, the same
 * text the chord chips show (the staff colors them by function after
 * rendering; shapes and chip boxes live only in the chord chip row), and
 * scale degrees on a lyric line with jianpu octave dots. In "hidden" label
 * mode nothing key-relative is written: the key signature is C with
 * accidentals on the notes, and each chord is a neutral mark with no name
 * (decision D2), so the notation doesn't give the key away.
 *
 * All theory comes from src/theory; this module only formats it.
 *
 * @import { Song, Key, LabelStyle } from "../types.js"
 * @import { KeyLabelMode } from "../store/ui.js"
 */

import { midiToDegree, spell, ticksPerBar, ticksPerBeat } from "../theory/index.js";
import { chordView } from "../chords/chordView.js";

/**
 * Note lengths abcjs can draw as one glyph, in ticks (12 per quarter, written
 * with L:1/48 so an ABC length is a tick count): dotted whole down to sixteenth.
 */
const DRAWABLE = [72, 48, 36, 24, 18, 12, 9, 6, 3];

const BARS_PER_LINE = 4;

/** What a chord shows in hidden mode: a neutral mark, no name (decision D2). */
export const HIDDEN_CHORD_MARK = "•";

/** Circle-of-fifths position of each natural letter's major key (C = 0). */
const LETTER_FIFTHS = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

const ABC_ACCIDENTAL = { "-2": "__", "-1": "_", 0: "=", 1: "^", 2: "^^" };
const DEGREE_ACCIDENTAL = { "-1": "♭", 0: "", 1: "♯" };
const SPOKEN_ACCIDENTAL = {
  "-2": " double flat",
  "-1": " flat",
  0: "",
  1: " sharp",
  2: " double sharp",
};
const DOT_ABOVE = "̇";
const DOT_BELOW = "̣";
/** Nashville's superscript seventh, written as a superscript character. */
const SUPERSCRIPT = { 7: "⁷" };

/**
 * @typedef {{ mode: KeyLabelMode, labelStyle: LabelStyle, showDegrees: boolean }} StaffView
 * @typedef {{ noteId: string, chordId: string | null }} NotePiece
 *   One drawn note glyph. A note that crosses a bar line or has an undrawable
 *   length becomes several tied pieces with the same noteId; only the first
 *   carries the chord.
 */

/**
 * @param {Song} song
 * @param {StaffView} view
 * @returns {{ abc: string, pieces: NotePiece[] }} `pieces` lists every drawn
 *   note glyph in order (rests excluded), to map abcjs's output back to ids.
 */
export function songToAbc(song, { mode, labelStyle, showDegrees }) {
  const { key, meter } = song;
  const hidden = mode === "hidden";
  const fifths = hidden ? null : keyFifths(key);
  const signature = fifths === null ? new Map() : keySignature(fifths);
  const barTicks = ticksPerBar(meter);
  const beatTicks = ticksPerBeat(meter);
  const chordByNote = new Map(song.chords.map((c) => [c.noteId, c]));

  /** @param {number} tick */
  const nextBarline = (tick) =>
    tick < meter.pickupTicks
      ? meter.pickupTicks
      : meter.pickupTicks + (Math.floor((tick - meter.pickupTicks) / barTicks) + 1) * barTicks;

  /** @type {{ text: string, syllables: string[] }[]} */
  const bars = [];
  /** @type {NotePiece[]} */
  const pieces = [];
  let bar = { text: "", syllables: /** @type {string[]} */ ([]), barStart: 0 };
  /** @type {Map<string, number>} accidentals in force this bar, by letter+octave */
  let inForce = new Map();
  let previousShort = { beat: -1, short: false };

  const closeBar = () => {
    bars.push({ text: bar.text.trim(), syllables: bar.syllables });
    bar = { text: "", syllables: [], barStart: nextBarline(bar.barStart) };
    inForce = new Map();
    previousShort = { beat: -1, short: false };
  };

  /**
   * Append one glyph, beaming short notes within a beat.
   * @param {string} token
   * @param {number} start
   * @param {number} ticks
   */
  const append = (token, start, ticks) => {
    const beat = Math.floor((start - bar.barStart) / beatTicks);
    const short = ticks < beatTicks;
    const beam = short && previousShort.short && previousShort.beat === beat;
    bar.text += (beam ? "" : " ") + token;
    previousShort = { beat, short };
  };

  /**
   * Emit [from, to) as drawable pieces split at bar lines.
   * @param {number} from
   * @param {number} to
   * @param {(start: number, ticks: number, isFirst: boolean, isLast: boolean) => void} emit
   */
  const segment = (from, to, emit) => {
    let at = from;
    while (at < to) {
      const end = Math.min(to, nextBarline(at));
      for (const ticks of drawableLengths(end - at)) {
        emit(at, ticks, at === from, at + ticks === to);
        at += ticks;
      }
      if (at === nextBarline(at - 1)) closeBar();
    }
  };

  let cursor = 0;
  for (const note of song.notes) {
    segment(cursor, note.start, (start, ticks) => append(`z${ticks}`, start, ticks));
    const chord = chordByNote.get(note.id) ?? null;
    const pitch = parseSpelling(spell(note.midi, key));
    segment(note.start, note.start + note.dur, (start, ticks, isFirst, isLast) => {
      const labels = isFirst && chord ? `"${chordSymbol(chord, key, { mode, labelStyle })}"` : "";
      const tie = isLast ? "" : "-";
      append(labels + abcPitch(pitch, signature, inForce) + ticks + tie, start, ticks);
      bar.syllables.push(isFirst && showDegrees && !hidden ? degreeLabel(note.midi, key) : "*");
      pieces.push({ noteId: note.id, chordId: isFirst && chord ? chord.id : null });
    });
    cursor = note.start + note.dur;
  }
  if (bar.text.trim()) closeBar();
  if (bars.length === 0) bars.push({ text: `x${barTicks}`, syllables: [] });

  const header = [
    "X:1",
    `T:${safeTitle(song.title)}`,
    `M:${meter.beatsPerBar}/${meter.beatUnit}`,
    "L:1/48",
    `K:${fifths === null ? "C" : key.tonic + (key.mode === "minor" ? "m" : "")}`,
  ];
  const lines = [];
  for (let i = 0; i < bars.length; i += BARS_PER_LINE) {
    const lineBars = bars.slice(i, i + BARS_PER_LINE);
    const last = i + BARS_PER_LINE >= bars.length;
    lines.push(lineBars.map((b) => b.text).join(" | ") + (last ? " |]" : " |"));
    const syllables = lineBars.flatMap((b) => b.syllables);
    if (syllables.some((s) => s !== "*")) lines.push(`w:${syllables.join(" ")}`);
  }
  return { abc: [...header, ...lines].join("\n") + "\n", pieces };
}

/**
 * Split a length into drawable glyph lengths, longest first, as tied pieces.
 * Known gap: a length no sum of these glyphs makes (a triplet, 4 or 8 ticks)
 * ends in a remainder abcjs cannot draw as one glyph (a 4-tick triplet eighth
 * becomes a dotted sixteenth tied to a 1/48). Real tuplets (`(3`) are wave 2.
 * @param {number} ticks
 * @returns {number[]}
 */
function drawableLengths(ticks) {
  const lengths = [];
  let left = ticks;
  for (const size of DRAWABLE) {
    while (left >= size) {
      lengths.push(size);
      left -= size;
    }
  }
  if (left > 0) lengths.push(left);
  return lengths;
}

/**
 * @param {string} name a spelled pitch from theory's spell(), e.g. "F#4"
 * @returns {{ letter: string, accidental: number, octave: number }}
 */
function parseSpelling(name) {
  const m = name.match(/^([A-G])(##|#|bb|b)?(-?\d+)$/);
  if (!m) throw new RangeError(`Unexpected spelling ${name}`);
  const accidental = { "##": 2, "#": 1, bb: -2, b: -1 }[m[2] ?? ""] ?? 0;
  return { letter: m[1], accidental, octave: Number(m[3]) };
}

/**
 * The key's place on the circle of fifths (sharps positive, flats negative),
 * the same number abcjs derives from the `K:` header. Minor keys use their
 * relative major. Null for a theoretical key beyond seven sharps or flats
 * (G# major, Fb minor), which ABC can't write as a signature: the staff then
 * uses K:C with accidentals on the notes, which is still correct notation.
 * @param {Key} key
 * @returns {number | null}
 */
function keyFifths(key) {
  const m = key.tonic.match(/^([A-G])(#|b)?$/);
  if (!m) return null;
  const letter = /** @type {keyof typeof LETTER_FIFTHS} */ (m[1]);
  const shift = m[2] === "#" ? 7 : m[2] === "b" ? -7 : 0;
  const fifths = LETTER_FIFTHS[letter] + shift - (key.mode === "minor" ? 3 : 0);
  return Math.abs(fifths) <= 7 ? fifths : null;
}

/**
 * The key signature as letter → accidental, derived the way abcjs reads `K:`
 * (not from the speller), so a bare note is always drawn at the pitch the
 * signature gives it and any spelling outside it gets an explicit accidental.
 * @param {number} fifths
 * @returns {Map<string, number>}
 */
function keySignature(fifths) {
  const letters = fifths >= 0 ? SHARP_ORDER : FLAT_ORDER;
  const accidental = fifths >= 0 ? 1 : -1;
  return new Map(letters.slice(0, Math.abs(fifths)).map((letter) => [letter, accidental]));
}

/**
 * ABC pitch, writing an accidental only when the bar's current state for
 * that letter and octave (key signature, then earlier accidentals) differs.
 * @param {{ letter: string, accidental: number, octave: number }} pitch
 * @param {Map<string, number>} signature
 * @param {Map<string, number>} inForce mutated: records the accidental written
 */
function abcPitch({ letter, accidental, octave }, signature, inForce) {
  const slot = letter + octave;
  const current = inForce.get(slot) ?? signature.get(letter) ?? 0;
  const mark =
    current === accidental
      ? ""
      : ABC_ACCIDENTAL[/** @type {keyof typeof ABC_ACCIDENTAL} */ (String(accidental))];
  inForce.set(slot, accidental);
  const name =
    octave >= 5
      ? letter.toLowerCase() + "'".repeat(octave - 5)
      : letter + ",".repeat(Math.max(0, 4 - octave));
  return mark + name;
}

/**
 * The text of a chord symbol in the label style, as the chord chips show it
 * ("V", "5⁷", "A", "V · A"), or a neutral mark in hidden mode. The text is
 * quoted into ABC, so quotes, newlines, `%`, and backslashes are dropped, and
 * a symbol that would start with one of ABC's placement marks (^ _ < > @),
 * turning it into an annotation, reads as "?" instead.
 * @param {import("../types.js").ChordSpec} chord
 * @param {Key} key
 * @param {{ mode: KeyLabelMode, labelStyle: LabelStyle }} view
 */
export function chordSymbol(chord, key, { mode, labelStyle }) {
  if (mode === "hidden") return HIDDEN_CHORD_MARK;
  const { text, sup } = chordView(chord, key, mode, labelStyle);
  const sups = [...sup].map((c) => SUPERSCRIPT[/** @type {keyof typeof SUPERSCRIPT} */ (c)] ?? c);
  const name = (text + sups.join("")).replace(/["%\\\r\n]/g, "");
  return name && !/^[\^_<>@]/.test(name) ? name : "?";
}

/**
 * The accessible name of a note on the staff, e.g. "F sharp 4, degree 3,
 * chord D". Says only what the staff shows, so hidden mode stays hidden.
 * @param {import("../types.js").Note} note
 * @param {import("../types.js").ChordSpec | null} chord
 * @param {Key} key
 * @param {StaffView} view
 */
export function describeNote(note, chord, key, { mode, labelStyle, showDegrees }) {
  const pitch = parseSpelling(spell(note.midi, key));
  const parts = [`${pitch.letter}${SPOKEN_ACCIDENTAL[pitch.accidental]} ${pitch.octave}`];
  if (mode !== "hidden" && showDegrees) {
    const { degree, accidental, octave } = midiToDegree(note.midi, key);
    const octaves = Math.abs(octave);
    const where =
      octave === 0
        ? ""
        : ` ${octaves} octave${octaves > 1 ? "s" : ""} ${octave > 0 ? "up" : "down"}`;
    parts.push(`degree${SPOKEN_ACCIDENTAL[accidental]} ${degree}${where}`);
  }
  if (chord)
    parts.push(
      mode === "hidden" ? "chord" : `chord ${chordSymbol(chord, key, { mode, labelStyle })}`,
    );
  return parts.join(", ");
}

/**
 * A melody degree in jianpu style: accidental, number, and one dot per octave
 * above (over the number) or below (under it) the home octave.
 * @param {number} midi
 * @param {Key} key
 */
function degreeLabel(midi, key) {
  const { degree, accidental, octave } = midiToDegree(midi, key);
  const dots = (octave > 0 ? DOT_ABOVE : DOT_BELOW).repeat(Math.abs(octave));
  return DEGREE_ACCIDENTAL[accidental] + degree + dots;
}

/**
 * Keep the title to characters with no meaning in ABC, so a title can never
 * inject a header field or a comment.
 * @param {string} title
 */
function safeTitle(title) {
  return title.replace(/[^\p{L}\p{N} .,'!?&()-]/gu, "").trim() || "Untitled";
}
