/**
 * Noodle mode: the computer keyboard is the instrument. The number row plays
 * scale degrees in the current key (Q–U one octave below, A–J two below; the
 * numeric keypad's digits play as the number row's),
 * Shift raises, Alt/Option lowers, and the up and down arrows move the whole
 * window an octave, as far as keeps every key on the C2–C6 piano (see
 * windowBounds). Keys are read by physical position (KeyboardEvent.code),
 * since Shift+3 arrives as "#" and Option+3 on a Mac as "£".
 *
 * With ui.bottomRow set to "chords" (the default), the A–J row plays the
 * diatonic chord on each degree instead (see chordRow.js), held while the key
 * is held. With a staff note selected and the key confirmed, it also places
 * that chord on the note, and Backspace or Delete clears it. With Shift they
 * delete the note instead, and the staff handles that (Staff.svelte): kept
 * apart so pressing Backspace again after clearing a chord never deletes.
 *
 * Another handler that consumes a key (the chord dropdown auditioning by
 * degree, say) calls preventDefault, and the number row leaves it alone.
 */

import { fieldOwnsKey } from "../lib/fieldOwnsKey.js";
import { createReadable } from "../lib/readable.js";
import { song } from "../store/song.js";
import { keyLabelMode, ui } from "../store/ui.js";
import { degreeToMidi, keyEventToDegree, voice } from "../theory/index.js";
import { numpadAsDigit } from "../theory/keyboard.js";
import { CHORD_CODES, chordForCode, chordRowAction, clearsChord, liveVoicing } from "./chordRow.js";
import { clampWindow, onPiano } from "./keyBindings.js";
import { press, release } from "./liveNotes.js";

/**
 * Windows browsers may not let a page cancel every Alt+letter (Alt+D focuses
 * the address bar, Alt+F opens the menu). Unverified, so `-` also arms a flat
 * for the next note, on every platform. See docs/decisions/d1-input.md.
 */
export const ONE_SHOT_FLAT_FALLBACK = true;
const ONE_SHOT_FLAT_CODE = "Minus";

const armed = createReadable(false);

/** True while `-` has armed a flat for the next note. */
export const flatArmed = { subscribe: armed.subscribe };

/**
 * @typedef {{ code: string, midi: number[], fn: import("../types.js").HarmonicFunction }} HeldChord
 */
const lastChord = createReadable(/** @type {HeldChord | null} */ (null));

/**
 * The chord-row chord held right now (the latest, if several), for the piano
 * to light in its function color. Kept here rather than in ui.keyboardLights,
 * whose writers are playback and the chord dropdown.
 */
export const heldChord = { subscribe: lastChord.subscribe };

/** @param {number} delta */
function shiftWindow(delta) {
  const { key } = song.get();
  const current = clampWindow(key, ui.get().windowOctave);
  const next = clampWindow(key, current + delta);
  if (next !== current) ui.update({ windowOctave: next });
}

/** The hold a number-row key keeps in liveNotes. @param {string} code */
const source = (code) => `key:${code}`;

/** A chord-row chord's hold: record mode captures melody only. @param {string} code */
const chordSource = (code) => `chord:${code}`;

/**
 * Backspace or Delete: clear the selected note's chord, when the chord row
 * could have placed one there. True when it did.
 */
function clearSelectedChord() {
  const current = song.get();
  const { selectedNoteId } = ui.get();
  if (!clearsChord({ mode: keyLabelMode(current, ui.get()), selectedNoteId })) return false;
  if (!current.chords.some((c) => c.noteId === selectedNoteId)) return false;
  song.setChord(/** @type {string} */ (selectedNoteId), null);
  return true;
}

/** What a chord-row key does right now (see chordRowAction). */
function currentChordRowAction() {
  const state = ui.get();
  return chordRowAction({
    bottomRow: state.bottomRow,
    mode: keyLabelMode(song.get(), state),
    selectedNoteId: state.selectedNoteId,
  });
}

/**
 * Play a chord-row key, and place its chord on the selected note when the
 * action is "assign". An assigned chord sounds under its note, with the note
 * on top; a live one sounds under home.
 * @param {string} code a chord-row key
 * @param {"assign" | "play"} action
 * @returns {{ midi: number[], fn: import("../types.js").HarmonicFunction }}
 */
