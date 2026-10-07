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

/** The lowest key on the piano and of the sampled range: C2 (decision D9). */
export const LOWEST_MIDI = 36;

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
function pitchClass(key) {
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
 * The tonic to drone under a melody: degree 1 of the key, in the highest
 * octave that sits below the melody's lowest note, so the drone is underneath.
 * Never below C2, the lowest sampled and visible key: a melody that reaches
 * down there shares its register with the drone rather than losing it.
 * @param {Pick<Key, "tonic" | "mode">} key
 * @param {{ midi: number }[]} notes at least one
 * @returns {number} MIDI
 */
export function droneMidi(key, notes) {
  const lowest = Math.min(...notes.map((n) => n.midi));
  let midi = degreeToMidi(HOME, key);
  while (midi >= lowest) midi -= 12;
  while (midi + 12 < lowest) midi += 12;
  while (midi < LOWEST_MIDI) midi += 12;
  return midi;
}

/**
 * The homes easy mode offers as drones, in order: the current home first (the
 * provisional C in a fresh demo), then the ranked candidates that differ from
 * it, so the first comparison is always between two different homes.
 * @param {Pick<Key, "tonic" | "mode">} current
 * @param {{ key: Pick<Key, "tonic" | "mode"> }[]} ranked best first, as rankKeys returns them
 * @param {number} count how many candidates to offer after the current home
 * @returns {Pick<Key, "tonic" | "mode">[]}
 */
export function easyModeHomes(current, ranked, count) {
  const others = ranked
    .map(({ key }) => ({ tonic: key.tonic, mode: key.mode }))
    .filter((key) => !sameHome(key, current))
    .slice(0, count);
  return [{ tonic: current.tonic, mode: current.mode }, ...others];
}
