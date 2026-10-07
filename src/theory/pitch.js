/**
 * Pitches relative to a key: spelling, scale degrees, and the fixed octave
 * rows. Degrees are found by letter name, so spelling decides the degree.
 *
 * @import { Key, ScaleDegree } from "../types.js"
 */

import { Note as TNote } from "tonal";

/** Semitones above the tonic for degrees 1–7. Minor is natural minor. */
export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

/** The same scales as interval names, for spelling by letter. */
export const DEGREE_INTERVALS = {
  major: ["1P", "2M", "3M", "4P", "5P", "6M", "7M"],
  minor: ["1P", "2M", "3m", "4P", "5P", "6m", "7m"],
};

/**
 * The PRD's conventional key names, indexed by pitch class. F# major and
 * Eb minor are the defaults where the PRD offers a choice; re-keying to the
 * enharmonic twin (Gb, D#) is how the user picks the other.
 */
export const CONVENTIONAL_TONICS = {
  major: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
  minor: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
};

/**
 * How notes outside the scale are spelled, by semitones above the tonic, as
 * [preferred, fallback] intervals. Major uses the blues and borrowed flats
 * (b2, b3, b6, b7) and #4; minor uses b2, #4, and the raised 3rd, 6th, and
 * 7th (Shift+7 is the leading tone). The fallback avoids a double accidental.
 * @type {Record<"major" | "minor", Record<number, [string, string]>>}
 */
const CHROMATIC = {
  major: { 1: ["2m", "1A"], 3: ["3m", "2A"], 6: ["4A", "5d"], 8: ["6m", "5A"], 10: ["7m", "6A"] },
  minor: { 1: ["2m", "1A"], 4: ["3M", "4d"], 6: ["4A", "5d"], 9: ["6M", "7d"], 11: ["7M", "8d"] },
};

const LETTERS = "CDEFGAB";

/** @param {number} n @param {number} m */
export const mod = (n, m) => ((n % m) + m) % m;

/** @param {string} name */
export const chromaOf = (name) => /** @type {number} */ (TNote.chroma(name));

/**
 * MIDI of degree 1 in the home octave (the number row): the tonic at or
 * above middle C, so the A row two octaves down never drops below C2.
 * @param {Key} key
 */
export function tonicMidi(key) {
  return 60 + chromaOf(key.tonic);
}

/**
 * Spell a pitch class in a key: the scale's own note when it is diatonic,
 * otherwise the conventional chromatic spelling (see CHROMATIC).
 * @param {number} chroma 0–11
 * @param {Key} key
 * @returns {string} e.g. "F#", "Bb"
 */
export function spellPitchClass(chroma, key) {
  const semis = mod(chroma - chromaOf(key.tonic), 12);
  const diatonic = SCALES[key.mode].indexOf(semis);
  if (diatonic >= 0) return TNote.transpose(key.tonic, DEGREE_INTERVALS[key.mode][diatonic]);
  const [preferred, fallback] = CHROMATIC[key.mode][semis];
  const name = TNote.transpose(key.tonic, preferred);
  return /##|bb/.test(name) ? TNote.transpose(key.tonic, fallback) : name;
}

/**
 * Scale degree of a spelled pitch class, by letter name: Bb in D major is b6,
 * A# would be #5. The accidental is how far it sits from the scale's note.
 * @param {string} pitchClass
 * @param {Key} key
 * @returns {{ degree: ScaleDegree["degree"], accidental: number }}
 */
export function degreeOf(pitchClass, key) {
  const steps = mod(LETTERS.indexOf(pitchClass[0]) - LETTERS.indexOf(key.tonic[0]), 7);
  const degree = /** @type {ScaleDegree["degree"]} */ (steps + 1);
  const diatonic = TNote.transpose(key.tonic, DEGREE_INTERVALS[key.mode][steps]);
  const accidental = mod(chromaOf(pitchClass) - chromaOf(diatonic) + 6, 12) - 6;
  return { degree, accidental };
}

/**
 * Spell a MIDI pitch in the context of a key, e.g. 66 in D major → "F#4",
 * 63 in C major → "Eb4", 75 in E minor → "D#5".
 * @param {number} midi
 * @param {Key} key
 * @returns {string}
 */
export function spell(midi, key) {
  const pitchClass = spellPitchClass(mod(midi, 12), key);
  // B# and Cb sit across the octave boundary from their MIDI octave.
  let octave = Math.floor(midi / 12) - 1;
  const at = (/** @type {number} */ o) => /** @type {number} */ (TNote.midi(pitchClass + o));
  if (at(octave) > midi) octave--;
  if (at(octave) < midi) octave++;
  return pitchClass + octave;
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
 * The inverse of degreeToMidi: which degree (and octave dot) a pitch is in a
 * key, read from its key-aware spelling, so 63 in C major is b3, not #2.
 * @param {number} midi
 * @param {Key} key
 * @returns {ScaleDegree}
 */
export function midiToDegree(midi, key) {
  const { degree, accidental } = degreeOf(spellPitchClass(mod(midi, 12), key), key);
  const natural = tonicMidi(key) + SCALES[key.mode][degree - 1];
  return {
    degree,
    accidental: /** @type {ScaleDegree["accidental"]} */ (accidental),
    octave: Math.round((midi - accidental - natural) / 12),
  };
}
