/**
 * The bundled demo tunes and how a demo starts (contracts/README.md, "Starting
 * a demo"): the tune loads on the provisional C with key labels hidden, and
 * its true key stays here, in the content file, for the drone test's follow-up.
 *
 * @import { Key, Song } from "../types.js"
 */

import odeToJoy from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { song } from "../store/song.js";
import { ui } from "../store/ui.js";
import { stop } from "../audio/index.js";

/** Blurbs say nothing about key or mode: that's the user's to find. */
export const DEMO_TUNES = [
  {
    song: /** @type {Song} */ (odeToJoy),
    blurb: "Beethoven's tune that almost everyone can hum.",
  },
  {
    song: /** @type {Song} */ (stJames),
    blurb: "A slow New Orleans lament from 1930.",
  },
];

/** @type {Key} */
const PROVISIONAL_C = { tonic: "C", mode: "major", provisional: true };

/**
 * Load a demo tune on the provisional C and wait for the user's guess.
 * @param {Song} tune
 */
export function loadDemo(tune) {
  stop();
  song.load({ ...tune, key: PROVISIONAL_C });
  ui.update({
    demoAwaitingGuess: true,
    selectedNoteId: null,
    playheadNoteId: null,
    keyboardLights: { chord: null, melody: [] },
  });
}

/**
 * The true key of a bundled tune, or null for anything else (free play).
 * @param {string} songId
 * @returns {Key | null}
 */
export function trueKeyOf(songId) {
  return DEMO_TUNES.find((t) => t.song.id === songId)?.song.key ?? null;
}
