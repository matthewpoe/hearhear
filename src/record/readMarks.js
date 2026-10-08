/**
 * Which of a recorded tune's note sets came straight from reading its take
 * (a take or phrase stopped, or Feel's re-read), so Feel can tell when a
 * re-read would replace edits the user made by hand (the note menu, a
 * transpose, words, placed chords: a re-read replaces every note, so their
 * chords go too). Every read is remembered, so Undo back to an earlier
 * read is clean too. A tune with no read known here (one opened from an
 * earlier page load) counts as unedited.
 *
 * @import { Chord, Note } from "../types.js"
 * @typedef {{ id: string, notes: Note[], chords?: Chord[] }} ReadTune
 */

/**
 * A tune's fingerprint: every field a re-read would change or drop.
 * @param {ReadTune} song
 */
export const readPrint = ({ notes, chords = [] }) =>
  JSON.stringify([
    notes.map(({ id, midi, start, dur, lyric }) => [id, midi, start, dur, lyric]),
    chords.map(({ noteId, root, type }) => [noteId, root, type]),
  ]);

export function createReadMarks() {
  /** @type {Map<string, Set<string>>} */
  const reads = new Map();
  return {
    /**
     * Remember the tune's notes (and chords) as read from its take.
     * @param {ReadTune} song
     */
    mark(song) {
      const prints = reads.get(song.id) ?? new Set();
      prints.add(readPrint(song));
      reads.set(song.id, prints);
    },

    /**
     * Whether the tune's notes or chords have been changed by hand since a
     * read.
     * @param {ReadTune} song
     */
    edited(song) {
      const prints = reads.get(song.id);
      return prints !== undefined && !prints.has(readPrint(song));
    },
  };
}
