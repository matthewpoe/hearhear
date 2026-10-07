/**
 * Client-side re-validation of the tutor's suggestions (contracts/tutor-sse.md).
 * The server already validated their shape; this checks them against the song
 * they were made for: the numeral parses, the numeral and letter name the same
 * chord in the song's key, and the bar and beat land on a note onset. One bad
 * suggestion is dropped and counted, never allowed near playback.
 *
 * Numeral and letter agree by chord identity, not spelling: A# and Bb are one
 * root, and "Bdim", "Bo", and "B°" one chord. A kept suggestion carries the
 * chord as the numeral spells it in the key, never the tutor's letter name.
 *
 * @import { Song } from "../types.js"
 * @import { Suggestion } from "../store/suggestions.js"
 */

import { chordFromLetter, chordFromNumeral, positionOf, sameChord } from "../theory/index.js";

const CONFIDENCE = new Set(["low", "medium", "high"]);

/** Snapshot beats are rounded to three places (src/store/snapshot.js). */
const BEAT_TOLERANCE = 0.001;

let nextId = 0;

/**
 * @param {unknown[]} raw the `suggestions` array from the stream
 * @param {Song} song the song the request's snapshot was built from
 * @returns {{ items: Suggestion[], dropped: number }}
 */
export function checkSuggestions(raw, song) {
  const onsets = song.notes.map((note) => ({ note, at: positionOf(note.start, song.meter) }));
  /** @type {Suggestion[]} */
  const items = [];
  for (const candidate of raw) {
    const s = /** @type {Record<string, unknown>} */ (candidate ?? {});
    const { bar, beat, numeral, letter, confidence, reason } = s;
    if (
      typeof numeral !== "string" ||
      typeof letter !== "string" ||
      typeof reason !== "string" ||
      typeof confidence !== "string" ||
      !CONFIDENCE.has(confidence)
    ) {
      continue;
    }
    const chord = chordFromNumeral(numeral, song.key);
    const named = chordFromLetter(letter);
    if (!chord || !named || !sameChord(chord, named)) continue;
    const onset = onsets.find(
      ({ at }) =>
        at.bar === bar && typeof beat === "number" && Math.abs(at.beat - beat) < BEAT_TOLERANCE,
    );
    if (!onset) continue;
    items.push({
      id: `s${++nextId}`,
      noteId: onset.note.id,
      chord,
      numeral,
      confidence: /** @type {Suggestion["confidence"]} */ (confidence),
      reason,
    });
  }
  return { items, dropped: raw.length - items.length };
}
