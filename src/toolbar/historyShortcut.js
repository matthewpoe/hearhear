/**
 * Cmd/Ctrl-Z undoes and Shift-Cmd/Ctrl-Z redoes, everywhere except while a
 * form field has focus (see fieldOwnsKey), where the field's own undo wins.
 */

import { fieldOwnsKey } from "../lib/fieldOwnsKey.js";

/**
 * The history action a key press asks for, if any.
 * @param {Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target">} event
 * @returns {"undo" | "redo" | null}
 */
export function historyShortcut(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key.toLowerCase() !== "z") return null;
  if (fieldOwnsKey(event.target, "KeyZ")) return null;
  return event.shiftKey ? "redo" : "undo";
}
