/**
 * The beginner tour's pure logic: which callout shows next, and where it sits
 * beside its anchor. No DOM access; the component passes in what it measured.
 */

/**
 * One beginner callout from content/callouts.json.
 * @typedef {{
 *   id: string,
 *   anchor: string,
 *   title?: string,
 *   text: string,
 *   needsKeyLabels?: boolean,
 * }} Callout
 */

/**
 * The first callout, in content order, that hasn't been dismissed, whose
 * anchor is on the page, and that doesn't explain key labels while a demo
 * hides them.
 * @param {Callout[]} callouts
 * @param {{
 *   dismissed: ReadonlySet<string>,
 *   hasAnchor: (id: string) => boolean,
 *   labelsHidden: boolean,
 * }} context
 * @returns {Callout | null}
 */
export function nextCallout(callouts, { dismissed, hasAnchor, labelsHidden }) {
  return (
    callouts.find(
      (callout) =>
        !dismissed.has(callout.id) &&
        !(labelsHidden && callout.needsKeyLabels) &&
        hasAnchor(callout.anchor),
    ) ?? null
  );
}

/**
 * The dismissed set with one more id.
 * @param {ReadonlySet<string>} dismissed
 * @param {string} id
 * @returns {Set<string>}
 */
export function dismiss(dismissed, id) {
  return new Set([...dismissed, id]);
}

/** @typedef {{ top: number, left: number, bottom: number, right: number }} Rect */

/**
 * Where to put a callout of `size` next to an anchor, in viewport pixels:
 * below the anchor if it fits, else above it, else just inside its top edge
 * (for anchors taller than the screen). Always kept inside the viewport, so a
 * callout whose anchor is scrolled away waits at the nearest edge.
 * @param {Rect} anchor
 * @param {{ width: number, height: number }} size
 * @param {{ width: number, height: number }} viewport
 * @param {number} [gap] space between anchor and callout
 * @param {number} [margin] space kept from the viewport edge
 * @returns {{ top: number, left: number }}
 */
export function placeCallout(anchor, size, viewport, gap = 12, margin = 8) {
  let top;
  if (anchor.bottom + gap + size.height <= viewport.height - margin) top = anchor.bottom + gap;
  else if (anchor.top - gap - size.height >= margin) top = anchor.top - gap - size.height;
  else top = anchor.top + gap;
  return {
    top: clamp(top, margin, viewport.height - size.height - margin),
    left: clamp(anchor.left, margin, viewport.width - size.width - margin),
  };
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * `min` wins when the callout is bigger than the room, so its start shows.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(max, min));
}
