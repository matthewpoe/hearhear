/**
 * UI state: hover, selection, playhead, modes, and view preferences. Changing
 * it never bumps the song version, never enters undo history, and never
 * re-renders the staff (the staff toggles CSS classes instead).
 *
 * @import { LabelStyle } from "../types.js"
 */

import { createReadable } from "../lib/readable.js";

/**
 * @typedef {{
 *   selectedNoteId: string | null,
 *   hoveredNoteId: string | null,
 *   playheadNoteId: string | null,
 *   entryMode: "noodle" | "record",
 *   windowOctave: number,
 *   labelStyle: LabelStyle,
 *   showDegrees: boolean,
 *   demoAwaitingGuess: boolean,
 *   calloutsOn: boolean,
 * }} UiState
 */

/**
 * How key-relative labels (melody degrees, chord numerals and Nashville
 * numbers, function colors and shapes, the staff's key signature) appear.
 * - "hidden": a demo before the user guesses home. Nothing key-relative shows,
 *   and the staff has no key signature (accidentals on the notes), so neither
 *   the screen nor the notation gives the answer away.
 * - "tentative": free play on the provisional C. Labels and colors show, but
 *   styled as tentative so a default C never masquerades as an answer.
 * - "confirmed": the user has committed a key. Everything derives from that
 *   hypothesis, even a wrong one: a wrong home colors the progression oddly,
 *   and that is the lesson working.
 * Views animate the change to "confirmed" as a reveal (the staff and keyboard
 * filling with color), honoring prefers-reduced-motion.
 * @typedef {"hidden" | "tentative" | "confirmed"} KeyLabelMode
 */

/**
 * @param {{ key: { provisional: boolean } }} song
 * @param {{ demoAwaitingGuess: boolean }} ui
 * @returns {KeyLabelMode}
 */
export function keyLabelMode(song, ui) {
  if (!song.key.provisional) return "confirmed";
  return ui.demoAwaitingGuess ? "hidden" : "tentative";
}

/** @returns {UiState} */
export function initialUi() {
  return {
    selectedNoteId: null,
    hoveredNoteId: null,
    playheadNoteId: null,
    entryMode: "noodle",
    windowOctave: 0,
    labelStyle: "roman",
    showDegrees: true,
    demoAwaitingGuess: false,
    calloutsOn: true,
  };
}

/** @param {UiState} [initial] */
export function createUiStore(initial = initialUi()) {
  const store = createReadable(initial);
  return {
    subscribe: store.subscribe,
    get: store.get,
    /** @param {Partial<UiState>} patch */
    update(patch) {
      store.set({ ...store.get(), ...patch });
    },
  };
}

/** The app's UI state. */
export const ui = createUiStore();
