/**
 * The audio API (Stream B). This module owns the single AudioContext (via
 * Tone.js, created lazily on unlock) and all sound: live notes, phrase
 * playback with synced visual events, chord audition, drone, and click.
 *
 * CONTRACT: exported names, parameters, and return shapes are frozen (see
 * contracts/README.md). Bodies marked STUB(B) are Phase 0 placeholders that
 * log and resolve so other streams can build against them without sound.
 *
 * @import { Chord } from "../types.js"
 */

import { createReadable } from "../lib/readable.js";

/**
 * @typedef {"idle" | "loading" | "ready" | "failed"} AudioStatus
 * @typedef {{ fromTick: number, toTick: number }} TickRange
 * @typedef {{
 *   type: "note" | "chord" | "end",
 *   noteId?: string,
 *   chordId?: string,
 *   tones?: number[],
 * }} PlaybackEvent
 */

const status = createReadable(/** @type {AudioStatus} */ ("idle"));

/** Sample loading and unlock state; every async boundary shows loading, failed, retry. */
export const audioStatus = { subscribe: status.subscribe };

/** @param {string} what @param {unknown[]} args */
const stub = (what, ...args) => console.debug(`[audio stub] ${what}`, ...args);

/**
 * Start fetching the piano samples (C2–C6). Call from the landing screen,
 * before any click, so the first sound is instant.
 * @returns {Promise<void>}
 */
export async function preload() {
  stub("preload"); // STUB(B)
  status.set("ready");
}

/**
 * Unlock browser audio on the first user gesture and play the sound-check
 * chord, so the first click starts something satisfying.
 * @returns {Promise<void>}
 */
export async function unlock() {
  stub("unlock"); // STUB(B)
}

/**
 * Sound one live note immediately (zero look-ahead). Ignores repeats while held.
 * @param {number} midi
 */
export function noteOn(midi) {
  stub("noteOn", midi); // STUB(B)
}

/** @param {number} midi */
export function noteOff(midi) {
  stub("noteOff", midi); // STUB(B)
}

/**
 * Play part of the song on the Transport. `onEvent` fires through Tone.Draw,
 * in sync with the sound, so the staff and keyboard can light each note.
 * Resolves when playback ends or is stopped.
 * @param {TickRange} range
 * @param {{ chords?: { chord: Chord, voicing: number[] }[], onEvent?: (event: PlaybackEvent) => void }} [options]
 * @returns {Promise<void>}
 */
export async function playPhrase(range, { onEvent } = {}) {
  stub("playPhrase", range); // STUB(B)
  onEvent?.({ type: "end" });
}

/**
 * Play the bar around a note with a candidate chord voiced underneath,
 * melody included. Stops any audition already playing.
 * @param {number[]} voicing MIDI, from theory's voice()
 * @param {TickRange} range
 * @returns {Promise<void>}
 */
export async function auditionChord(voicing, range) {
  stub("auditionChord", voicing, range); // STUB(B)
}

/**
 * auditionChord, debounced (~120 ms) for hover: moving quickly through the
 * dropdown sounds only where the pointer rests.
 * @param {number[]} voicing
 * @param {TickRange} range
 */
export function auditionDebounced(voicing, range) {
  stub("auditionDebounced", voicing, range); // STUB(B)
}

/**
 * Hold a tonic under the melody (the drone test), or stop it with null.
 * @param {number | null} midi
 */
export function drone(midi) {
  stub("drone", midi); // STUB(B)
}

/**
 * Play the melody over an accented click (the meter test: "lilt in 3 or march in 4?").
 * @param {TickRange} range
 * @param {number} beatsPerBar
 * @returns {Promise<void>}
 */
export async function playWithClick(range, beatsPerBar) {
  stub("playWithClick", range, beatsPerBar); // STUB(B)
}

/** Stop all playback, audition, drone, and click. */
export function stop() {
  stub("stop"); // STUB(B)
}
