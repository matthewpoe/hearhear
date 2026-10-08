/**
 * Questions another part of the app asks the tutor on the viewer's behalf:
 * the guided path's tutor step. The tutor panel listens and sends each one as
 * if it had been typed, so it shows in the conversation like any other.
 *
 * @import { Mode } from "./client.js"
 */

import { writable } from "svelte/store";

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
 * The recorded lesson the guided path's current step names ("lesson:<id>"),
 * or "" when it names none or the walkthrough isn't running. A question the
 * viewer asks meanwhile replays it: the step answers anyone, at no cost, so
 * the panel doesn't ask for the passphrase up front then.
 */
export const stepLesson = writable("");

/**
 * Ask the tutor panel to send a question. False when no panel is listening.
 * @param {AskRequest} request
 */
export function requestAsk(request) {
  for (const listener of listeners) listener(request);
  return listeners.size > 0;
}
