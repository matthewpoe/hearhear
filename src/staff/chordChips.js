/**
 * Color the staff's chord symbols by harmonic function. abcjs can't style one
 * chord symbol from ABC, so after it renders we draw a chip behind each
 * symbol's text element (found via noteMap.js) with the function's shape at
 * its left: tonic circle, subdominant triangle, dominant square. The colors
 * live in Staff.svelte's styles, keyed on these classes and the label mode,
 * so tentative/confirmed switches without redrawing.
 *
 * @import { HarmonicFunction, Song } from "../types.js"
 */

import { functionOf, numeralOf } from "../theory/index.js";

const SVG = "http://www.w3.org/2000/svg";
const PAD_X = 4;
const PAD_Y = 1;
const MARK = 7;
const GAP = 3;

/**
 * @param {number} cx
 * @param {number} cy
 * @param {HarmonicFunction} fn
 * @returns {SVGElement | null} the function's shape, or null for "other"
 */
function shape(cx, cy, fn) {
  const r = MARK / 2;
  if (fn === "tonic") {
    return svg("circle", { cx, cy, r });
  }
  if (fn === "subdominant") {
    return svg("path", { d: `M${cx} ${cy - r}L${cx + r} ${cy + r}L${cx - r} ${cy + r}Z` });
  }
  if (fn === "dominant") {
    return svg("rect", { x: cx - r, y: cy - r, width: MARK, height: MARK });
  }
  return null;
}

/**
 * @param {string} tag
 * @param {Record<string, number | string>} attributes
 */
function svg(tag, attributes) {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, String(value));
  return el;
}

/**
 * Each chord's function under the song's key hypothesis.
 * @param {Song} song
 * @returns {Map<string, HarmonicFunction>} chord id → function
 */
export function chordFunctions(song) {
  return new Map(song.chords.map((c) => [c.id, functionOf(numeralOf(c, song.key), song.key.mode)]));
}

/**
 * Draw a function chip behind each chord symbol.
 * @param {Map<string, Element>} symbols chord id → abcjs's chord text element
 * @param {Map<string, HarmonicFunction>} functions chord id → its function
 */
export function drawChordChips(symbols, functions) {
  for (const [chordId, text] of symbols) {
    const fn = functions.get(chordId) ?? "other";
    const box = /** @type {SVGGraphicsElement} */ (text).getBBox();
    const mark = shape(box.x - GAP - MARK / 2, box.y + box.height / 2, fn);
    const left = box.x - PAD_X - (mark ? MARK + GAP : 0);
    const chip = svg("rect", {
      x: left,
      y: box.y - PAD_Y,
      width: box.x + box.width + PAD_X - left,
      height: box.height + 2 * PAD_Y,
      rx: 4,
    });
    chip.setAttribute("class", `chord-chip fn-${fn}`);
    chip.setAttribute("aria-hidden", "true");
    text.classList.add("chord-text", `fn-${fn}`);
    text.before(chip);
    if (mark) {
      mark.setAttribute("class", `chord-mark fn-${fn}`);
      mark.setAttribute("aria-hidden", "true");
      text.before(mark);
    }
  }
}

/**
 * The reveal when the key is confirmed: chips and key-relative labels grow
 * in over --dur-reveal (0 under prefers-reduced-motion, via tokens.css).
 * @param {Element} host the notation container
 */
export function revealLabels(host) {
  const style = getComputedStyle(host);
  const duration = parseFloat(style.getPropertyValue("--dur-reveal")) || 0;
  if (duration === 0) return;
  const easing = style.getPropertyValue("--ease").trim() || "ease-out";
  for (const el of host.querySelectorAll(".chord-chip, .chord-mark")) {
    el.animate(
      [
        { opacity: 0, transform: "scale(0.6)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration,
        easing,
      },
    );
  }
  for (const el of host.querySelectorAll(".abcjs-annotation, .abcjs-lyric")) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
  }
}
