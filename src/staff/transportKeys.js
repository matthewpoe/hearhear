/**
 * Which transport action a key press means, if any: the pure routing behind
 * the app-wide Space and Left-arrow shortcuts (Transport.svelte listens).
 *
 * Space, anywhere: stopped → play from the top (whatever the Play button's
 * scope); playing → pause; paused → resume where it paused.
 * Left, while playing: back to the start of the bar under the playhead; a
 * second Left within DOUBLE_LEFT_MS goes to the top. While stopped, Left is
 * left alone (the staff's note navigation).
 *
 * The keys are left alone, so the focused element or the open menu gets
 * them, when:
 * - a modifier is held;
 * - a form field owns the key (fieldOwnsKey: text fields, selects, and a
 *   radio's arrows);
 * - the chord dropdown or the accidental menu is open;
 * - a tune is being recorded (record mode owns the keyboard);
 * - Space on a control (button, link, switch, radio, piano key) that has
 *   keyboard focus: keyboard users activate it with Space. After a mouse
 *   click the control keeps focus, and Space goes to the transport, so Space
 *   never feels dead after a click. "Keyboard focus" means the keyboard
 *   (Tab, arrows) moved focus there, as :focus-visible intends; the caller
 *   tracks it, because Chrome counts a radio focused by clicking its label
 *   as :focus-visible;
 * - Left on a staff note, whose arrows move between notes.
 */

/** Two Left presses this close together go to the top. */
export const DOUBLE_LEFT_MS = 400;

/** @typedef {"play-top" | "pause" | "resume" | "bar-start" | "top"} TransportAction */

/**
 * @param {{
 *   code: string,
 *   modified: boolean,
 *   fieldOwnsKey: boolean,
 *   focus: "none" | "control-keyboard" | "control-mouse" | "staff-note",
 *   menuOpen: boolean,
 *   recording: boolean,
 *   playing: boolean,
 *   paused: boolean,
 *   sinceLastLeftMs: number,
 * }} press
 * @returns {TransportAction | null}
 */
export function transportAction(press) {
  if (press.modified || press.fieldOwnsKey || press.menuOpen || press.recording) return null;
  if (press.code === "Space") {
    if (press.focus === "control-keyboard" || press.focus === "staff-note") return null;
    if (press.playing) return "pause";
    return press.paused ? "resume" : "play-top";
  }
  if (press.code === "ArrowLeft") {
    if (!press.playing || press.focus === "staff-note") return null;
    return press.sinceLastLeftMs <= DOUBLE_LEFT_MS ? "top" : "bar-start";
  }
  return null;
}

/** What counts as a control that Space activates. */
const CONTROLS =
  'button, a[href], summary, [role="button"], [role="switch"], [role="menuitemradio"], input[type="radio"], input[type="checkbox"]';

/**
 * Where focus is, for transportAction.
 * @param {Element | null} target the key event's target
 * @param {boolean} byKeyboard the keyboard moved focus there
 * @returns {"none" | "control-keyboard" | "control-mouse" | "staff-note"}
 */
export function focusKind(target, byKeyboard) {
  if (!target || typeof target.closest !== "function") return "none";
  if (target.closest("#staff [data-note-id]")) return "staff-note";
  const control = target.closest(CONTROLS);
  if (!control) return "none";
  return byKeyboard ? "control-keyboard" : "control-mouse";
}
