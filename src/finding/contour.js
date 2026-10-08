/**
 * A tune's shape, for its card on the welcome: the opening bars as a little
 * piano roll, each note a dash as long as it lasts, placed by how high it is
 * against the phrase's own lowest and highest notes. No pitch survives the
 * drawing, only the ups and downs between notes: relationships, not pitches.
 * So a card never gives the key away (demo keys start hidden).
 *
 * @import { Song } from "../types.js"
 */

import { ticksPerBar } from "../theory/index.js";

/**
 * @typedef {object} Contour
 * @property {number} width The viewBox width.
 * @property {number} height The viewBox height.
 * @property {{ x: number, y: number, w: number }[]} dashes One per note, left
 *   to right: where it starts, its height, and how long it lasts.
 * @property {string} path A thin step line through every note.
 */

/**
 * @param {Pick<Song, "notes" | "meter">} tune
 * @param {{ bars?: number, width?: number, height?: number, pad?: number }} [size]
 *   How many bars after any pickup to draw, and the box to draw them in.
 * @returns {Contour}
 */
export function contour(tune, { bars = 4, width = 240, height = 56, pad = 8 } = {}) {
  const end = tune.meter.pickupTicks + bars * ticksPerBar(tune.meter);
  const notes = [...tune.notes].sort((a, b) => a.start - b.start).filter((n) => n.start < end);
  if (notes.length === 0) return { width, height, dashes: [], path: "" };

  const first = notes[0].start;
  const last = Math.min(end, Math.max(...notes.map((n) => n.start + n.dur)));
  const span = Math.max(1, last - first);
  const low = Math.min(...notes.map((n) => n.midi));
  const high = Math.max(...notes.map((n) => n.midi));
  const range = high - low;
  const xOf = (/** @type {number} */ tick) => pad + ((tick - first) / span) * (width - 2 * pad);
  const yOf = (/** @type {number} */ midi) =>
    range === 0 ? height / 2 : pad + ((high - midi) / range) * (height - 2 * pad);
  const round = (/** @type {number} */ v) => Math.round(v * 10) / 10;

  const dashes = notes.map((n) => {
    const x = xOf(n.start);
    const w = xOf(Math.min(n.start + n.dur, last)) - x;
    // A hair of space between repeated notes, so each one reads.
    return { x: round(x), y: round(yOf(n.midi)), w: round(Math.max(1, w - 1.5)) };
  });
  // A step line: along each note, then straight up or down to the next.
  const path = dashes
    .map((d, i) => `${i === 0 ? `M${d.x} ${d.y}` : `H${d.x}V${d.y}`}H${round(d.x + d.w)}`)
    .join("");
  return { width, height, dashes, path };
}
