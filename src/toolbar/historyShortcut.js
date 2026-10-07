/**
 * Cmd/Ctrl-Z undoes and Shift-Cmd/Ctrl-Z redoes, everywhere except while the
 * user is typing, where the text field's own undo wins.
 */

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

/**
 * Whether an element takes typed text.
 * @param {EventTarget | null} target
 */
export function isTextField(target) {
  if (!target || typeof target !== "object") return false;
  const el = /** @type {HTMLElement} */ (target);
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT")
    return TEXT_INPUT_TYPES.has(/** @type {HTMLInputElement} */ (el).type);
  return false;
}

/**
 * The history action a key press asks for, if any.
 * @param {Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target">} event
 * @returns {"undo" | "redo" | null}
 */
export function historyShortcut(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key.toLowerCase() !== "z") return null;
  if (isTextField(event.target)) return null;
  return event.shiftKey ? "redo" : "undo";
}
