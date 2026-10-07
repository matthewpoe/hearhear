// Tap to hear, tap again to choose. A finger has no hover, and a tap fires
// focus and click together, so on touch the first tap on an option previews
// it and only a second tap on the same option chooses it. Mouse clicks and
// keyboard activation choose at once, as before.

/** @typedef {{ previewed: string | null }} TapState */

/** @type {TapState} */
export const NO_TAP = Object.freeze({ previewed: null });

/**
 * What activated an option. Enter and Space synthesize a click with
 * `detail` 0 and no press, so they read as keyboard ("") whatever pointer
 * came last. Otherwise the click's own `pointerType` wins where the browser
 * sets one, else the type seen at the option's last pointerdown.
 * @param {{ detail: number, pointerType?: string }} click
 * @param {string} lastPointerType from the option's last pointerdown, "" if none
 * @returns {string} "touch", "mouse", "pen", or "" for keyboard and assistive tech
 */
export function pointerTypeOf(click, lastPointerType) {
  if (click.detail === 0) return "";
  return click.pointerType || lastPointerType;
}

/**
 * Activate an option.
 * @param {TapState} state
 * @param {string} key the option's key
 * @param {string} pointerType from `pointerTypeOf`
 * @returns {{ state: TapState, choose: boolean }} `choose` false means preview
 *   the option and wait for a second tap
 */
export function activate(state, key, pointerType) {
  if (pointerType !== "touch" || state.previewed === key) return { state: NO_TAP, choose: true };
  return { state: { previewed: key }, choose: false };
}
