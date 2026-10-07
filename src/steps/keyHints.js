/**
 * "Give me a hint" on the key question: one clue per press, each pointing at
 * where to look or listen, never at the answer. First the last bar, where the
 * tune comes to rest; then the notes written with sharps or flats, which say
 * which scale the tune uses. No clue names a key or a home note: the user
 * still makes the call (docs/PRD.md, "pointing at where to listen").
 *
 * @import { Song } from "../types.js"
 */

import { positionOf, spellMelody } from "../theory/index.js";

/** @typedef {{ id: "rest" | "accidentals", text: string, noteIds: string[] }} KeyHint */

/** How many clues there are: the button goes once they're all shown. */
export const HINT_COUNT = 2;

/**
 * The notes of the tune's last bar, where it comes to rest.
 * @param {Song} song
 */
function lastBar(song) {
  const last = song.notes.at(-1);
  if (!last) return [];
  const { bar } = positionOf(last.start, song.meter);
  return song.notes.filter((n) => positionOf(n.start, song.meter).bar === bar).map((n) => n.id);
}

/**
 * The notes the staff writes with a sharp or flat: spelled in the song's
 * current (provisional) key, as the staff spells them.
 * @param {Song} song
 */
function written(song) {
  const spelled = spellMelody(song.notes, song.key);
  return song.notes.filter((_, i) => /[#b]/.test(spelled[i].slice(1))).map((n) => n.id);
}

/**
 * The clues shown after `presses` presses of "Give me a hint", in order.
 * @param {Song} song
 * @param {number} presses
 * @returns {KeyHint[]}
 */
export function keyHints(song, presses) {
  const marked = written(song);
  /** @type {KeyHint[]} */
  const all = [
    {
      id: "rest",
      text: "Where does it come to rest? Play the last bar and hum its final note.",
      noteIds: lastBar(song),
    },
    {
      id: "accidentals",
      text:
        marked.length > 0
          ? "The marked notes are written with sharps or flats: they tell you which scale the tune lives in."
          : "No note is written with a sharp or flat: the tune stays on the white keys.",
      noteIds: marked,
    },
  ];
  return all.slice(0, Math.max(0, Math.min(presses, HINT_COUNT)));
}
