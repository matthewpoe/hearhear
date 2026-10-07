/**
 * The user-facing names of the controls the tutor may point to, from
 * content/controls.json. The server fills the same names into the tutor's
 * system prompt, so a rename here is a rename there.
 */

import controls from "../../content/controls.json" with { type: "json" };

export const CONTROLS = controls.controls;

/**
 * A name with its bar filled in: "Play bar N" and "bar 4" → "Play bar 4",
 * or "the pickup" → "Play the pickup".
 * @param {string} name
 * @param {string} bar as bars.js barName says it
 */
export function withBar(name, bar) {
  return name.replace("bar N", bar);
}
