/**
 * Tutor suggestions as audition-able alternatives on the chord grid. The tutor
 * panel (Stream F) writes them after client-side validation; the chord row and
 * dropdown (Stream D2) read them and offer each one to audition. Suggestions
 * are never applied to the song automatically.
 *
 * Suggestions remember the song version they were made against. When the song
 * has moved on, they are stale: shown as such, never re-anchored.
 *
 * @import { ChordSpec } from "../types.js"
 */

import { createReadable } from "../lib/readable.js";

/**
 * @typedef {{
 *   id: string,
 *   noteId: string,
 *   chord: ChordSpec,
 *   numeral: string,
 *   confidence: "low" | "medium" | "high",
 *   reason: string,
 * }} Suggestion
 *
 * @typedef {{
 *   snapshotVersion: number | null,
 *   hintLevel: "nudge" | "comparison" | "answer" | null,
 *   items: Suggestion[],
 *   dropped: number,
 * }} SuggestionSet
 */

/** @returns {SuggestionSet} */
const empty = () => ({ snapshotVersion: null, hintLevel: null, items: [], dropped: 0 });

/** Create a suggestions store. The app uses the `suggestions` singleton below. */
export function createSuggestionsStore() {
  const store = createReadable(empty());
  return {
    subscribe: store.subscribe,
    get: store.get,
    /**
     * Replace the current set with a validated tutor reply.
     * @param {SuggestionSet} set
     */
    replace(set) {
      store.set(set);
    },
    clear() {
      store.set(empty());
    },
  };
}

/**
 * True when the song has changed since the suggestions were made.
 * @param {SuggestionSet} set
 * @param {number} songVersion
 */
export function isStale(set, songVersion) {
  return set.snapshotVersion !== null && set.snapshotVersion !== songVersion;
}

/** The app's tutor suggestions. */
export const suggestions = createSuggestionsStore();
