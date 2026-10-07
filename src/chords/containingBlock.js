// The dropdown is absolutely positioned in page coordinates, which holds only
// while its containing block is the initial one: no ancestor may be
// positioned or establish a containing block some other way (a transform,
// filter, containment, and so on). This finds the first one that does, so
// the dropdown can say so instead of silently drifting from its anchor.

/** Properties that make a containing block when not at this value. */
const UNLESS = {
  position: "static",
  transform: "none",
  translate: "none",
  rotate: "none",
  scale: "none",
  perspective: "none",
  filter: "none",
  "backdrop-filter": "none",
};

/** Properties that make a containing block when they match. */
const WHEN = {
  contain: /\b(layout|paint|strict|content)\b/,
  "will-change": /\b(transform|translate|rotate|scale|perspective|filter|backdrop-filter)\b/,
  "container-type": /size/,
  "content-visibility": /\b(auto|hidden)\b/,
};

const PROPERTIES = [...Object.keys(UNLESS), ...Object.keys(WHEN)];

/**
 * Why an element with these computed styles is a containing block for
 * absolutely positioned descendants, or null if it isn't. Missing or empty
 * values count as the initial value.
 * @param {Partial<Record<string, string>>} style computed values by CSS property name
 * @returns {string | null} e.g. "position: relative"
 */
export function containingBlockReason(style) {
  for (const [prop, initial] of Object.entries(UNLESS)) {
    const value = style[prop];
    if (value && value !== initial) return `${prop}: ${value}`;
  }
  for (const [prop, pattern] of Object.entries(WHEN)) {
    const value = style[prop];
    if (value && pattern.test(value)) return `${prop}: ${value}`;
  }
  return null;
}

/**
 * The nearest ancestor of `element` that is a containing block, and why.
 * @param {Element} element
 * @returns {{ ancestor: Element, reason: string } | null}
 */
export function containingAncestor(element) {
  for (let el = element.parentElement; el; el = el.parentElement) {
    const computed = getComputedStyle(el);
    const reason = containingBlockReason(
      Object.fromEntries(PROPERTIES.map((prop) => [prop, computed.getPropertyValue(prop)])),
    );
    if (reason) return { ancestor: el, reason };
  }
  return null;
}
