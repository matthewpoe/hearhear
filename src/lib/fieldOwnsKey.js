/**
 * Whether a focused form field keeps a key press for itself, so the app's
 * own shortcuts (the number row, undo and redo) leave it alone. Text fields,
 * selects, sliders, and editable content own every key: typing to the tutor
 * never plays notes, Cmd-Z there is the field's own undo, and arrows in a
 * select never move the octave window. A radio or checkbox (Bright/Dark, the
 * label styles) owns only its arrows, so its arrow navigation works and every
 * other key still reaches the app.
 */

const TOGGLE_TYPES = new Set(["radio", "checkbox"]);
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * @param {EventTarget | null} target the key event's target
 * @param {string} code the key's KeyboardEvent.code
 * @returns {boolean}
 */
export function fieldOwnsKey(target, code) {
  if (!target || typeof target !== "object") return false;
  const el = /** @type {Element & { isContentEditable?: boolean }} */ (target);
  if (el.isContentEditable) return true;
  if (typeof el.closest !== "function") return false;
  const field = el.closest("input, textarea, select");
  if (field === null) return false;
  if (field.tagName === "INPUT" && TOGGLE_TYPES.has(/** @type {HTMLInputElement} */ (field).type))
    return ARROWS.has(code);
  return true;
}
