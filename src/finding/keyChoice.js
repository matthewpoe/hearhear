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
 * Whether `home` is the committed home: false while the key is provisional.
 * @param {Key} key the song's key
 * @param {Pick<Key, "tonic" | "mode">} home
 * @returns {boolean}
 */
export function isHome(key, home) {
  return !key.provisional && sameHome(key, home);
}

/**
 * The key after a home chip is clicked. Clicking the home already chosen
 * un-commits it: the same key, provisional again. It keeps the tonic and mode
 * rather than going back to the demo's provisional C, because the tune may
 * have been transposed since, and the labels must still fit the notes.
 * @param {Key} key the song's key
 * @param {Pick<Key, "tonic" | "mode">} home the one clicked
 * @returns {Key}
 */
export function afterHomeClick(key, home) {
  if (isHome(key, home)) return { ...key, provisional: true };
  return { tonic: home.tonic, mode: home.mode, provisional: false };
}

/**
 * The key after a chord is chosen in the ear finder. Choosing the home that's
 * already committed confirms it rather than taking it back (un-choosing is
 * for the chips only), so this returns null: nothing to re-key.
 * @param {Key} key the song's key
 * @param {Pick<Key, "tonic" | "mode">} home the chord's home
 * @returns {Key | null}
 */
export function afterFinderPick(key, home) {
  if (isHome(key, home)) return null;
  return { tonic: home.tonic, mode: home.mode, provisional: false };
}

/**
 * How a chord chosen in the ear finder compares with the guess before it,
 * shown once the finder reveals the chords' names: "first" when nothing was
 * chosen yet, "same" when it's the committed home, "different" otherwise.
 * @param {Key} key the song's key before the pick
 * @param {Pick<Key, "tonic" | "mode">} home the chord's home
 * @returns {"first" | "same" | "different"}
 */
export function finderComparison(key, home) {
  if (key.provisional) return "first";
  return sameHome(key, home) ? "same" : "different";
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
