/**
 * What the key question says back after a guess. A guess is a hunch the user
 * can change, so the words say "you chose", never "home is". A demo tune
 * knows its home, so there the reply also says whether most ears agree,
 * without naming the home: a match is confirmed, a mismatch is an invitation
 * to check by ear, and once the user keeps a mismatched choice it isn't
 * raised again for that tune. Copy is Matthew's, in content/explainers.json.
 *
 * @import { Key, Song } from "../types.js"
 */

import explainers from "../../content/explainers.json" with { type: "json" };
import { TONICS, keyName, pitchClass, sameHome } from "./keys.js";
import { displayNote, spokenNote } from "../theory/noteDisplay.js";

/** @typedef {Pick<Key, "tonic" | "mode">} Home */

/**
 * "neutral": no known home, or a mismatch the user chose to keep.
 * "match": the home most ears hear.
 * "otherMode": the right home note in the other mode.
 * "mismatch": a different home.
 * @typedef {"neutral" | "match" | "otherMode" | "mismatch"} Feedback
 */

export const COPY = explainers.keyGuess;

/**
 * The home a demo tune is known to have, moved by however far the tune has
 * been transposed since it loaded. The distance comes from a note both
 * versions share by id (ids survive transposing). Null when `current` isn't
 * that demo, or has no note left from it.
 * @param {Pick<Song, "id" | "notes">} current the song on the staff
 * @param {Pick<Song, "id" | "notes" | "key">} demo the demo as bundled
 * @returns {Home | null}
 */
export function knownHome(current, demo) {
  if (current.id !== demo.id) return null;
  const original = new Map(demo.notes.map((n) => [n.id, n.midi]));
  const shared = current.notes.find((n) => original.has(n.id));
  if (!shared) return null;
  const shift = shared.midi - /** @type {number} */ (original.get(shared.id));
  const pc = (((pitchClass(demo.key) + shift) % 12) + 12) % 12;
  return { tonic: TONICS[demo.key.mode][pc], mode: demo.key.mode };
}

/**
 * How the reply to a guess reads.
 * @param {Home} guess the committed home
 * @param {Home | null} known the tune's home, if known
 * @param {boolean} kept the user has kept a choice most ears don't share
 * @returns {Feedback}
 */
export function guessFeedback(guess, known, kept) {
  if (!known) return "neutral";
  if (sameHome(guess, known)) return "match";
  if (kept) return "neutral";
  return guess.mode !== known.mode && pitchClass(guess) === pitchClass(known)
    ? "otherMode"
    : "mismatch";
}

/**
 * The reply as one string, for the live region.
 * @param {Home} guess
 * @param {Feedback} feedback
 */
export function feedbackText(guess, feedback) {
  const chose = fill(COPY.chose, guess, spokenNote);
  return feedback === "neutral" ? chose : `${chose} ${COPY[feedback]}`;
}

/**
 * The finder's line after a pick, once the chords' names are revealed.
 * @param {"first" | "same" | "different"} comparison
 */
export function finderText(comparison) {
  if (comparison === "same") return COPY.finderSame;
  return comparison === "different" ? COPY.finderDifferent : COPY.finderFirst;
}

/**
 * A copy line with its {key} filled in, shown with ♭ and ♯ ("You chose D♭
 * major"); `spoken` spells them out instead, for an announcement.
 * @param {string} line
 * @param {Home} key
 * @param {(name: string) => string} [spoken]
 */
export function fill(line, key, spoken = displayNote) {
  return line.replace("{key}", spoken(keyName(key)));
}
