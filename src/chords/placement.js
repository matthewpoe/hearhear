// Where the dropdown sits vertically. It must stay inside the visible area
// between the top of the viewport and the sticky keyboard dock, and keep its
// anchor (the note or chip) in view: below the anchor if it fits, else above,
// else on the roomier side with its own scroll. All values are page pixels.

/**
 * @typedef {{
 *   anchorTop: number,
 *   anchorBottom: number,
 *   height: number,
 *   viewTop: number,
 *   viewBottom: number,
 *   gap: number,
 *   cap: number,
 * }} PlacementInput
 * `height` is the dropdown's natural height (its content, unclipped);
 * `viewTop` and `viewBottom` bound the visible area, gutters included; `gap`
 * separates the dropdown from its anchor; `cap` is its tallest allowed height.
 */

/** @typedef {"below" | "above"} Side */

/**
 * Pick the side: below if the dropdown fits there, else above if it fits
 * there, else whichever side has more room.
 * @param {PlacementInput} at
 * @returns {Side}
 */
export function sideFor(at) {
  const want = Math.min(at.height, at.cap);
  const below = at.viewBottom - (at.anchorBottom + at.gap);
  const above = at.anchorTop - at.gap - at.viewTop;
  if (want <= below) return "below";
  if (want <= above) return "above";
  return above > below ? "above" : "below";
}

/**
 * Top and max height on a given side, clamped to the visible area. Keeping
 * the side fixed after opening means growing content (the extended list, the
 * explainer) scrolls inside the dropdown instead of flipping it.
 * @param {PlacementInput} at
 * @param {Side} side
 * @returns {{ top: number, maxHeight: number }}
 */
export function placeOn(at, side) {
  const view = Math.max(0, at.viewBottom - at.viewTop);
  const belowTop = at.anchorBottom + at.gap;
  const room = side === "below" ? at.viewBottom - belowTop : at.anchorTop - at.gap - at.viewTop;
  // With no room on either side (an anchor taller than the view), use the
  // whole view. An anchor scrolled partly out of view can leave the side's
  // room misleading, so the clamp to the view has the last word.
  const maxHeight = Math.min(at.cap, room > 0 ? room : view, view);
  const height = Math.min(at.height, maxHeight);
  const top = side === "below" ? belowTop : at.anchorTop - at.gap - height;
  const clamped = Math.min(Math.max(top, at.viewTop), at.viewBottom - height);
  return { top: clamped, maxHeight: Math.min(maxHeight, at.viewBottom - clamped) };
}
