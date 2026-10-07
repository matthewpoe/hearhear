/**
 * Key choices for the key question: the twelve homes the user can pick,
 * spelled the conventional way for each mode, how to name and compare keys,
 * and the chord the ear finder holds under the tune.
 *
 * @import { Key } from "../types.js"
 */

import { degreeToMidi } from "../theory/index.js";

/** Conventional tonic spellings: flats for major (Db, Ab), sharps for minor (C#, G#). */
export const TONICS = {
  major: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
  minor: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
};

/**
 * The unguessed placeholder that every demo and free play start on.
 * @type {Key}
 */
export const PROVISIONAL_C = { tonic: "C", mode: "major", provisional: true };

/** The lowest key on the piano and of the sampled range: C2 (decision D9). */
export const LOWEST_MIDI = 36;

/** Each mode's tonic triad, in semitones above its root. */
const TRIAD = { major: [0, 4, 7], minor: [0, 3, 7] };

const HOME = /** @type {const} */ ({ degree: 1, accidental: 0, octave: 0 });

/**
 * "D major", "E minor". Letter names, never numbers, so it says nothing about
 * what is home until the user picks it.
 * @param {Pick<Key, "tonic" | "mode">} key
 */
export function keyName({ tonic, mode }) {
  return `${tonic} ${mode}`;
}

/**
 * The key's home as a pitch class (0 is C), whatever register theory places
 * the tonic in.
 * @param {Pick<Key, "tonic" | "mode">} key
 */
export function pitchClass(key) {
  return ((degreeToMidi(HOME, key) % 12) + 12) % 12;
}

/**
 * Whether two keys share a home, enharmonics included (C# minor is Db minor).
 * @param {Pick<Key, "tonic" | "mode">} a
 * @param {Pick<Key, "tonic" | "mode">} b
 */
export function sameHome(a, b) {
  return a.mode === b.mode && pitchClass(a) === pitchClass(b);
}

/**
 * The key's home spelled as the chip for `mode` spells it: D# minor's home is
 * the "Eb" chip in minor, and the "Eb" chip in major too.
 * @param {"major" | "minor"} mode
 * @param {Pick<Key, "tonic" | "mode">} key
 * @returns {string}
 */
export function tonicIn(mode, key) {
  return TONICS[mode][pitchClass(key)];
}

/**
 * The finder's chord for a key: the root-position tonic triad of its mode,
 * in the highest octave whose top note sits below the melody's lowest note,
 * so the tune stays on top. The root never goes below C2, the lowest sampled
 * and visible key: a melody that reaches down there shares its register with
 * the chord rather than losing it (decision D9).
 * @param {Pick<Key, "tonic" | "mode">} key
 * @param {{ midi: number }[]} notes at least one
 * @returns {number[]} MIDI, root first
 */
export function droneChord(key, notes) {
  const lowest = Math.min(...notes.map((n) => n.midi));
  const intervals = TRIAD[key.mode];
  const top = intervals[intervals.length - 1];
  let root = degreeToMidi(HOME, key);
  while (root + top >= lowest) root -= 12;
  while (root + 12 + top < lowest) root += 12;
  while (root < LOWEST_MIDI) root += 12;
  return intervals.map((interval) => root + interval);
}
