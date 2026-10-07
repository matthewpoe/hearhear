/**
 * The key question's picker as state transitions. One click commits: a home
 * chip sets the key, the chosen chip clicked again takes the guess back, and
 * switching between major and minor with a home chosen re-commits in the new
 * mode. Each returns the key to re-key to, so every step is one undoable
 * song.rekey.
 *
 * @import { Key } from "../types.js"
 */

import { sameHome, tonicIn } from "./keys.js";

/**
 * The chip that shows as chosen: the committed home, spelled as its mode's
 * chips spell it. Null while the key is provisional (nothing guessed yet).
 * @param {Key} key the song's key
 * @returns {string | null}
 */
export function chosenTonic(key) {
  return key.provisional ? null : tonicIn(key.mode, key);
}

/**
 * The key after a home is clicked (a chip, or a chord in the ear finder).
 * Clicking the home already chosen un-commits it, back to `unguessed`.
 * @param {Key} key the song's key
 * @param {Pick<Key, "tonic" | "mode">} home the one clicked
 * @param {Key} unguessed the provisional key to go back to
 * @returns {Key}
 */
export function afterHomeClick(key, home, unguessed) {
  if (!key.provisional && sameHome(key, home)) return unguessed;
  return { tonic: home.tonic, mode: home.mode, provisional: false };
}

/**
 * The key after major or minor is chosen: the same home in the new mode if a
 * home is chosen, or null when there's nothing to re-key (no guess yet, or
 * the mode is unchanged).
 * @param {Key} key the song's key
 * @param {"major" | "minor"} mode
 * @returns {Key | null}
 */
export function afterModeChange(key, mode) {
  if (key.provisional || key.mode === mode) return null;
  return { tonic: tonicIn(mode, key), mode, provisional: false };
}
