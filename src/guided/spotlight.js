/**
 * The walkthrough's spotlight: a violet ring on the real control a step asks
 * the viewer to use, pulsing gently (static under prefers-reduced-motion).
 * Its styles live in GuidedPath.svelte, which is always on the page. An
 * element gets the
 * `data-spotlight` attribute; a note on the staff gets the SPOTLIGHT_NOTE
 * class through the staff's own highlight(), since its SVG is redrawn.
 */

import { clearHighlight, highlight } from "../staff/staffEvents.js";

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
 * Ring a note on the staff until the returned function is called. Call it
 * again after the staff redraws, which drops the class.
 * @param {string} noteId
 * @returns {() => void}
 */
export function spotlightNote(noteId) {
  clearHighlight(SPOTLIGHT_NOTE);
  highlight([noteId], SPOTLIGHT_NOTE);
  return () => clearHighlight(SPOTLIGHT_NOTE);
}
