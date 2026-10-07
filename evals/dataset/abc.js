/**
 * Read the four-voice hymn settings in evals/dataset/sources/ (Open Hymnal ABC).
 * This covers only the ABC those files use: one note per token, accidentals,
 * octave marks, durations, ties, bar lines, and inline fields and decorations,
 * which are skipped. It is dataset tooling, not part of the app.
 */

import { Key, Note } from "tonal";

/** Ticks per quarter note, as in the song schema. */
const TICKS_PER_QUARTER = 12;

const NOTE = /^([_^=]*)([A-Ga-g])([,']*)(\d*)(\/*)(\d*)(-?)/;
const REST = /^[zx](\d*)(\/*)(\d*)/;
const SKIP = /^(\[[A-Za-z]:[^\]]*\]|![^!]*!|[()\s])/;
const BAR = /^(\|\]|\|\||\||:\||\|:)/;

/**
 * @typedef {{ midi: number, name: string, start: number, dur: number }} AbcNote
 *   `name` is the spelled pitch class as written, e.g. "F#".
 * @typedef {{
 *   beatsPerBar: number, beatUnit: 4 | 8, tempo: number,
 *   voices: Record<string, AbcNote[]>, barStarts: number[]
 * }} AbcTune
 */

/**
 * The length of a note or rest in ticks, from its ABC length suffix.
 * @param {string} num digits before any slash ("" is 1)
 * @param {string} slashes
 * @param {string} den digits after the slashes
 * @param {number} unitTicks ticks in the L: unit
 */
function lengthOf(num, slashes, den, unitTicks) {
  const n = num ? Number(num) : 1;
  const d = slashes ? (den ? Number(den) : 2 ** slashes.length) : 1;
  const ticks = (unitTicks * n) / d;
  if (!Number.isInteger(ticks)) throw new Error(`length ${num}${slashes}${den} is not whole ticks`);
  return ticks;
}

/**
 * The key signature's accidental for each letter, e.g. { F: "#" } for K: G.
 * @param {string} key the K: field, e.g. "G" or "Em"
 */
function signature(key) {
  const minor = /m$/.test(key) && !/maj$/i.test(key);
  const tonic = minor ? key.slice(0, -1) : key;
  const { alteration } = minor ? Key.minorKey(tonic) : Key.majorKey(tonic);
  const order = alteration >= 0 ? "FCGDAEB" : "BEADGCF";
  const mark = alteration >= 0 ? "#" : "b";
  /** @type {Record<string, string>} */
  const result = {};
  for (const letter of order.slice(0, Math.abs(alteration))) result[letter] = mark;
  return result;
}

/** @param {string} mark ABC accidental: "^", "^^", "_", "__", or "=" */
const accidentalOf = (mark) => mark.replaceAll("^", "#").replaceAll("_", "b").replace("=", "");

/**
 * Parse one voice's music into timed notes. Accidentals last to the bar line,
 * as in standard notation; a tie joins a note to the next one of its pitch.
 * @param {string} music
 * @param {Record<string, string>} keySig
 * @param {number} unitTicks
 * @returns {{ notes: AbcNote[], barStarts: number[] }}
 */
function parseVoice(music, keySig, unitTicks) {
  /** @type {AbcNote[]} */
  const notes = [];
  /** @type {number[]} */
  const barStarts = [];
  /** @type {Record<string, string>} accidentals in force this bar, by letter and octave */
  let inBar = {};
  let tick = 0;
  let tied = false;
  let rest = music;
  while (rest.length) {
    let m;
    if ((m = SKIP.exec(rest))) {
      rest = rest.slice(m[0].length);
    } else if ((m = BAR.exec(rest))) {
      barStarts.push(tick);
      inBar = {};
      rest = rest.slice(m[0].length);
    } else if ((m = REST.exec(rest))) {
      tick += lengthOf(m[1], m[2], m[3], unitTicks);
      tied = false;
      rest = rest.slice(m[0].length);
    } else if ((m = NOTE.exec(rest))) {
      const [token, mark, letter, octaveMarks, num, slashes, den, tie] = m;
      const upper = letter.toUpperCase();
      const octave =
        (letter === upper ? 4 : 5) + [...octaveMarks].reduce((o, c) => o + (c === "'" ? 1 : -1), 0);
      const slot = `${upper}${octave}`;
      if (mark) inBar[slot] = accidentalOf(mark);
      const name = `${upper}${inBar[slot] ?? keySig[upper] ?? ""}`;
      const midi = /** @type {number} */ (Note.midi(`${name}${octave}`));
      const dur = lengthOf(num, slashes, den, unitTicks);
      const previous = notes.at(-1);
      if (tied && previous && previous.midi === midi) previous.dur += dur;
      else notes.push({ midi, name, start: tick, dur });
      tick += dur;
      tied = tie === "-";
      rest = rest.slice(token.length);
    } else {
      throw new Error(`unreadable ABC at: ${rest.slice(0, 20)}`);
    }
  }
  return { notes, barStarts };
}

/**
 * Parse an Open Hymnal tune: its header fields and every voice's notes.
 * Lyrics, comments, and directives are ignored.
 * @param {string} text
 * @returns {AbcTune}
 */
export function parseAbc(text) {
  /** @type {Record<string, string>} */
  const fields = {};
  /** @type {Record<string, string>} */
  const music = {};
  for (const raw of text.split("\n")) {
    const line = raw.replace(/%.*$/, "").trim();
    const voiceLine = /^\[V:\s*(\w+)\]\s*(.*)$/.exec(line);
    if (voiceLine) music[voiceLine[1]] = `${music[voiceLine[1]] ?? ""} ${voiceLine[2]}`;
    else if (/^[A-Z]:/.test(line) && !(line[0] in fields)) fields[line[0]] = line.slice(2).trim();
  }
  const [beatsPerBar, beatUnit] = fields.M.split("/").map(Number);
  const [unitNum, unitDen] = fields.L.split("/").map(Number);
  const unitTicks = (4 * TICKS_PER_QUARTER * unitNum) / unitDen;
  const tempo = Number(/1\/4=(\d+)/.exec(text)?.[1] ?? 100);
  const keySig = signature(fields.K.split(/\s/)[0]);

  /** @type {Record<string, AbcNote[]>} */
  const voices = {};
  /** @type {number[]} */
  let barStarts = [];
  for (const [name, body] of Object.entries(music)) {
    const parsed = parseVoice(body, keySig, unitTicks);
    voices[name] = parsed.notes;
    if (!barStarts.length) barStarts = parsed.barStarts;
  }
  return {
    beatsPerBar,
    beatUnit: /** @type {4 | 8} */ (beatUnit),
    tempo,
    voices,
    barStarts,
  };
}
