/**
 * The guided walkthrough's pure logic: what each step's condition reads from
 * the app (a step advances once its condition holds), which steps are skipped
 * here, which note a bar and beat names, and the progress a viewer leaves and
 * resumes. No DOM or store imports; the component passes in the app state it
 * read.
 *
 * @import { Song, Note } from "../types.js"
 */

import { numeralOf, positionOf } from "../theory/index.js";

/**
 * When a step is done (content/guided-path.json): what its action produces.
 * @typedef {{ type: "songLoaded", song: string }
 *   | { type: "keyChosen", tonic: string, mode: "major" | "minor" }
 *   | { type: "keyCommitted" }
 *   | { type: "chordAt", bar: number, beat: number, numeral: string }
 *   | { type: "played" }
 *   | { type: "tutorReplied" }
 *   | { type: "fact", fact: string }} Condition
 *
 * A `fact` is one of FACTS, read from the stores, or a name in the content's
 * `pageFacts` (a selector; true while something on the page matches it).
 *
 * The real control a step asks the viewer to use, which the tour spotlights:
 * a demo tune's card on the welcome (else the song select), a button by its
 * accessible name inside an element id, any element, or a note on the staff.
 * @typedef {{ type: "song", song: string }
 *   | { type: "button", within: string, name: string }
 *   | { type: "element", selector: string }
 *   | { type: "note", bar: number, beat: number }} Target
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   line: string,
 *   done: Condition,
 *   hint?: { when: Condition, text: string },
 *   target: Target,
 *   when?: Record<string, boolean>,
 *   needsHardwareKeyboard?: boolean,
 * }} Step
 *
 * `when`: facts that must hold for the step to apply (the A–J step needs the
 * row to play chords); `needsHardwareKeyboard`: its action is a physical key,
 * so a touch screen skips it.
 *
 * @typedef {{ status: string, song: string, steps: Step[] }} GuidedPath
 *
 * What the conditions read: the song on the staff, whether it has been
 * played since it was loaded, how many replies the tutor has given in its
 * conversation, and whether a tune was loaded since this run of the tour
 * started (so a fresh tour never skips its load step), and the facts.
 * @typedef {{
 *   song: Song,
 *   played: boolean,
 *   tutorReplies: number,
 *   loadedThisTour: boolean,
 *   facts?: Record<string, boolean>,
 * }} AppState
 */

/**
 * The facts the component reads from the stores, as opposed to the page:
 * a single note held (number row or piano), a chord held on the A–J row,
 * whether that row plays chords, and whether the recorder is armed or
 * recording.
 */
export const FACTS = /** @type {const} */ ([
  "notePlaying",
  "chordKeyHeld",
  "chordRow",
  "recordStarted",
]);

/**
 * Facts that hold only while a key is down. A step waiting for one needs a
 * fresh press: a key still held from the step before (a chord-row letter that
 * placed a chord) doesn't count.
 */
export const MOMENTARY = /** @type {readonly string[]} */ (["notePlaying", "chordKeyHeld"]);

/**
 * The note that starts at a bar and beat, if any.
 * @param {Song} song
 * @param {number} bar
 * @param {number} beat
 * @returns {Note | null}
 */
export function noteAt(song, bar, beat) {
  return (
    song.notes.find((note) => {
      const at = positionOf(note.start, song.meter);
      return at.bar === bar && at.beat === beat;
    }) ?? null
  );
}

/**
 * The numeral of the chord on a bar and beat's note, in the song's key, or
 * null when there's no chord there.
 * @param {Song} song
 * @param {number} bar
 * @param {number} beat
 */
export function numeralAt(song, bar, beat) {
  const note = noteAt(song, bar, beat);
  const chord = note && song.chords.find((c) => c.noteId === note.id);
  return chord ? numeralOf(chord, song.key) : null;
}

/**
 * @param {Condition} condition
 * @param {AppState} state
 * @returns {boolean}
 */
