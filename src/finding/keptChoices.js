/**
 * Tunes where the user kept a home most ears don't share ("Keep my choice"),
 * so the key question doesn't ask again. For this page session only: it
 * outlives the key prompt, which remounts per tune and when dismissed.
 */

/** @type {Set<string>} song ids */
const kept = new Set();

/** @param {string} songId */
export function isKept(songId) {
  return kept.has(songId);
}

/** @param {string} songId */
export function keep(songId) {
  kept.add(songId);
}
