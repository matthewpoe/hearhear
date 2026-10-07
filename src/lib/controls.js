/**
 * The user-facing names of the controls the tutor may point to, from
 * content/controls.json. The server fills the same names into the tutor's
 * system prompt, so a rename here is a rename there.
 */

import controls from "../../content/controls.json" with { type: "json" };

export const CONTROLS = controls.controls;
