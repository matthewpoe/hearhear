/**
 * The demo tunes the eval also asks about: the app's own songs in
 * content/songs, which carry no chords. Plausibility needs no reference, so
 * these are asked for alternatives at a few downbeats, and asked "does this
 * work?" about a plausible chord placed at a few others.
 *
 * @import { ChordSpec, Song } from "../../src/types.js"
 */

import { readFile } from "node:fs/promises";
import { letterOf, numeralOf, positionOf } from "../../src/theory/index.js";
import { dropdownTop, plausible } from "../metrics.js";

export const DEMO_TUNES = [
  "st-james-infirmary",
  "sweet-georgia-brown",
  "when-the-saints",
  "greensleeves",
];

/** Downbeats asked for alternatives, and asked "does this work?", per demo tune. */
export const ASK_POINTS = 4;
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
 * The downbeats a demo tune is asked about: `ask` for alternatives, and
 * `check` for "does this work?", each with a plausible chord to place there
 * (the dropdown's second pick, or its first when the second isn't plausible).
 * Each set spreads through the tune; they never share a note.
 * @param {Song} song
 */
export function demoPoints(song) {
  const melody = { ...song, chords: [] };
  const beats = downbeats(melody);
  const ask = spread(beats, ASK_POINTS);
  const check = spread(
    beats.filter((n) => !ask.includes(n)),
    CHECK_POINTS,
  ).map((note) => {
    const picks = dropdownTop(melody, note.id);
    const suggestion = (/** @type {ChordSpec} */ c) => ({
      numeral: numeralOf(c, song.key),
      letter: letterOf(c),
    });
    const placed = picks.slice(1).find((c) => plausible(suggestion(c), melody, note)) ?? picks[0];
    return { note, placed };
  });
  return { ask, check };
}
