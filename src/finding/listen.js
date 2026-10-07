/**
 * Listening for key finding: play the melody, optionally over a held tonic
 * (the drone test), and light the keyboard as it sounds so the test has a
 * visual twin. One listen at a time; starting another stops the last.
 *
 * @import { Key } from "../types.js"
 * @import { KeyboardLights } from "../store/ui.js"
 */

import { drone, playPhrase, stop } from "../audio/index.js";
import { song } from "../store/song.js";
import { ui, keyLabelMode } from "../store/ui.js";
import { droneMidi } from "./keys.js";

/** @type {KeyboardLights} */
const DARK = { chord: null, melody: [] };

let latest = 0;

/**
 * Play the whole melody, chords left out so only the drone colors it. With
 * `droneKey`, that key's tonic sounds underneath and glows on the keyboard: in
 * tonic blue, since the test asks "what if this were home?", but neutral while
 * labels are hidden, so the keyboard never hints before the guess.
 * Resolves when the melody ends or is stopped; rejects if playback fails.
 * @param {Key | null} droneKey
 * @returns {Promise<void>}
 */
export async function listen(droneKey) {
  stop();
  const mine = ++latest;
  const { notes } = song.get();
  if (notes.length === 0) return;
  const midiById = new Map(notes.map((n) => [n.id, n.midi]));
  const end = notes.reduce((max, n) => Math.max(max, n.start + n.dur), 0);
  const hidden = keyLabelMode(song.get(), ui.get()) === "hidden";
  const chord = droneKey
    ? { midi: [droneMidi(droneKey, notes)], fn: hidden ? "other" : "tonic" }
    : null;
  const light = (/** @type {number[]} */ melody) =>
    ui.update({
      keyboardLights: /** @type {KeyboardLights} */ ({ chord, melody }),
    });

  light([]);
  if (chord) drone(chord.midi[0]);
  try {
    await playPhrase(
      { fromTick: 0, toTick: end },
      {
        chords: [],
        onEvent(event) {
          if (mine !== latest) return;
          const midi = event.type === "note" && event.noteId && midiById.get(event.noteId);
          if (midi) light([midi]);
        },
      },
    );
  } finally {
    // A newer listen owns the drone and the lights now; leave them be.
    if (mine === latest) {
      if (chord) drone(null);
      ui.update({ keyboardLights: DARK });
    }
  }
}

/** Stop listening: melody, drone, and lights. */
export function stopListening() {
  latest++;
  stop();
  ui.update({ keyboardLights: DARK });
}
