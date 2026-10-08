/**
 * The demo tunes the eval also asks about: the app's own songs in
 * content/songs, which carry no chords. Plausibility needs no reference, so
 * each is reviewed with the dropdown's top pick placed at every downbeat
 * (`demoChart`), and asked "does this work?" about a plausible chord placed
 * at a few downbeats (`demoPoints`).
 *
 * @import { Chord, ChordSpec, Song } from "../../src/types.js"
 */

import { readFile } from "node:fs/promises";
import { letterOf, numeralOf, positionOf } from "../../src/theory/index.js";
import { baselineChord, dropdownTop, plausible } from "../metrics.js";

export const DEMO_TUNES = [
  "st-james-infirmary",
  "sweet-georgia-brown",
  "when-the-saints",
  "greensleeves",
];

/** Downbeats asked "does this work?", per demo tune. */
export const CHECK_POINTS = 3;

/** @param {string} id @returns {Promise<Song>} */
export async function loadDemo(id) {
  const url = new URL(`../../content/songs/${id}.json`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

/**
 * Every note that starts a bar after the pickup, in order.
 * @param {Song} song
 */
const downbeats = (song) =>
  song.notes.filter((n) => {
    const at = positionOf(n.start, song.meter);
    return at.bar >= 1 && at.beat === 1;
  });

/**
 * `count` items spread evenly through a list, from its start.
 * @template T @param {T[]} list @param {number} count
 */
const spread = (list, count) =>
  Array.from({ length: count }, (_, i) => list[Math.floor((i * list.length) / count)]);

/**
 * The chart a demo tune is reviewed with: the dropdown's top pick
 * (`baselineChord`, on the bare melody) placed at every downbeat after the
 * pickup, as a student who took the first suggestion each bar would have it.
 * @param {Song} song
 * @returns {Chord[]}
 */
export function demoChart(song) {
  const melody = { ...song, chords: [] };
  return downbeats(melody).map((note, i) => ({
    id: `c${i + 1}`,
    noteId: note.id,
    ...baselineChord(melody, note.id),
  }));
}

/**
 * The downbeats a demo tune is asked "does this work?" about, spread through
 * the tune, each with a plausible chord to place there: the dropdown's second
 * pick, or its first when the second isn't plausible.
 * @param {Song} song
 */
export function demoPoints(song) {
  const melody = { ...song, chords: [] };
  return spread(downbeats(melody), CHECK_POINTS).map((note) => {
    const picks = dropdownTop(melody, note.id);
    const suggestion = (/** @type {ChordSpec} */ c) => ({
      numeral: numeralOf(c, song.key),
      letter: letterOf(c),
    });
    const placed = picks.slice(1).find((c) => plausible(suggestion(c), melody, note)) ?? picks[0];
    return { note, placed };
  });
}
