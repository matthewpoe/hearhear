/**
 * The passage a chord is auditioned in: the bar around its note. Every
 * candidate for a note is voiced against the same passage (same lowest melody
 * note, same previous chord), so two auditions differ only in harmony.
 *
 * @import { Song, Note, ChordSpec } from "../types.js"
 * @import { TickRange } from "../audio/index.js"
 */

import { rebar, ticksPerBar, voice } from "../theory/index.js";

/**
 * @typedef {{
 *   note: Note,
 *   range: TickRange,
 *   below: number,
 *   previous: number[] | null,
 * }} Passage
 */

/**
 * The bar around a note, the lowest melody note in it, and the voicing of the
 * chord placed before the note, if any.
 * @param {Song} song
 * @param {string} noteId
 * @returns {Passage | null} null when the note is not in the song
 */
export function passageAround(song, noteId) {
  const note = song.notes.find((n) => n.id === noteId);
  if (!note) return null;
  const range = barRange(song, note);
  const inRange = song.notes.filter(
    (n) => n.start < range.toTick && n.start + n.dur > range.fromTick,
  );
  const below = Math.min(...inRange.map((n) => n.midi));
  const before = song.chords
    .map((chord) => ({ chord, start: song.notes.find((n) => n.id === chord.noteId)?.start ?? -1 }))
    .filter(({ start }) => start >= 0 && start < note.start)
    .sort((a, b) => b.start - a.start)[0];
  const previous = before ? voice(before.chord, null, { below }) : null;
  return { note, range, below, previous };
}

/**
 * A candidate's voicing in a passage.
 * @param {Passage} passage
 * @param {ChordSpec} chord
 * @returns {number[]} MIDI, ascending, all below the passage's melody
 */
export function voicingIn(passage, chord) {
  return voice(chord, passage.previous, { below: passage.below });
}

/**
 * The bar a note starts in, stretched to the note's end if it is held across
 * the bar line. Bar 0 is the pickup.
 * @param {Song} song
 * @param {Note} note
 * @returns {TickRange}
 */
function barRange(song, note) {
  const bar = rebar(song, song.meter).find((b) => b.noteIds.includes(note.id));
  const noteEnd = note.start + note.dur;
  if (!bar) return { fromTick: note.start, toTick: noteEnd };
  const barEnd = bar.index === 0 ? song.meter.pickupTicks : bar.startTick + ticksPerBar(song.meter);
  return { fromTick: bar.startTick, toTick: Math.max(barEnd, noteEnd) };
}
