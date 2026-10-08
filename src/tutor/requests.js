/**
 * Questions another part of the app asks the tutor on the viewer's behalf:
 * the guided path's tutor step. The tutor panel listens and sends each one as
 * if it had been typed, so it shows in the conversation like any other.
 *
 * @import { Mode } from "./client.js"
 */

import { createReadable } from "../lib/readable.js";

/**
 * `fixture` names a recorded lesson for the server to replay ("lesson:<id>"),
 * or is empty to ask the tutor as anyone would.
 * @typedef {{ question: string | null, mode: Mode, fixture: string }} AskRequest
 */

/** @type {Set<(request: AskRequest) => void>} */
const listeners = new Set();

/**
 * @param {(request: AskRequest) => void} listener
 * @returns {() => void} stops listening
 */
export function onAskRequest(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A recorded lesson: its X-Tutor-Fixture value ("lesson:<id>") and the mode
 * it was recorded for (content/lessons/plan.json).
 * @typedef {{ fixture: string, mode: Mode }} StepLesson
 */

/**
 * The recorded lesson the guided path's current step names, or null when it
 * names none or the walkthrough isn't running. A request of the lesson's
 * mode sent meanwhile replays it: the step answers anyone, at no cost, so
 * the panel doesn't ask for the passphrase up front then.
 */
export const stepLesson = createReadable(/** @type {StepLesson | null} */ (null));

/**
 * The fixture a request of `mode` carries while `lesson` is the step's: the
 * lesson's, only when it was recorded for that mode (a question's recorded
 * answer never comes back as a review, nor a review as an answer), else ""
 * so the request goes to the tutor as anyone's would.
 * @param {StepLesson | null} lesson
 * @param {Mode} mode
 */
export function lessonFixture(lesson, mode) {
  return lesson && lesson.mode === mode ? lesson.fixture : "";
}

/**
 * Ask the tutor panel to send a question. False when no panel is listening.
 * @param {AskRequest} request
 */
export function requestAsk(request) {
  for (const listener of listeners) listener(request);
  return listeners.size > 0;
}
