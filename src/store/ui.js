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
 *   calloutsOn: boolean,
 * }} UiState
 */

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
