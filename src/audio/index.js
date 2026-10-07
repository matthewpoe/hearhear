/**
 * The audio API (Stream B). This module owns the single AudioContext (via
 * Tone.js, created lazily on unlock) and all sound: live notes, phrase
 * playback with synced visual events, chord audition, drone, and click.
 *
 * CONTRACT: exported names, parameters, and return shapes are frozen (see
 * contracts/README.md). Bodies marked STUB(B) are Phase 0 placeholders that
 * log and resolve so other streams can build against them without sound.
 *
 * Melody notes and placed chords come from the song store; callers pass only
 * tick ranges and what differs from the song.
 *
 * @import { Chord, Meter } from "../types.js"
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
 * Resolves when playback ends or is stopped. `chords` replaces the song's
 * chords for this playback only (the cadence test plays V-I in a candidate
 * key); omit it to play the song as written.
 * @param {TickRange} range
 * @param {{ chords?: { chord: Chord, voicing: number[] }[], onEvent?: (event: PlaybackEvent) => void }} [options]
 * @returns {Promise<void>}
 */
export async function playPhrase(range, { onEvent } = {}) {
  stub("playPhrase", range); // STUB(B)
  onEvent?.({ type: "end" });
}

/**
 * Play a passage (usually the bar around a note) with a candidate chord in
 * place of whatever chord sits at `atTick`. The melody always plays as in the
 * song. `neighbors` decides how the other chords in the passage are voiced
 * (decision D4):
 * - "as-song" (default): exactly as in the song, so two auditions differ only
 *   in the candidate's harmony.
 * - "from-candidate": the chord after the candidate voice-leads from it, the
 *   way a pianist would play it.
 * Stops any audition already playing, and nothing else.
 * @param {number[]} voicing the candidate, MIDI, from theory's voice()
 * @param {TickRange} range
 * @param {{ atTick: number, neighbors?: "as-song" | "from-candidate" }} placement
 *   atTick is the onset of the note the candidate sits on
 * @returns {Promise<void>}
 */
export async function auditionChord(voicing, range, placement) {
  stub("auditionChord", voicing, range, placement); // STUB(B)
}

/**
 * auditionChord, debounced (~120 ms) for hover: moving quickly through the
 * dropdown sounds only where the pointer rests.
 * @param {number[]} voicing
 * @param {TickRange} range
 * @param {{ atTick: number, neighbors?: "as-song" | "from-candidate" }} placement
 */
export function auditionDebounced(voicing, range, placement) {
  stub("auditionDebounced", voicing, range, placement); // STUB(B)
}

/**
 * Stop the current audition only, and cancel a pending debounced one, so
 * closing the dropdown inside the debounce window never sounds a late chord.
 * Playback, the drone, the click, and live notes keep sounding (decision D10).
 * The chord dropdown calls this when it closes; stop() is for stopping
 * everything. Stream B tests the pending-cancel case.
 */
export function stopAudition() {
  stub("stopAudition"); // STUB(B)
}

/**
 * Hold a tonic under the melody (the drone test), or stop it with null.
 * @param {number | null} midi
 */
export function drone(midi) {
  stub("drone", midi); // STUB(B)
}

/**
 * Play the melody over a click accented on each downbeat of a candidate meter
 * (the meter test: "lilt in 3 or march in 4?"). The meter carries the pickup
 * and beat unit, so the accent lands right in 6/8 and after an anacrusis.
 * @param {TickRange} range
 * @param {Meter} meter the hypothesis to test, not necessarily the song's
 * @returns {Promise<void>}
 */
export async function playWithClick(range, meter) {
  stub("playWithClick", range, meter); // STUB(B)
}

/** Stop all playback, audition, drone, and click. */
export function stop() {
  stub("stop"); // STUB(B)
}
