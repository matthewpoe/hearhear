/**
 * Noodle mode: the computer keyboard is the instrument. The number row plays
 * scale degrees in the current key (Q–U one octave below, A–J two below),
 * Shift raises, Alt/Option lowers, and the up and down arrows move the whole
 * window an octave, as far as keeps every key on the C2–C6 piano (see
 * windowBounds). Keys are read by physical position (KeyboardEvent.code),
 * since Shift+3 arrives as "#" and Option+3 on a Mac as "£".
 *
 * Another handler that consumes a key (the chord dropdown auditioning by
 * degree, say) calls preventDefault, and the number row leaves it alone.
 */

import { createReadable } from "../lib/readable.js";
import { song } from "../store/song.js";
import { ui } from "../store/ui.js";
import { degreeToMidi, keyEventToDegree } from "../theory/index.js";
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
 * Form fields own their keystrokes: typing to the tutor never plays notes,
 * and arrows in a select or slider never move the octave window.
 * @param {EventTarget | null} target
 */
function isFormField(target) {
  return (
    typeof HTMLElement !== "undefined" &&
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  );
}

/** @param {number} delta */
function shiftWindow(delta) {
  const { key } = song.get();
  const current = clampWindow(key, ui.get().windowOctave);
  const next = clampWindow(key, current + delta);
  if (next !== current) ui.update({ windowOctave: next });
}

/** The hold a number-row key keeps in liveNotes. @param {string} code */
const source = (code) => `key:${code}`;

/**
 * Listen for the number row on a target (the window, in the app).
 * @param {Window} target
 * @returns {() => void} stops listening and releases any held notes
 */
export function listenToNumberRow(target) {
  /**
   * The pitch each held key started, so its release stops the right note even
   * if the song's key or the octave window changed meanwhile.
   * @type {Map<string, number>}
   */
  const held = new Map();

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || isFormField(event.target)) {
      return;
    }
    if (event.code === "ArrowUp" || event.code === "ArrowDown") {
      event.preventDefault();
      if (!event.repeat) shiftWindow(event.code === "ArrowUp" ? 1 : -1);
      return;
    }
    if (ONE_SHOT_FLAT_FALLBACK && event.code === ONE_SHOT_FLAT_CODE) {
      event.preventDefault();
      if (!event.repeat) armed.set(!armed.get());
      return;
    }
    if (event.code === "Escape" && armed.get()) {
      armed.set(false);
      return;
    }

    const alt = event.altKey || armed.get();
    const degree = keyEventToDegree(event.code, { shift: event.shiftKey, alt });
    if (!degree) return;
    // Option on a Mac types a symbol and Alt on Windows reaches for the menu bar.
    event.preventDefault();
    if (event.repeat || held.has(event.code)) return;

    armed.set(false);
    const { key } = song.get();
    const midi = degreeToMidi(degree, key, clampWindow(key, ui.get().windowOctave));
    // Off the piano there is no key to light and no sample to play.
    if (!onPiano(midi)) return;
    held.set(event.code, midi);
    press(midi, source(event.code));
  }

  /** @param {KeyboardEvent} event */
  function onKeyUp(event) {
    const midi = held.get(event.code);
    if (midi === undefined) return;
    held.delete(event.code);
    release(midi, source(event.code));
  }

  // Key-ups never arrive after the window loses focus, so let go of everything.
  function releaseAll() {
    for (const [code, midi] of held) release(midi, source(code));
    held.clear();
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
