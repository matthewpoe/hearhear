/**
 * Listening for key finding: play the melody, optionally over a held tonic
 * (the drone test). Both go through playWithVisuals (decision D10), so the
 * staff playhead and the keyboard follow the sound and the sound-off reader
 * can follow the test by its visual twin. One listen at a time: a new
 * playWithVisuals call stops the last.
 *
 * @import { Key } from "../types.js"
 */

import { stop } from "../audio/index.js";
import { playWithVisuals } from "../staff/playback.js";
import { song } from "../store/song.js";
import { droneMidi } from "./keys.js";

/**
 * Play the whole melody, chords left out so only the drone colors it. With
 * `droneKey`, that key's tonic sounds underneath, placed below the melody.
 * Resolves when the melody ends or is stopped; rejects if playback fails.
 * @param {Pick<Key, "tonic" | "mode"> | null} droneKey
 * @returns {Promise<void>}
 */
export async function listen(droneKey) {
  const { notes } = song.get();
  if (notes.length === 0) return;
  const end = notes.reduce((max, n) => Math.max(max, n.start + n.dur), 0);
  const drone = droneKey ? droneMidi(droneKey, notes) : null;
  await playWithVisuals({ fromTick: 0, toTick: end }, { chords: [], drone });
}

/** Stop listening; playWithVisuals then clears the drone and what it lit. */
export function stopListening() {
  stop();
}