function chordRowPress(code, action) {
  const current = song.get();
  const { selectedNoteId, windowOctave } = ui.get();
  const { chord, fn } = /** @type {NonNullable<ReturnType<typeof chordForCode>>} */ (
    chordForCode(code, current.key)
  );
  const note = current.notes.find((n) => n.id === selectedNoteId);
  if (action === "assign" && note) {
    song.setChord(note.id, chord);
    return { midi: [...voice(chord, null, { below: note.midi }), note.midi], fn };
  }
  return { midi: liveVoicing(chord, current.key, clampWindow(current.key, windowOctave)), fn };
}

/**
 * Listen for the number row on a target (the window, in the app).
 * @param {Window} target
 * @returns {() => void} stops listening and releases any held notes
 */
export function listenToNumberRow(target) {
  /**
   * The pitches each held key started (one for a note, several for a chord),
   * so its release stops the right notes even if the song's key or the octave
   * window changed meanwhile, and the source it holds them by.
   * @type {Map<string, { pitches: number[], source: string }>}
   */
  const held = new Map();

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      fieldOwnsKey(event.target, event.code)
    ) {
      return;
    }
    // The keypad's digits are the number row's (numpadAsDigit).
    const code = numpadAsDigit(event.code);
    if (code === "ArrowUp" || code === "ArrowDown") {
      event.preventDefault();
      if (!event.repeat) shiftWindow(code === "ArrowUp" ? 1 : -1);
      return;
    }
    if (ONE_SHOT_FLAT_FALLBACK && code === ONE_SHOT_FLAT_CODE) {
      event.preventDefault();
      if (!event.repeat) armed.set(!armed.get());
      return;
    }
    if (code === "Escape" && armed.get()) {
      // One Escape does one thing: record mode leaves an armed flat's Escape alone.
      event.preventDefault();
      armed.set(false);
      return;
    }
    // Shift+Backspace deletes the note: the staff's (see the header).
    if ((code === "Backspace" || code === "Delete") && !event.shiftKey) {
      if (clearSelectedChord()) event.preventDefault();
      return;
    }

    const action = CHORD_CODES.includes(code) ? currentChordRowAction() : "notes";
    if (action !== "notes") {
      // Shift and Alt change nothing on the chord row; claim the key either way.
      event.preventDefault();
      // A hidden key: the chord row waits for home (chordRowAction).
      if (action === "none") return;
      if (event.repeat || held.has(code)) return;
      const chord = chordRowPress(code, action);
      const pitches = chord.midi.filter(onPiano);
      held.set(code, { pitches, source: chordSource(code) });
      for (const midi of pitches) press(midi, chordSource(code));
      lastChord.set({ code, midi: pitches, fn: chord.fn });
      return;
    }

    const alt = event.altKey || armed.get();
    const degree = keyEventToDegree(code, { shift: event.shiftKey, alt });
    if (!degree) return;
    // Option on a Mac types a symbol and Alt on Windows reaches for the menu bar.
    event.preventDefault();
    if (event.repeat || held.has(code)) return;

    armed.set(false);
    const { key } = song.get();
    const midi = degreeToMidi(degree, key, clampWindow(key, ui.get().windowOctave));
    // Off the piano there is no key to light and no sample to play.
    if (!onPiano(midi)) return;
    held.set(code, { pitches: [midi], source: source(code) });
    press(midi, source(code));
  }

  /** @param {string} code */
  function releaseKey(code) {
    const hold = held.get(code);
    if (hold === undefined) return;
    held.delete(code);
    for (const midi of hold.pitches) release(midi, hold.source);
    if (lastChord.get()?.code === code) lastChord.set(null);
  }

  /** @param {KeyboardEvent} event */
  function onKeyUp(event) {
    releaseKey(numpadAsDigit(event.code));
  }

  // Key-ups never arrive after the window loses focus, so let go of everything.
  function releaseAll() {
    for (const code of [...held.keys()]) releaseKey(code);
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", releaseAll);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", releaseAll);
    releaseAll();
  };
}
