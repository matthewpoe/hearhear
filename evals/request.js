/**
 * What the eval asks the tutor: the app's own snapshot of the melody alone,
 * with no chords and never a title, so the model can't simply recall a
 * famous hymnal harmonization by name. Any title the snapshot gains is
 * stripped here.
 *
 * @import { Song } from "../src/types.js"
 */

import { toTutorSnapshot } from "../src/store/snapshot.js";

/**
 * The snapshot every request about one tune carries.
 * @param {Song} song
 */
export function evalSnapshot(song) {
  // The tutor and the baseline both see the melody with no chords: what goes there is the question.
  const snapshot = toTutorSnapshot({ ...song, chords: [] }, { labelStyle: "roman" });
  delete (/** @type {{ title?: string }} */ (snapshot).title);
  return snapshot;
}

/**
 * One request body for POST /api/tutor.
 * @param {ReturnType<typeof evalSnapshot>} snapshot
 * @param {"nudge" | "comparison" | "answer"} level
 * @param {number} bar
 * @param {number} beat
 */
export const evalRequest = (snapshot, level, bar, beat) => ({
  snapshot,
  hint_level: level,
  question: `What chord could go under the melody note at bar ${bar}, beat ${beat}?`,
  history: [],
});
