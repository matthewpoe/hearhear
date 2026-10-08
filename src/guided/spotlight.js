/**
 * The walkthrough's spotlight: a violet ring on the real control a step asks
 * the viewer to use, pulsing gently (static under prefers-reduced-motion).
 * Its styles live in GuidedPath.svelte, which is always on the page. An
 * element gets the
 * `data-spotlight` attribute; a note on the staff gets the SPOTLIGHT_NOTE
 * class as a staff mark, which the staff puts back after every redraw.
 */

import { mark } from "../staff/staffEvents.js";

export const SPOTLIGHT_ATTRIBUTE = "data-spotlight";
export const SPOTLIGHT_NOTE = "spotlight";

/**
 * Ring an element until the returned function is called.
 * @param {Element} el
 * @returns {() => void}
 */
export function spotlight(el) {
  el.setAttribute(SPOTLIGHT_ATTRIBUTE, "");
  return () => el.removeAttribute(SPOTLIGHT_ATTRIBUTE);
}

/**
 * Ring a note on the staff until the returned function is called. It's a
 * mark, so it outlasts redraws the lesson doesn't hear about (abcjs arriving
 * after the song, a web font loading) and lands on a note not drawn yet.
 * @param {string} noteId
 * @returns {() => void}
 */
export function spotlightNote(noteId) {
  mark(SPOTLIGHT_NOTE, [noteId]);
  return () => mark(SPOTLIGHT_NOTE, []);
}
