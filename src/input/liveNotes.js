/**
 * Notes held right now, from any input: the on-screen piano and the number
 * row both press and release through here, so a note sounds once and lights
 * its piano key however it was played.
 */

import { noteOff, noteOn } from "../audio/index.js";
import { createReadable } from "../lib/readable.js";

const held = createReadable(/** @type {ReadonlySet<number>} */ (new Set()));

/** MIDI pitches currently held down. */
export const heldNotes = { subscribe: held.subscribe };

/**
 * Start a note. Pressing a note that is already held does nothing, so two
 * inputs on the same pitch never retrigger it.
 * @param {number} midi
 */
export function press(midi) {
  const current = held.get();
  if (current.has(midi)) return;
  held.set(new Set(current).add(midi));
  noteOn(midi);
}

/** @param {number} midi */
export function release(midi) {
  const current = held.get();
  if (!current.has(midi)) return;
  const next = new Set(current);
  next.delete(midi);
  held.set(next);
  noteOff(midi);
}
