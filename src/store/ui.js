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
 *   keyLabelsHidden: boolean,
 *   calloutsOn: boolean,
 * }} UiState
 *
 * `keyLabelsHidden` keeps a demo from giving away its answer: while true, every
 * key-relative label (melody degrees under the staff and on the piano keys,
 * chord numerals and Nashville numbers, function colors and shapes) stays off.
 * A demo sets it when it loads its tune with the key marked provisional; the
 * user committing a key guess clears it. Free play never sets it: there the
 * provisional C is arbitrary and the number row needs "1 is home" visible.
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
    keyLabelsHidden: false,
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
