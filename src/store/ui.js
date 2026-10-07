/**
 * UI state: hover, selection, playhead, modes, and view preferences. Changing
 * it never bumps the song version, never enters undo history, and never
 * re-renders the staff (the staff toggles CSS classes instead).
 *
 * @import { LabelStyle, HarmonicFunction } from "../types.js"
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
 *   keyboardLights: KeyboardLights,
 *   auditionVoicing: AuditionVoicing,
 *   calloutsOn: boolean,
 *   bottomRow: BottomRow,
 * }} UiState
 */

/**
 * What the A–J row of the computer keyboard plays (Stream R).
 * "chords": the diatonic chord on each scale degree (A is the home chord), the
 * default, so a melody can be harmonized from the keyboard.
 * "notes": single notes two octaves under the number row, as the PRD's fixed
 * rows describe.
 * @typedef {"chords" | "notes"} BottomRow
 */

/**
 * How the chords around an auditioned candidate are voiced (decision D4).
 * "as-song": they hold still, voiced exactly as in the song, so only the
 * candidate changes: the cleanest test of fit, and the default.
 * "from-candidate": they flow from the candidate, the way a pianist would
 * play it. The toggle lives in the chord dropdown with a beginner explainer
 * (content/explainers.json). After a commit the phrase replays with natural
 * voice leading either way.
 * @typedef {"as-song" | "from-candidate"} AuditionVoicing
 */

/**
 * Keys to light on the on-screen piano (Stream D1 renders them). Chord tones
 * glow in their function color; melody notes in a neutral highlight. D1
 * lights its own pressed keys itself.
 *
 * `source` says who owns the lights. Playback (playWithVisuals, which also
 * drives the key-finding tests) outranks hover: the chord dropdown writes only
 * while `source` isn't "playback", and every writer clears the lights only
 * when `source` is still its own.
 * @typedef {{
 *   source: "playback" | "hover" | null,
 *   chord: { midi: number[], fn: HarmonicFunction } | null,
 *   melody: number[],
 * }} KeyboardLights
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
    keyboardLights: { source: null, chord: null, melody: [] },
    auditionVoicing: "as-song",
    calloutsOn: true,
    bottomRow: "chords",
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
