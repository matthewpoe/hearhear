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
 *   | { type: "chordAt", bar: number, beat: number, numeral: string }
 *   | { type: "played" }
 *   | { type: "degrees", degrees: number[] }
 *   | { type: "fact", fact: string }} Condition
 *
 * `degrees`: the last notes played (number row or piano) were these scale
 * degrees, in order, counted from home.
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
 *   | { type: "note", bar: number, beat: number }
 *   | { type: "keys", codes: string[] }} Target
 *
 * `keys`: the piano keys the number row plays for those computer keys
 * (KeyboardEvent codes, like "Digit3").
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   line: string,
 *   done: Condition,
 *   hint?: { when: Condition, text: string },
 *   target: Target,
 *   sendOff?: boolean,
 *   lesson?: string,
 * }} Step
 *
 * `sendOff`: the closing line, not a step to complete. Finish ends the
 * walkthrough there, and doing its action ends it too.
 *
 * `lesson`: a recorded lesson id. A question asked during the step replays it
 * (src/tutor/requests.js) rather than calling the live tutor.
 *
 * @typedef {{ status: string, song: string, steps: Step[] }} GuidedPath
 *
 * What the conditions read: the song on the staff, whether it has been
 * played since it was loaded, whether a tune was loaded since this run of the tour
 * started (so a fresh tour never skips its load step), the scale degrees of
 * the last notes played, and the facts.
 * @typedef {{
 *   song: Song,
 *   played: boolean,
 *   loadedThisTour: boolean,
 *   recentDegrees?: number[],
 *   facts?: Record<string, boolean>,
 * }} AppState
 */

/**
 * The facts the component reads from the stores, as opposed to the page:
 * any home is chosen (the key isn't provisional), the tour's tune now sounds
 * in another key or octave, and the recorder is armed or recording.
 */
export const FACTS = /** @type {const} */ (["keyCommitted", "transposed", "recordStarted"]);

/** How many recent degrees the component keeps, for `degrees` conditions. */
export const RECENT_DEGREES = 8;

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
export function conditionMet(
  condition,
  { song, played, loadedThisTour, recentDegrees = [], facts },
) {
  switch (condition.type) {
    case "songLoaded":
      return loadedThisTour && song.id === condition.song && song.notes.length > 0;
    case "keyChosen":
      return (
        !song.key.provisional &&
        song.key.tonic === condition.tonic &&
        song.key.mode === condition.mode
      );
    case "chordAt":
      return numeralAt(song, condition.bar, condition.beat) === condition.numeral;
    case "played":
      return played && song.notes.length > 0;
    case "degrees":
      return endsWith(recentDegrees, condition.degrees);
    case "fact":
      return facts?.[condition.fact] === true;
    default:
      return false;
  }
}

/**
 * Whether `list` ends with `tail`, item for item.
 * @param {readonly number[]} list
 * @param {readonly number[]} tail
 */
function endsWith(list, tail) {
  if (tail.length === 0 || list.length < tail.length) return false;
  const start = list.length - tail.length;
  return tail.every((item, i) => list[start + i] === item);
}

/**
 * The degrees list after one more note: its scale degree (1–7, or 0 for a
 * note off the scale), keeping the last RECENT_DEGREES.
 * @param {readonly number[]} list
 * @param {{ degree: number, accidental: number }} played
 */
export function pushDegree(list, played) {
  return [...list, played.accidental === 0 ? played.degree : 0].slice(-RECENT_DEGREES);
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
 * @returns {{ selector?: string, button?: string, songId?: string, noteId?: string, codes?: string[] } | null}
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
    case "keys":
      return { codes: target.codes };
    default:
      return null;
  }
}

/**
 * The note the running lesson points at on the staff, so onboarding's chord
 * step suggests that note rather than one of its own and the page points at
 * one place. Undefined when the lesson isn't running (the chord step picks
 * its own); null when it is but its current step targets no note on this
 * tune (another tune is open, or the step rings a control), so the chord
 * step suggests nothing.
 * @param {GuidedPath} path
 * @param {{ running: boolean, index: number }} tour
 * @param {Song} song
 * @returns {Note | null | undefined}
 */
export function lessonNote(path, tour, song) {
  if (!tour.running) return undefined;
  const step = path.steps[tour.index];
  if (!step || song.id !== path.song) return null;
  const noteId = stepTarget(step, song)?.noteId;
  return song.notes.find((n) => n.id === noteId) ?? null;
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
