/**
 * Questions another part of the app asks the tutor on the viewer's behalf:
 * the guided path's tutor step. The tutor panel listens and sends each one as
 * if it had been typed, so it shows in the conversation like any other.
 *
 * @import { HintLevel } from "./client.js"
 */

/**
 * `fixture` names a recorded lesson for the server to replay ("lesson:<id>"),
 * or is empty to ask the tutor as anyone would.
 * @typedef {{ question: string, level: HintLevel, fixture: string }} AskRequest
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

/** The recorded lesson the guided path's current step asks with, or "". */
let stepLesson = "";

/**
 * The guided path's current step names a recorded lesson ("lesson:<id>"), or
 * "" when it doesn't or the walkthrough isn't running. A question the viewer
 * asks meanwhile replays it: the step answers anyone, at no cost.
 * @param {string} fixture
 */
export function setStepLesson(fixture) {
  stepLesson = fixture;
}

/** The lesson a question asked now replays, or "" to ask the tutor. */
export function stepLessonFixture() {
  return stepLesson;
}

/**
 * Ask the tutor panel to send a question. False when no panel is listening.
 * @param {AskRequest} request
 */
export function requestAsk(request) {
  for (const listener of listeners) listener(request);
  return listeners.size > 0;
}
