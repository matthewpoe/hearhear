/**
 * The beginner tour's pure logic: which callout shows next, when the user's
 * own actions finish one, when one steps aside, and where it sits beside its
 * anchor. No DOM access; the component passes in what it measured.
 */

/**
 * What the tour knows about the app, read from the stores and the page.
 * - songLoaded: a tune is on the staff.
 * - keyChosen: the user has committed a home (the key isn't provisional).
 * - playing: the tune is playing (a playhead is lit).
 * - finderOpen: the ear finder ("Help me find it") is open.
 * - dropdownOpen: the chord dropdown is open on a note.
 * - chordPlaced: the song has at least one chord.
 * @typedef {{
 *   songLoaded: boolean,
 *   keyChosen: boolean,
 *   playing: boolean,
 *   finderOpen: boolean,
 *   dropdownOpen: boolean,
 *   chordPlaced: boolean,
 * }} TourFacts
 */

/** @typedef {keyof TourFacts} Fact */

/**
 * One beginner callout from content/callouts.json.
 * - anchor: the id of the element it sits beside.
 * - part: a selector for a smaller target inside the anchor (the "Help me
 *   find it" button inside the key question). The anchor still counts as the tip's subject.
 * - when: the facts that must hold for it to show, so it shows only while
 *   its subject is on screen and makes sense.
 * - doneWhen: the fact that means the user did what it asks; once that holds,
 *   the tip counts as seen.
 * - noNext: no Next button; the tip waits for its doneWhen action.
 * @typedef {{
 *   id: string,
 *   anchor: string,
 *   part?: string,
 *   title?: string,
 *   text: string,
 *   needsKeyLabels?: boolean,
 *   when?: Partial<TourFacts>,
 *   doneWhen?: Fact,
 *   noNext?: boolean,
 * }} Callout
 */

/**
 * Whether the app is in the state a callout's `when` asks for.
 * @param {Callout} callout
 * @param {TourFacts} facts
 */
export function isDue(callout, facts) {
  return Object.entries(callout.when ?? {}).every(
    ([fact, wanted]) => facts[/** @type {Fact} */ (fact)] === wanted,
  );
}

/**
 * The first callout, in content order, that hasn't been dismissed, whose
 * moment has come (`when`), whose anchor is on screen, and that doesn't
 * explain key labels while a demo hides them.
 * @param {Callout[]} callouts
 * @param {{
 *   dismissed: ReadonlySet<string>,
 *   hasAnchor: (callout: Callout) => boolean,
 *   labelsHidden: boolean,
 *   facts: TourFacts,
 * }} context
 * @returns {Callout | null}
 */
export function nextCallout(callouts, { dismissed, hasAnchor, labelsHidden, facts }) {
  return (
    callouts.find(
      (callout) =>
        !dismissed.has(callout.id) &&
        !(labelsHidden && callout.needsKeyLabels) &&
        isDue(callout, facts) &&
        hasAnchor(callout),
    ) ?? null
  );
}

/**
 * Ids of the callouts the user has already acted on: their `doneWhen` fact
 * holds (a song loaded, a key chosen, the dropdown opened).
 * @param {Callout[]} callouts
 * @param {TourFacts} facts
 * @returns {string[]}
 */
export function actedOn(callouts, facts) {
  return callouts.filter((c) => c.doneWhen && facts[c.doneWhen]).map((c) => c.id);
}

/**
 * The dismissed set with more ids.
 * @param {ReadonlySet<string>} dismissed
 * @param {...string} ids
 * @returns {Set<string>}
 */
export function dismiss(dismissed, ...ids) {
  return new Set([...dismissed, ...ids]);
}

/**
 * Whether any of an element's box is in the visible area (the viewport above
 * the keyboard dock, when given). A tip waits until its subject is in view.
 * @param {Rect} rect
 * @param {{ width: number, height: number, bottom?: number }} viewport
 */
export function isOnScreen(rect, viewport) {
  const floor = Math.min(viewport.bottom ?? viewport.height, viewport.height);
  return (
    rect.bottom > 0 &&
    rect.top < floor &&
    rect.right > 0 &&
    rect.left < viewport.width &&
    rect.bottom > rect.top
  );
}

/** Actions elsewhere a tip tolerates before it folds into the "Tip" chip. */
const ACTIONS_ELSEWHERE = 1;

/**
 * Count one user action (a click or tap, or a key press that activates the
 * focused control; moving focus alone isn't one) against the showing tip. Actions on the tip or its subject (the anchor element)
 * don't count; the second action elsewhere folds the tip away.
 * @param {number} elsewhere actions elsewhere so far, for this tip
 * @param {boolean} onSubject the action was on the tip or its anchor
 * @returns {{ elsewhere: number, fold: boolean }}
 */
export function countAction(elsewhere, onSubject) {
  const next = onSubject ? elsewhere : elsewhere + 1;
  return { elsewhere: next, fold: next > ACTIONS_ELSEWHERE };
}

/** Keys that activate or change the focused control (Tab and the rest only move focus). */
const ACTIVATING = new Set([" ", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * Whether a key press counts as an action for `countAction`: it activates or
 * changes the focused control. Moving focus doesn't, so a keyboard user can
 * Tab to a tip's subject without folding the tip.
 * @param {string} key a KeyboardEvent's `key`
 */
export function isActivatingKey(key) {
  return ACTIVATING.has(key);
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
 * then above and below (at the anchor's left edge, then its right), then over
 * the anchor's own top, then each of those slid just past a control it
 * covers, then in a gap between the controls, and takes the first spot that
 * covers none; if every spot covers some, the one that
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
  const near = [
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
    // Over the anchor's own top, at its left or right (its controls are in
    // `avoid`, so this only wins over prose).
    fit(anchor.top, anchor.left),
    fit(anchor.top, anchor.right - size.width),
  ];
  const covered = (/** @type {Position} */ at) => coverage(at, size, avoid);
  // A spot slid just past each control it would cover (right, left, up,
  // down), so a tip can sit beside a button rather than on it.
  const slid = (/** @type {Position[]} */ spots) =>
    spots.flatMap((at) =>
      avoid
        .filter((rect) => coverage(at, size, [rect]) > 0)
        .flatMap((rect) => [
          fit(at.top, rect.right + MARGIN),
          fit(at.top, rect.left - MARGIN - size.width),
          fit(rect.top - MARGIN - size.height, at.left),
          fit(rect.bottom + MARGIN, at.left),
        ]),
    );
  const once = slid(near);
  const candidates = [
    ...near,
    ...once,
    // Twice, for a spot hemmed in on two sides (under the music, beside the tutor).
    ...slid(once),
    // Last resort: in a gap between the controls.
    ...avoid.flatMap((rect) => [
      fit(rect.bottom + MARGIN, anchor.left),
      fit(rect.top - MARGIN - size.height, anchor.left),
    ]),
  ];
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
