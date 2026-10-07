/**
 * Bars as the transport plays them: the bar a note starts in, that bar on its
 * own ("Play bar 4"), and the rest of the song from it ("Play from bar 4").
 * Bar numbers are the meter's: the first full bar is 1, a pickup is bar 0.
 *
 * @import { Note, Song } from "../types.js"
 * @import { TickRange } from "../audio/index.js"
 */

import { rebar, ticksPerBar } from "../theory/index.js";

/**
 * @typedef {{ number: number, bar: TickRange, fromBar: TickRange }} BarPlace
 */

/** @param {Song} song */
export function songEnd(song) {
  return song.notes.reduce((max, n) => Math.max(max, n.start + n.dur), 0);
}

/**
 * The bar a note starts in, stretched to the note's end if it is held across
 * the bar line.
 * @param {Song} song
 * @param {Note} note
 * @returns {{ number: number, range: TickRange }}
 */
export function barRange(song, note) {
  const bar = rebar(song, song.meter).find((b) => b.noteIds.includes(note.id));
  const noteEnd = note.start + note.dur;
  if (!bar) return { number: 0, range: { fromTick: note.start, toTick: noteEnd } };
  const barEnd = bar.index === 0 ? song.meter.pickupTicks : bar.startTick + ticksPerBar(song.meter);
  return {
    number: bar.index,
    range: { fromTick: bar.startTick, toTick: Math.max(barEnd, noteEnd) },
  };
}

/**
 * Where playback starts from a note: its bar alone, and from its bar to the
 * end of the song.
 * @param {Song} song
 * @param {string | null} noteId
 * @returns {BarPlace | null} null with no note, or one no longer in the song
 */
export function barPlace(song, noteId) {
  const note = noteId === null ? undefined : song.notes.find((n) => n.id === noteId);
  if (!note) return null;
  const { number, range } = barRange(song, note);
  return {
    number,
    bar: range,
    fromBar: { fromTick: range.fromTick, toTick: Math.max(range.toTick, songEnd(song)) },
  };
}

/**
 * "bar 4", or "the pickup" for bar 0.
 * @param {number} number
 */
export function barName(number) {
  return number === 0 ? "the pickup" : `bar ${number}`;
}
