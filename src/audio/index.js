/**
 * The audio API (Stream B). This module owns the single AudioContext (Tone.js's
 * default context, latencyHint "interactive") and all sound: live notes, phrase
 * playback with synced visual events, chord audition, drone, and click.
 *
 * CONTRACT: exported names, parameters, and return shapes are frozen (see
 * contracts/README.md).
 *
 * Melody notes and placed chords come from the song store; callers pass only
 * tick ranges and what differs from the song. Failures never throw: every
 * async function resolves, and `audioStatus` shows loading, failed, and the
 * retry (call `preload` again).
 *
 * @import { Chord, Meter, Song } from "../types.js"
 * @import { Cue } from "./passage.js"
 */

import { song } from "../store/song.js";
import { passageBelow } from "../theory/index.js";
import { current, hz, loadSamples, status, wake } from "./engine.js";
import { play, stopPlayback } from "./playback.js";
import {
  auditionChordCues,
  chordCues,
  clickCues,
  melodyCues,
  placeChords,
  secondsPerTick,
  swingPassage,
} from "./passage.js";

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

const LIVE_VELOCITY = 0.8;
const AUDITION_DEBOUNCE_MS = 120;

/** Sound check: an open C major (add 9), rolled upward. */
const SOUND_CHECK = [48, 55, 64, 67, 74];
const SOUND_CHECK_ROLL = 0.06;
const SOUND_CHECK_SECONDS = 1.8;

/** Sample loading and unlock state; every async boundary shows loading, failed, retry. */
export const audioStatus = { subscribe: status.subscribe };

/** Keys held down right now, so auto-repeat and double presses sound once. */
const held = new Set();
/** The drone's pitches, empty when silent: a new array per drone() call. */
let droneTones = /** @type {number[]} */ ([]);
/** Bumped by every playback request and by stop(), so a superseded start never plays. */
let request = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let auditionTimer;
/** The `request` the latest audition started, so stopAudition() stops only that one. */
let auditionRequest = 0;

/**
 * Start fetching the piano samples (C2–C6). Call from the landing screen,
 * before any click, so the first sound is instant. Calling it again after
 * `audioStatus` reads failed is the retry.
 * @returns {Promise<void>}
 */
export async function preload() {
  await loadSamples();
}

/**
 * Unlock browser audio and play the sound-check chord, so the first click
 * starts something satisfying. Call it from a user gesture (a click or key
 * press) before anything else sounds: browsers keep audio suspended until then.
 * @returns {Promise<void>}
 */
export async function unlock() {
  const engine = await wake();
  const pianos = engine?.pianos;
  if (!engine || !pianos) return;
  const start = engine.Tone.now();
  SOUND_CHECK.forEach((midi, i) => {
    pianos.phrase.triggerAttackRelease(
      hz(midi),
      SOUND_CHECK_SECONDS,
      start + i * SOUND_CHECK_ROLL,
      0.6,
    );
  });
}

/**
 * Start audio without a sound: unlock() minus the sound-check chord. Call it
 * from a user gesture whose next sound is the tune itself (a note click that
 * opens the chords), so a C chord never plays over a tune in another key.
 * Resolves whether or not audio started; failures show through `audioStatus`.
 * @returns {Promise<void>}
 */
export async function resume() {
  await wake();
}

/** @param {number} midi */
function attackLive(midi) {
  const engine = current();
  // Immediate: live notes skip the look-ahead that scheduled playback uses.
  engine?.pianos?.live.triggerAttack(hz(midi), engine.Tone.immediate(), LIVE_VELOCITY);
}

/**
 * Sound one live note immediately (zero look-ahead). Ignores repeats while held.
 * A key press before unlock() is itself a gesture, so the first note unlocks.
 * @param {number} midi
 */
export function noteOn(midi) {
  if (held.has(midi)) return;
  held.add(midi);
  const engine = current();
  if (engine?.pianos && engine.Tone.getContext().state === "running") {
    attackLive(midi);
    return;
  }
  // First note before unlock or preload: start audio, then sound it if still held.
  void wake().then(() => {
    if (held.has(midi)) attackLive(midi);
  });
}

/** @param {number} midi */
export function noteOff(midi) {
  if (!held.delete(midi)) return;
  const engine = current();
  engine?.pianos?.live.triggerRelease(hz(midi), engine.Tone.immediate());
}

/**
 * Sound one live note for `ms`, then let it go: noteOn now, noteOff later.
 * @param {number} midi
 * @param {number} ms
 */
export function tapNote(midi, ms) {
  noteOn(midi);
  setTimeout(() => noteOff(midi), ms);
}

/**
 * Wake the engine and play the cues `build` makes from the current song,
 * unless stop() or a newer request comes first.
 * @param {TickRange} range
 * @param {(s: Song) => Cue[]} build
 * @param {(event: PlaybackEvent) => void} [onEvent]
 * @returns {Promise<void>}
 */
