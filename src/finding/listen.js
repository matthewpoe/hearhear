/**
 * Listening for key finding: the melody over a candidate key's tonic chord.
 * It plays through playWithVisuals (decision D10), so the staff playhead and
 * the keyboard follow the sound and the sound-off reader can follow the test
 * by its visual twin. One listen at a time: a new playWithVisuals call stops
 * the last.
 *
 * @import { Key } from "../types.js"
 */

import { drone as holdDrone, stop } from "../audio/index.js";
import { playWithVisuals } from "../staff/playback.js";
import { song } from "../store/song.js";
import { droneChord } from "./keys.js";

/**
 * Play the whole melody, chords left out so only the held chord colors it,
 * over `key`'s tonic chord placed below the melody. Resolves when the melody
 * ends or is stopped; rejects if playback fails.
 *
 * The driver's `drone` option takes one note: it holds and lights the root
 * and releases the drone when playback ends. The full chord replaces the
 * root at once, before any sound starts.
 * @param {Pick<Key, "tonic" | "mode">} key
 * @returns {Promise<void>}
 */
export async function listen(key) {
  const { notes } = song.get();
  if (notes.length === 0) return;
  const end = notes.reduce((max, n) => Math.max(max, n.start + n.dur), 0);
  const chord = droneChord(key, notes);
  const playing = playWithVisuals({ fromTick: 0, toTick: end }, { chords: [], drone: chord[0] });
  holdDrone(chord);
  await playing;
}

/** Stop listening; playWithVisuals then clears the drone and what it lit. */
export function stopListening() {
  stop();
}
