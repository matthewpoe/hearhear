/**
 * What the eval asks the tutor: the app's own snapshot of the song, with the
 * student's chart (a review) or only the one chord a "does this work?"
 * question is about, and never a title, so the model can't simply recall a famous
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
  const snapshot = toTutorSnapshot({ ...song, chords }, { labelStyle: "roman" });
  delete (/** @type {{ title?: string }} */ (snapshot).title);
  return snapshot;
}

/**
 * One request body for POST /api/tutor. A review asks about the whole chart
 * and carries no question; a question names what the student asked.
 * @param {ReturnType<typeof evalSnapshot>} snapshot
 * @param {"review" | "question"} mode
 * @param {string} [question] required for a question
 */
export function evalRequest(snapshot, mode, question) {
  if (mode === "question" && !question) throw new Error("A question request needs its question.");
  return { snapshot, mode, ...(question ? { question } : {}), history: [] };
}

/**
 * The "does this work?" question about a placed chord.
 * @param {string} numeral the placed chord's numeral
 * @param {number} bar
 * @param {number} beat
 */
export const checkQuestion = (numeral, bar, beat) =>
  `Does ${numeral} work under the melody note at bar ${bar}, beat ${beat}?`;
