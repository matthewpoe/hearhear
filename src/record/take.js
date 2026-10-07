/**
 * Record mode's pure core: key presses captured while recording become a
 * song. No DOM, audio, or store.
 *
 * A take is a list of presses, each a pitch with its key-down and key-up
 * times. It is played into the one melody line, so it is made monophonic
 * first (a later onset cuts the earlier note off), then guessRhythm turns the
 * times into ticks and a tempo.
 *
 * @import { Song } from "../types.js"
 */

import { guessRhythm } from "../theory/index.js";

/** The song store's note limit (and the tutor snapshot's): a take stops here. */
export const MAX_TAKE_NOTES = 400;

/** Every recorded tune's id starts with this, so the picker can tell them from demos. */
export const USER_TUNE_PREFIX = "mine-";

/** The song schema's bound on a title. */
export const MAX_TITLE_CHARS = 120;

/** The song schema's tempo range, in BPM. */
const MIN_TEMPO = 30;
const MAX_TEMPO = 240;

/**
 * One captured press. `upMs` is undefined while the key is still down.
 * @typedef {{ midi: number, downMs: number, upMs?: number }} Press
 */

/** @param {string} id */
export const isUserTune = (id) => id.startsWith(USER_TUNE_PREFIX);

/**
 * A fresh id for a recorded tune, from the time it was made: short, sortable,
 * and inside the song schema's pattern.
 * @param {number} nowMs
 * @param {Iterable<string>} [taken] ids already in use
 */
export function newTuneId(nowMs, taken = []) {
  const used = new Set(taken);
  let n = Math.floor(nowMs);
  while (used.has(USER_TUNE_PREFIX + n.toString(36))) n++;
  return USER_TUNE_PREFIX + n.toString(36);
}

/**
 * The title a new take is offered: "My tune 1", "My tune 2", and so on,
 * skipping any the user already has.
 * @param {Iterable<string>} titles the user's tunes' titles
 */
export function nextTitle(titles) {
  const used = new Set([...titles].map((t) => t.trim().toLowerCase()));
  let n = 1;
  while (used.has(`my tune ${n}`)) n++;
  return `My tune ${n}`;
}

/**
 * A typed title, cleaned for the song: whitespace collapsed, trimmed, cut to
 * the schema's bound by code point. Blank keeps `fallback`.
 * @param {string} raw
 * @param {string} fallback
 */
export function cleanTitle(raw, fallback) {
  const title = Array.from(raw.replace(/\s+/g, " ").trim()).slice(0, MAX_TITLE_CHARS).join("");
  return title || fallback;
}

/**
 * Make a take monophonic: in onset order, a press still held when the next
 * starts is cut off there. A press still down when the take stops ends at
 * `endMs`.
 * @param {Press[]} presses
 * @param {number} endMs
 * @returns {{ midi: number, downMs: number, upMs: number }[]}
 */
export function monophonic(presses, endMs) {
  const sorted = [...presses].sort((a, b) => a.downMs - b.downMs);
  return sorted.map((press, i) => {
    const next = sorted[i + 1];
    let upMs = press.upMs ?? endMs;
    if (next && upMs > next.downMs) upMs = next.downMs;
    return { midi: press.midi, downMs: press.downMs, upMs: Math.max(upMs, press.downMs) };
  });
}

/**
 * The tempo a detected beat implies, rounded and kept in the schema's range.
 * @param {number} beatMs
 */
export function tempoFor(beatMs) {
  const bpm = Math.round(60000 / beatMs);
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Number.isFinite(bpm) ? bpm : 96));
}

/**
 * A take's notes in ticks and its tempo. Slipped onsets (two keys pressed
 * together) merge into one note, as guessRhythm decides.
 * @param {Press[]} presses at most MAX_TAKE_NOTES; extras are left out
 * @param {number} endMs when the take stopped, or now while it runs
 * @param {{ running?: boolean }} [options] `running`: the take hasn't
 *   stopped, so a tapped last note shows one beat instead of growing to now
 * @returns {{ notes: { midi: number, start: number, dur: number }[], tempo: number, swing: boolean }}
 *   `swing`: most eighth pairs were swung (not yet written to the song)
 */
export function takeNotes(presses, endMs, { running = false } = {}) {
  const events = monophonic(presses.slice(0, MAX_TAKE_NOTES), endMs);
  if (events.length === 0) return { notes: [], tempo: 96, swing: false };
  const { notes, beatMs, dropped, swing } = guessRhythm(events, running ? {} : { endMs });
  const kept = events.filter((_, i) => !dropped.includes(i));
  return {
    notes: notes.map((n, i) => ({ midi: kept[i].midi, start: n.start, dur: n.dur })),
    tempo: tempoFor(beatMs),
    swing,
  };
}

/** The swing a swung take plays back with: triplet swing, about 2:1. */
export const RECORDED_SWING = 2;

/**
 * A recorded tune: 4/4 with no pickup, the tempo from the take, and the key
 * provisional (C, until the key question finds home). Note ids are n1, n2, …
 * A take whose eighth pairs were mostly swung is marked to play back swung
 * (the notation stays straight eighths).
 * @param {{ id: string, title: string, notes: { midi: number, start: number, dur: number }[], tempo: number, swing?: boolean }} take
 * @returns {Song}
 */
export function recordedSong({ id, title, notes, tempo, swing = false }) {
  return {
    ...(swing ? { swing: RECORDED_SWING } : {}),
    schemaVersion: 1,
    id,
    title,
    key: { tonic: "C", mode: "major", provisional: true },
    meter: { beatsPerBar: 4, beatUnit: 4, pickupTicks: 0, provisional: true },
    tempo,
    version: 0,
    notes: notes.map((n, i) => ({ id: `n${(i + 1).toString(36)}`, ...n })),
    chords: [],
  };
}
