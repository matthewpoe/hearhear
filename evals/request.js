/**
 * What the eval asks the tutor: the app's own snapshot of the melody, with
 * no chords (or, for a "does this work?" request, only the one the player
 * placed) and never a title, so the model can't simply recall a famous
 * harmonization by name. Any title the snapshot gains is stripped here.
 *
 * @import { Chord, Song } from "../src/types.js"
 */

import { toTutorSnapshot } from "../src/store/snapshot.js";

/**
 * The snapshot a request about one tune carries.
 * @param {Song} song
 * @param {Chord[]} [chords] the chords placed, none by default
 */
export function evalSnapshot(song, chords = []) {
  // The tutor and the baseline both see the melody with no chords: what goes there is the question.
  const snapshot = toTutorSnapshot({ ...song, chords }, { labelStyle: "roman" });
  delete (/** @type {{ title?: string }} */ (snapshot).title);
  return snapshot;
}

/**
 * One request body for POST /api/tutor, a question about one note. With
 * `placed` (the numeral of the chord the player put there), it asks whether
 * that chord works instead. `level` is the job's old hint level, no longer
 * sent: the tutor has no hint levels, and every eval request is a question
 * until the eval's review cases replace this.
 * @param {ReturnType<typeof evalSnapshot>} snapshot
 * @param {string} level
 * @param {number} bar
 * @param {number} beat
 * @param {string} [placed]
 */
export const evalRequest = (snapshot, level, bar, beat, placed) => ({
  snapshot,
  mode: "question",
  question: placed
    ? `Does ${placed} work under the melody note at bar ${bar}, beat ${beat}?`
    : `What chord could go under the melody note at bar ${bar}, beat ${beat}?`,
  history: [],
});