function playCues(range, build, onEvent) {
  return playRequest(++request, range, build, onEvent);
}

/**
 * playCues for a request number taken already.
 * @param {number} mine this playback's `request`
 * @param {TickRange} range
 * @param {(s: Song) => Cue[]} build
 * @param {(event: PlaybackEvent) => void} [onEvent]
 * @returns {Promise<void>}
 */
async function playRequest(mine, range, build, onEvent) {
  const engine = await wake();
  if (mine !== request || !engine?.pianos) {
    onEvent?.({ type: "end" });
    return;
  }
  const tune = song.get();
  await play(
    engine,
    engine.pianos,
    {
      ...swingPassage({ cues: build(tune), ...range }, tune),
      secondsPerTick: secondsPerTick(tune),
    },
    onEvent,
  );
}

/**
 * Play part of the song on the Transport. Like every function here that
 * sounds, it needs unlock() to have run from a user gesture first; while the
 * browser holds audio suspended it resolves at once with an `end` event.
 * `onEvent` fires through Tone.Draw,
 * in sync with the sound, so the staff and keyboard can light each note.
 * Resolves when playback ends or is stopped, on the audio clock rather than
 * the animation frame, so it resolves in a background tab too. `chords` replaces the song's
 * chords for this playback only (the cadence test plays V-I in a candidate
 * key); omit it to play the song as written.
 * @param {TickRange} range
 * @param {{ chords?: { chord: Chord, voicing: number[] }[], onEvent?: (event: PlaybackEvent) => void }} [options]
 * @returns {Promise<void>}
 */
export function playPhrase(range, { chords, onEvent } = {}) {
  return playCues(
    range,
    (s) => {
      const placed = placeChords(s, chords ?? s.chords.map((chord) => ({ chord })));
      return [...melodyCues(s, range), ...chordCues(placed, range, passageBelow(s, range))];
    },
    onEvent,
  );
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
export function auditionChord(voicing, range, placement) {
  clearTimeout(auditionTimer);
  auditionRequest = ++request;
  return playRequest(auditionRequest, range, (s) => {
    const placed = placeChords(
      s,
      s.chords.map((chord) => ({ chord })),
    );
    const below = passageBelow(s, range);
    return [
      ...melodyCues(s, range),
      ...auditionChordCues(placed, voicing, range, placement, below),
    ];
  });
}

/**
 * auditionChord, debounced (~120 ms) for hover: moving quickly through the
 * dropdown sounds only where the pointer rests.
 * @param {number[]} voicing
 * @param {TickRange} range
 * @param {{ atTick: number, neighbors?: "as-song" | "from-candidate" }} placement
 */
export function auditionDebounced(voicing, range, placement) {
  clearTimeout(auditionTimer);
  auditionTimer = setTimeout(
    () => void auditionChord(voicing, range, placement),
    AUDITION_DEBOUNCE_MS,
  );
}

/**
 * Stop the current audition only, and cancel a pending debounced one, so
 * closing the dropdown inside the debounce window never sounds a late chord.
 * Playback, the drone, the click, and live notes keep sounding (decision D10).
 * The chord dropdown calls this when it closes; stop() is for stopping
 * everything. Stream B tests the pending-cancel case.
 */
export function stopAudition() {
  clearTimeout(auditionTimer);
  if (auditionRequest !== request) return; // a newer playback has the Transport
  request++; // an audition still waiting on wake() never starts
  stopPlayback();
}

/**
 * Hold a chord (or one note) under the melody, the key finder's test, or stop
 * it with null. A new call replaces whatever is held.
 * @param {number | number[] | null} tones MIDI
 */
export function drone(tones) {
  const next = tones === null ? [] : typeof tones === "number" ? [tones] : [...tones];
  if (next.length === droneTones.length && next.every((m, i) => m === droneTones[i])) return;
  const engine = current();
  if (droneTones.length > 0) engine?.drone.releaseAll();
  droneTones = next;
  if (next.length === 0) return;
  void wake().then((woken) => {
    if (droneTones === next) woken?.drone.triggerAttack(next.map(hz));
  });
}

/**
 * Play the melody over a click accented on each downbeat of a candidate meter
 * (the meter test: "lilt in 3 or march in 4?"). The meter carries the pickup
 * and beat unit, so the accent lands right in 6/8 and after an anacrusis.
 * @param {TickRange} range
 * @param {Meter} meter the hypothesis to test, not necessarily the song's
 * @returns {Promise<void>}
 */
export function playWithClick(range, meter) {
  return playCues(range, (s) => [...melodyCues(s, range), ...clickCues(meter, range)]);
}

/** Stop all playback, audition, drone, and click. */
export function stop() {
  request++;
  clearTimeout(auditionTimer);
  stopPlayback();
  drone(null);
  held.clear();
  const pianos = current()?.pianos;
  pianos?.live.releaseAll();
  pianos?.phrase.releaseAll(); // the sound check plays outside any playback
}
