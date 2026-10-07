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
/** @typedef {{ top: number, left: number }} Position */

const GAP = 12;
const MARGIN = 8;

/**
 * Where to put a callout of `size` next to an anchor, in viewport pixels.
 *
 * The first choice is below the anchor if it fits, else above it. If neither
 * fits, an anchor that fits on screen gets the tip on its roomier side,
 * trimmed to the screen; an anchor taller than the screen gets it at the
 * bottom of the visible area, so its heading and first controls stay
 * readable. The visible area ends at `viewport.bottom` (the top of the
 * keyboard dock) when given. Always kept inside that area, so a callout whose
 * anchor is scrolled away waits at the nearest edge.
 *
 * A tip must never cover the controls someone is about to use (`avoid`: the
 * key question's choices, Play, the masthead toggles). If the first choice
 * would, it tries beside the anchor (right, then left, where there's room),
 * then above and below (at the anchor's left edge, then its right), then over the anchor itself or in a gap between
 * the controls, and takes the
 * first spot that covers none; if every spot covers some, the one that
 * covers least. An anchor inside the keyboard dock (`inDock`) puts its tip
 * just above the dock, on the right (over the tutor column) first, then at
 * the anchor's left, before any of the above.
 * @param {Rect} anchor
 * @param {{ width: number, height: number }} size
 * @param {{ width: number, height: number, bottom?: number }} viewport
 * @param {{ avoid?: Rect[], inDock?: boolean }} [options]
 * @returns {Position}
 */
export function placeCallout(anchor, size, viewport, { avoid = [], inDock = false } = {}) {
  const floor = Math.min(viewport.bottom ?? viewport.height, viewport.height) - MARGIN;
  const fit = (/** @type {number} */ top, /** @type {number} */ left) => ({
    top: clamp(top, MARGIN, floor - size.height),
    left: clamp(left, MARGIN, viewport.width - size.width - MARGIN),
  });
  const right = anchor.right + GAP;
  const left = anchor.left - GAP - size.width;
  const candidates = [
    ...(inDock
      ? [fit(floor - size.height, viewport.width), fit(floor - size.height, anchor.left)]
      : []),
    fit(firstChoiceTop(anchor, size, floor), anchor.left),
    // Beside the anchor only when it really fits beside it.
    ...(right + size.width <= viewport.width - MARGIN ? [fit(anchor.top, right)] : []),
    ...(left >= MARGIN ? [fit(anchor.top, left)] : []),
    fit(anchor.top - GAP - size.height, anchor.left),
    fit(anchor.bottom + GAP, anchor.left),
    // A wide anchor (the staff): below or above it at its right edge, over the
    // tutor column rather than the key question's controls on the left.
    fit(anchor.bottom + GAP, anchor.right - size.width),
    fit(anchor.top - GAP - size.height, anchor.right - size.width),
    // Last resorts: over the anchor's own top (its controls are in `avoid`),
    // or in a gap between the controls.
    fit(anchor.top, anchor.left),
    ...avoid.flatMap((rect) => [
      fit(rect.bottom + MARGIN, anchor.left),
      fit(rect.top - MARGIN - size.height, anchor.left),
    ]),
  ];
  const covered = (/** @type {Position} */ at) => coverage(at, size, avoid);
  return candidates.reduce((best, at) => (covered(at) < covered(best) ? at : best));
}

/**
 * How far to scroll the page (positive is down) to show the next tip's anchor.
 * Like scrollIntoView's `block: "nearest"`: no scroll if the anchor is already
 * in the visible area, else the least scroll that brings it in (its top, if
 * it's taller than the area). If the tip would then still have to cover a
 * control, it scrolls the anchor to the top instead, which leaves room below
 * it. `room` is how far the page can scroll each way (`up` is zero or
 * negative), since a scroll past the page's ends doesn't happen.
 * @param {Rect} anchor
 * @param {{ width: number, height: number }} size
 * @param {{ width: number, height: number, bottom?: number }} viewport
 * @param {{ avoid?: Rect[], room: { up: number, down: number } }} options
 * @returns {number}
 */
export function scrollForTip(anchor, size, viewport, { avoid = [], room }) {
  const floor = Math.min(viewport.bottom ?? viewport.height, viewport.height) - MARGIN;
  let nearest = 0;
  if (anchor.bottom - anchor.top > floor - MARGIN || anchor.top < MARGIN) {
    nearest = anchor.top - MARGIN;
  } else if (anchor.bottom > floor) nearest = anchor.bottom - floor;
  const choices = [nearest, anchor.top - MARGIN].map((d) => clamp(d, room.up, room.down));
  const coveredAfter = (/** @type {number} */ d) => {
    const shift = (/** @type {Rect} */ r) => ({ ...r, top: r.top - d, bottom: r.bottom - d });
    const moved = avoid.map(shift);
    const at = placeCallout(shift(anchor), size, viewport, { avoid: moved });
    return coverage(at, size, moved);
  };
  return choices.find((d) => coveredAfter(d) === 0) ?? choices[0];
}

/**
 * The area of `avoid` a tip at `at` would cover.
 * @param {Position} at
 * @param {{ width: number, height: number }} size
 * @param {Rect[]} avoid
 */
export function coverage(at, size, avoid) {
  const tip = { ...at, bottom: at.top + size.height, right: at.left + size.width };
  return avoid.reduce((sum, rect) => sum + overlap(tip, rect), 0);
}

/**
 * The tip's top before any controls are considered (see placeCallout).
 * @param {Rect} anchor
 * @param {{ height: number }} size
 * @param {number} floor
 */
function firstChoiceTop(anchor, size, floor) {
  if (anchor.bottom + GAP + size.height <= floor) return anchor.bottom + GAP;
  if (anchor.top - GAP - size.height >= MARGIN) return anchor.top - GAP - size.height;
  if (anchor.bottom - anchor.top <= floor - MARGIN) {
    // The anchor fits on screen but the tip fits on neither side: take the
    // roomier side and let the clamp trim it, so it overlaps the anchor's edge
    // rather than its controls.
    const above = anchor.top - MARGIN;
    const below = floor - anchor.bottom;
    return above > below ? anchor.top - GAP - size.height : anchor.bottom + GAP;
  }
  return floor - size.height;
}

/**
 * The area two rects share, 0 when they don't meet.
 * @param {Rect} a
 * @param {Rect} b
 */
function overlap(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
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
