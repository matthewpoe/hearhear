/**
 * Notes held right now, from any input: the on-screen piano and the number
 * row both press and release through here, so a note sounds once and lights
 * its piano key however it was played.
 *
 * Each hold is tracked by its source (a number-row key, a pointer, the
 * focused piano key), and a note stops only when the last source holding it
 * lets go: lifting a finger off a piano key never cuts off the same pitch
 * still held on the number row.
 *
 * Record mode listens here too (onNoteEvent): a note starts when its first
 * source presses it and ends when its last source lets go.
 */

import { noteOff, noteOn } from "../audio/index.js";
import { createReadable } from "../lib/readable.js";

/** Who holds each sounding pitch. Never mutated in place; every change publishes a new map. */
const holds = createReadable(/** @type {ReadonlyMap<number, ReadonlySet<string>>} */ (new Map()));

/**
 * A note starting or ending, with the source that started or ended it. Chord
 * keys use sources starting "chord:", so record mode can leave them out.
 * @typedef {{ type: "on" | "off", midi: number, source: string, atMs: number }} NoteEvent
 */

/** @type {Set<(event: NoteEvent) => void>} */
const listeners = new Set();

/**
 * Hear every note start and end, from any input.
 * @param {(event: NoteEvent) => void} listener
 * @returns {() => void} stops listening
 */
export function onNoteEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @param {"on" | "off"} type @param {number} midi @param {string} source */
function emit(type, midi, source) {
  const atMs = performance.now();
  for (const listener of listeners) listener({ type, midi, source, atMs });
}

/** MIDI pitches currently held down, by any source. */
export const heldNotes = {
  /** @param {(value: ReadonlySet<number>) => void} run */
  subscribe: (run) => holds.subscribe((map) => run(new Set(map.keys()))),
};

/**
 * Start a note for a source. A pitch already sounding is not retriggered;
 * the source just joins the holders.
 * @param {number} midi
 * @param {string} source e.g. "key:Digit1", "chord:KeyA", "pointer:3", "focus"
 */
export function press(midi, source) {
  const current = holds.get();
  const holders = current.get(midi);
  if (holders?.has(source)) return;
  holds.set(new Map(current).set(midi, new Set(holders).add(source)));
  if (!holders) {
    noteOn(midi);
    emit("on", midi, source);
  }
}

/**
 * Let go of a note for a source. The note stops when no source holds it.
 * @param {number} midi
 * @param {string} source
 */
export function release(midi, source) {
  const current = holds.get();
  const holders = current.get(midi);
  if (!holders?.has(source)) return;
  const next = new Map(current);
  const rest = new Set(holders);
  rest.delete(source);
  if (rest.size > 0) {
    next.set(midi, rest);
    holds.set(next);
    return;
  }
  next.delete(midi);
  holds.set(next);
  noteOff(midi);
  emit("off", midi, source);
}
