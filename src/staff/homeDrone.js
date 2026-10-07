/**
 * "Drone on home": the staff header's switch holds the song's home chord
 * under whatever plays the song as written (Play, a bar, a chord audition),
 * so the student can hear the melody settle or itch against 1. It is the key
 * finder's chord and soft drone sound (droneChord, audio's drone()), but in
 * the confirmed key, and only once the student has chosen one: before that
 * the drone test is the finder's.
 *
 * Players hold it while they sound and release it when they end; the chord
 * sounds while any holder remains and the switch is on, so one player ending
 * never cuts the drone from under another. Turning the switch on or off, or
 * changing the key, takes effect at once. Stop (audio's stop()) silences it.
 *
 * @import { Song } from "../types.js"
 * @import { UiState } from "../store/ui.js"
 */

import { drone } from "../audio/index.js";
import { droneChord } from "../finding/keys.js";
import { createReadable } from "../lib/readable.js";
import { song } from "../store/song.js";
import { keyLabelMode, ui } from "../store/ui.js";

/**
 * Why the switch can't be used yet, or null when it can.
 * @param {Song} current
 * @param {Pick<UiState, "demoAwaitingGuess">} state
 * @returns {string | null}
 */
export function droneBlocked(current, state) {
  const mode = keyLabelMode(current, state);
  if (mode === "hidden") return "Find home first.";
  if (mode === "tentative") return "Choose the key first.";
  return null;
}

/**
 * The chord to hold, or null while the switch is off or can't be used.
 * @param {Song} current
 * @param {Pick<UiState, "demoAwaitingGuess" | "droneOn">} state
 * @returns {number[] | null} MIDI, root first
 */
export function homeChord(current, state) {
  if (!state.droneOn || droneBlocked(current, state) || current.notes.length === 0) return null;
  return droneChord(current.key, current.notes);
}

/** @type {Set<object>} */
const holders = new Set();
const sounding = createReadable(/** @type {number[]} */ ([]));

/** The home chord sounding now (empty when silent), for the keyboard lights. */
export const homeDrone = { subscribe: sounding.subscribe, get: sounding.get };

function sync() {
  const tones = holders.size > 0 ? (homeChord(song.get(), ui.get()) ?? []) : [];
  const before = sounding.get();
  // drone() ignores a repeat, and restarts a chord that stop() silenced.
  if (tones.length > 0) drone(tones);
  else if (before.length > 0) drone(null);
  if (tones.length !== before.length || tones.some((m, i) => m !== before[i])) sounding.set(tones);
}

/**
 * Hold the home chord for `holder` (any object) while it plays.
 * @param {object} holder
 */
export function holdHome(holder) {
  holders.add(holder);
  sync();
}

/** @param {object} holder */
export function releaseHome(holder) {
  if (holders.delete(holder)) sync();
}

ui.subscribe(() => {
  if (holders.size > 0) sync();
});
song.subscribe(() => {
  if (holders.size > 0) sync();
});