export function conditionMet(condition, { song, played, tutorReplies, loadedThisTour, facts }) {
  switch (condition.type) {
    case "songLoaded":
      return loadedThisTour && song.id === condition.song && song.notes.length > 0;
    case "keyChosen":
      return (
        !song.key.provisional &&
        song.key.tonic === condition.tonic &&
        song.key.mode === condition.mode
      );
    case "keyCommitted":
      return song.notes.length > 0 && !song.key.provisional;
    case "chordAt":
      return numeralAt(song, condition.bar, condition.beat) === condition.numeral;
    case "played":
      return played && song.notes.length > 0;
    case "tutorReplied":
      return tutorReplies > 0;
    case "fact":
      return facts?.[condition.fact] === true;
    default:
      return false;
  }
}

/**
 * Whether a step doesn't apply here, so the walkthrough passes over it: its
 * action needs a physical key on a touch screen, or a fact it needs doesn't
 * hold.
 * @param {Step} step
 * @param {{ touch: boolean, facts: Record<string, boolean> }} here
 */
export function skipped(step, { touch, facts }) {
  if (touch && step.needsHardwareKeyboard) return true;
  return Object.entries(step.when ?? {}).some(([fact, wanted]) => facts[fact] !== wanted);
}

/**
 * The hint to show on a step: only while its `when` holds and the step isn't done.
 * @param {Step} step
 * @param {AppState} state
 * @returns {string | null}
 */
export function hintFor(step, state) {
  if (!step.hint || conditionMet(step.done, state)) return null;
  return conditionMet(step.hint.when, state) ? step.hint.text : null;
}

/**
 * Where a step's target is, for the strip to spotlight and scroll to: a
 * selector, with a button's accessible name inside it, a demo tune's id (its
 * card or the song select, which the component resolves), or a note's id.
 * Null when the target is a note the song lacks.
 * @param {Step} step
 * @param {Song} song
 * @returns {{ selector?: string, button?: string, songId?: string, noteId?: string } | null}
 */
export function stepTarget(step, song) {
  const target = step.target;
  switch (target.type) {
    case "song":
      return { songId: target.song };
    case "button":
      return { selector: `#${target.within}`, button: target.name };
    case "element":
      return { selector: target.selector };
    case "note": {
      const note = noteAt(song, target.bar, target.beat);
      return note ? { noteId: note.id } : null;
    }
    default:
      return null;
  }
}

/**
 * A step index kept inside the path.
 * @param {number} index
 * @param {number} count
 */
export function clampStep(index, count) {
  if (!Number.isInteger(index) || count === 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

/**
 * Every bar and beat a step names that has no note in the song, as messages.
 * Empty when the path matches the song.
 * @param {GuidedPath} path
 * @param {Song} song
 * @returns {string[]}
 */
export function checkPath(path, song) {
  /** @type {string[]} */
  const problems = [];
  for (const step of path.steps) {
    for (const part of [step.done, step.hint?.when, step.target]) {
      if (part && "bar" in part && !noteAt(song, part.bar, part.beat)) {
        problems.push(`${step.id}: no note at bar ${part.bar} beat ${part.beat} in ${song.id}`);
      }
    }
  }
  return problems;
}

const PROGRESS_KEY = "hearhear.guided.step";

/** @typedef {Pick<Storage, "getItem" | "setItem">} KeyValueStore */

/**
 * The step a viewer left the path on: a per-viewer convenience, so blocked
 * or broken storage just starts from the first step.
 * @param {number} count
 * @param {KeyValueStore} [storage]
 */
export function loadProgress(count, storage) {
  try {
    const raw = (storage ?? localStorage).getItem(PROGRESS_KEY);
    return raw === null ? 0 : clampStep(Number(raw), count);
  } catch {
    return 0;
  }
}

/**
 * @param {number} index
 * @param {KeyValueStore} [storage]
 */
export function saveProgress(index, storage) {
  try {
    (storage ?? localStorage).setItem(PROGRESS_KEY, String(index));
  } catch {
    // Storage blocked or full: the path still runs, it just forgets on reload.
  }
}
