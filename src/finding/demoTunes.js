/**
 * The bundled demo tunes and how a demo starts (contracts/README.md, "Starting
 * a demo"): the tune loads on the provisional C with key labels hidden, and
 * its true key stays in the content file, for the guided path's hints and
 * the key question's feedback (demoHome).
 *
 * @import { Song } from "../types.js"
 */

import odeToJoy from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { song } from "../store/song.js";
import { ui } from "../store/ui.js";
import { stop } from "../audio/index.js";
import { PROVISIONAL_C } from "./keys.js";
import { knownHome } from "./guessFeedback.js";

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

/**
 * The home most ears hear in `current`, if it is a demo tune: the content
 * file's key, followed through any transpose since. Null for other tunes.
 * @param {Song} current
 * @returns {Pick<Song["key"], "tonic" | "mode"> | null}
 */
export function demoHome(current) {
  const demo = DEMO_TUNES.find((tune) => tune.song.id === current.id);
  return demo ? knownHome(current, demo.song) : null;
}

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
    keyboardLights: { source: null, chord: null, melody: [] },
  });
}
