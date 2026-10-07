/**
 * The guided path's pure logic (Stream G): what each step's condition reads
 * from the song, which note a bar and beat names, when a step advances on its
 * own, and the progress a viewer leaves and resumes. No DOM or store imports;
 * the component passes in the app state it read.
 *
 * @import { Song, Note } from "../types.js"
 */

import { numeralOf, positionOf } from "../theory/index.js";

/**
 * When a step is done (content/guided-path.json).
 * @typedef {{ type: "songLoaded", song: string }
 *   | { type: "keyChosen", tonic: string, mode: "major" | "minor" }
 *   | { type: "keyCommitted" }
 *   | { type: "chordAt", bar: number, beat: number, numeral: string }
 *   | { type: "tutorReplied" }} Condition
 *
 * A step's "Try this" button. `label` is the button's text.
 * @typedef {({ type: "loadSong", song: string }
 *   | { type: "press", within: string, name: string }
 *   | { type: "openChords", bar: number, beat: number }
 *   | { type: "audition", bar: number, beat: number, numeral: string }
 *   | { type: "askTutor", lesson: string }) & { label: string }} Action
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   text: string,
 *   done: Condition,
 *   hint?: { when: Condition, text: string },
 *   action?: Action,
 * }} Step
 *
 * @typedef {{ status: string, song: string, steps: Step[] }} GuidedPath
 *
 * What the conditions read: the song on the staff, and how many replies the
 * tutor has given in its conversation.
 * @typedef {{ song: Song, tutorReplies: number }} AppState
 */

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
export function conditionMet(condition, { song, tutorReplies }) {
  switch (condition.type) {
    case "songLoaded":
      return song.id === condition.song && song.notes.length > 0;
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
    case "tutorReplied":
      return tutorReplies > 0;
    default:
      return false;
  }
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
 * A step advances on its own when its condition becomes true while it's
 * showing. One already true when the viewer arrives shows as done and waits
 * for Next, so stepping Back never bounces forward again.
 * @param {boolean} wasMet
 * @param {boolean} isMet
 */
export function shouldAdvance(wasMet, isMet) {
  return !wasMet && isMet;
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
    for (const part of [step.done, step.hint?.when, step.action]) {
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

/**
 * The exchange a lesson names in content/lessons/plan.json: its question and
 * hint level.
 * @param {{ exchanges: { id: string, question: string, hint_level: string }[] }} plan
 * @param {string} lesson
 * @returns {{ question: string, level: "nudge" | "comparison" | "answer" } | null}
 */
export function lessonExchange(plan, lesson) {
  const exchange = plan.exchanges.find((e) => e.id === lesson);
  if (!exchange) return null;
  const level = ["nudge", "comparison", "answer"].includes(exchange.hint_level)
    ? /** @type {"nudge" | "comparison" | "answer"} */ (exchange.hint_level)
    : "nudge";
  return { question: exchange.question, level };
}

/** @typedef {{ top: number, left: number, bottom: number, right: number }} Rect */

const GAP = 12;

/**
 * Where the docked panel sits, in viewport pixels: above the keyboard dock at
 * the right edge of the workspace, unless that covers a control in `avoid`
 * (the tutor's question box and replies, the open chord dropdown, the key
 * question's buttons); then lifted just above `lift` (the tutor's question
 * box), then above the dock at the left edge. The first spot that covers
 * nothing wins; if every spot covers something, the one that covers least.
 * @param {{ width: number, height: number }} size
 * @param {{ left: number, right: number, bottom: number }} area the workspace's
 *   edges and the top of the dock
 * @param {Rect[]} avoid
 * @param {Rect | null} [lift]
 * @returns {{ top: number, left: number }}
 */
export function placePanel(size, area, avoid, lift = null) {
  const top = area.bottom - GAP - size.height;
  const right = { top, left: area.right - size.width };
  const spots = [right];
  if (lift) spots.push({ top: lift.top - GAP - size.height, left: right.left });
  spots.push({ top, left: area.left });
  const visible = spots.filter((spot) => spot.top >= GAP);
  /** @param {{ top: number, left: number }} spot */
  const covered = (spot) => {
    const box = {
      top: spot.top,
      left: spot.left,
      bottom: spot.top + size.height,
      right: spot.left + size.width,
    };
    return avoid.reduce((sum, rect) => sum + overlap(box, rect), 0);
  };
  const candidates = visible.length ? visible : [right];
  return candidates.reduce((best, spot) => (covered(spot) < covered(best) ? spot : best));
}

/**
 * @param {Rect} a
 * @param {Rect} b
 */
function overlap(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}
