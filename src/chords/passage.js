/**
 * The passage a chord is auditioned in: the bar around its note. Every
 * candidate for a note is voiced against the same passage (same lowest melody
 * note, same previous chord), so two auditions differ only in harmony.
 *
 * @import { Song, Note, ChordSpec } from "../types.js"
 * @import { TickRange } from "../audio/index.js"
 */

import { barRange } from "../staff/bars.js";
import { passageBelow, voice } from "../theory/index.js";

/**
 * @typedef {{
 *   note: Note,
 *   range: TickRange,
 *   below: number,
 *   previous: number[] | null,
 * }} Passage
 */

/**
 * The bar around a note, the lowest melody note starting in it (theory's
 * passageBelow, the same rule the audio stream uses), and the voicing of the
 * chord placed before the note, if any.
 * @param {Song} song
 * @param {string} noteId
 * @returns {Passage | null} null when the note is not in the song
 */
export function passageAround(song, noteId) {
  const note = song.notes.find((n) => n.id === noteId);
  if (!note) return null;
  const { range } = barRange(song, note);
  // The audio stream voices the passage's other chords under the same note.
  const below = passageBelow(song, range);
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
