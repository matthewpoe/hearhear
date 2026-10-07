/**
 * Color the staff's chord symbols by harmonic function, the way a lead sheet
 * colors them (decision D3): no shapes and no chip boxes on the staff; those
 * live only in the chord chip row (Stream D2). The symbols' text follows the
 * user's label style (abc.js), like the chips.
 * abcjs can't style one chord symbol from ABC, so after it renders we give
 * each symbol's text element (found via noteMap.js) its function's color
 * token from theory's functionInfo. Staff.svelte's styles apply it per label
 * mode, so tentative and confirmed switch without redrawing, and hidden mode
 * shows no function color at all.
 *
 * @import { HarmonicFunction, Song } from "../types.js"
 */

import { functionInfo, functionOf, numeralOf } from "../theory/index.js";

/**
 * Each chord's function under the song's key hypothesis. The one place the
 * staff and the transport derive it, once per draw or per play.
 * @param {Song} song
 * @returns {Map<string, HarmonicFunction>} chord id → function
 */
export function chordFunctions(song) {
  return new Map(song.chords.map((c) => [c.id, functionOf(numeralOf(c, song.key), song.key.mode)]));
}

/**
 * Tag each chord symbol with its function and color token. The text color is
 * the token's `-edge` variant when it has one (yellow subdominant is too
 * light to read as text on paper), else the token itself.
 * @param {Map<string, Element>} symbols chord id → abcjs's chord text element
 * @param {Map<string, HarmonicFunction>} functions chord id → its function
 */
export function colorChordSymbols(symbols, functions) {
  for (const [chordId, text] of symbols) {
    const fn = functions.get(chordId) ?? "other";
    const { color } = functionInfo(fn);
    text.classList.add("chord-text", `fn-${fn}`);
    /** @type {SVGElement} */ (text).style.setProperty(
      "--chord-color",
      `var(${color}-edge, var(${color}))`,
    );
  }
}

/**
 * The reveal when the key is confirmed: chord letters take their color and
 * degree lyrics fade in over --dur-reveal (0 under prefers-reduced-motion,
 * via tokens.css).
 * @param {Element} host the notation container
 */
export function revealLabels(host) {
  const style = getComputedStyle(host);
  const duration = parseFloat(style.getPropertyValue("--dur-reveal")) || 0;
  if (duration === 0) return;
  const easing = style.getPropertyValue("--ease").trim() || "ease-out";
  // From the plain ink color to the function color (an implicit end keyframe).
  const ink = style.color;
  for (const el of host.querySelectorAll(".chord-text")) {
    el.animate([{ fill: ink }], { duration, easing });
  }
  for (const el of host.querySelectorAll(".abcjs-lyric")) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
  }
}
