/**
 * Key choices for the key prompt: the twelve homes the user can pick, spelled
 * the conventional way for each mode, and how to name and compare keys.
 *
 * @import { Key } from "../types.js"
 */

import { degreeToMidi } from "../theory/index.js";

/** Conventional tonic spellings: flats for major (Db, Ab), sharps for minor (C#, G#). */
export const TONICS = {
  major: ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"],
  minor: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
};

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
 * Whether two keys share a home, enharmonics included (C# minor is Db minor).
 * @param {Key} a
 * @param {Key} b
 */
export function sameHome(a, b) {
  return a.mode === b.mode && degreeToMidi(HOME, a) === degreeToMidi(HOME, b);
}

/**
 * The tonic to drone under a melody: degree 1 of the key, in the highest
 * octave that sits below the melody's lowest note, so the drone is underneath.
 * @param {Key} key
 * @param {{ midi: number }[]} notes at least one
 * @returns {number} MIDI
 */
export function droneMidi(key, notes) {
  const lowest = Math.min(...notes.map((n) => n.midi));
  let midi = degreeToMidi(HOME, key);
  while (midi >= lowest) midi -= 12;
  while (midi + 12 < lowest) midi += 12;
  return midi;
}
