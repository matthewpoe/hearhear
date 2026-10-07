/**
 * The one playback driver for anything that plays the song with visuals
 * (Stream C owns it; decision D10). The transport's Play button and the
 * key-finding tests (the drone test, for example) both call it, so the staff
 * playhead and the keyboard always follow the sound, whoever started it.
 *
 * While it plays it owns ui.playheadNoteId, the staff's "is-playing"
 * highlight, and ui.keyboardLights (melody neutral, chord tones in their
 * function color, the drone note as melody). Playback outranks hover: other
 * writers of keyboardLights clear only what they wrote.
 *
 * CONTRACT: exported names and shapes are frozen (see contracts/README.md).
 * Bodies marked STUB(C) are placeholders that call the audio API without visuals.
 *
 * @import { Chord } from "../types.js"
 * @import { TickRange } from "../audio/index.js"
 */

import { drone as holdDrone, playPhrase } from "../audio/index.js";

/**
 * Play part of the song with the playhead and keyboard lights following.
 * Resolves when playback ends or is stopped, after clearing what it lit.
 * @param {TickRange} range
 * @param {{
 *   chords?: { chord: Chord, voicing: number[] }[],
 *   drone?: number | null,
 * }} [options] chords replaces the song's chords for this playback (an empty
 *   array plays none); drone holds that MIDI note underneath until the end.
 * @returns {Promise<void>}
 */
export async function playWithVisuals(range, { chords, drone = null } = {}) {
  // STUB(C): no visuals yet.
  if (drone !== null) holdDrone(drone);
  try {
    await playPhrase(range, chords ? { chords } : {});
  } finally {
    if (drone !== null) holdDrone(null);
  }
}
