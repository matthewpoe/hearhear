/**
 * Rhythm guessing for record mode. The guess is shown, never trusted: the
 * user fixes it by ear.
 */

import { TICKS_PER_QUARTER } from "./meter.js";

/** Gap lengths a guess can snap to, in beats. */
const GRID = [0.5, 1, 1.5, 2, 3, 4];

/** Gaps within this fraction of each other count as the same gap. */
const SAME_GAP = 0.2;

/** The beat when there is no gap to measure (a single note): 96 BPM. */
const DEFAULT_BEAT_MS = 625;

/**
 * Snap a length in beats to the nearest grid value, in ticks.
 * @param {number} beats
 */
function snapTicks(beats) {
  const nearest = GRID.reduce((best, g) =>
    Math.abs(g - beats) < Math.abs(best - beats) ? g : best,
  );
  return nearest * TICKS_PER_QUARTER;
}

/**
 * The most common gap between onsets. Human timing never repeats exactly, so
 * gaps within SAME_GAP of each other are counted together and averaged; on a
 * tie the earliest gap's group wins.
 * @param {number[]} gaps ms, all positive
 */
function mostCommonGap(gaps) {
  let best = { count: 0, ms: DEFAULT_BEAT_MS };
  for (const gap of gaps) {
    const group = gaps.filter((g) => Math.abs(g - gap) <= SAME_GAP * gap);
    if (group.length > best.count) {
      best = { count: group.length, ms: group.reduce((a, b) => a + b, 0) / group.length };
    }
  }
  return best.ms;
}

/**
 * Guess rhythm from key-down/up times. The most common gap between onsets is
 * the beat (a quarter); other gaps snap to ½, 1, 1½, 2, 3, or 4 beats; a
 * pause over half a beat after a release becomes a rest; the last note's
 * length comes from its release.
 * @param {{ downMs: number, upMs: number }[]} events in order
 * @returns {{ notes: { start: number, dur: number }[], beatMs: number }} notes in ticks
 *   from 0; `beatMs` is the detected beat, so record mode can set the tempo
 */
export function guessRhythm(events) {
  const gaps = events.slice(1).map((e, i) => e.downMs - events[i].downMs);
  const beatMs = mostCommonGap(gaps.filter((g) => g > 0));
  const half = TICKS_PER_QUARTER / 2;

  let start = 0;
  const notes = events.map((event, i) => {
    const held = snapTicks((event.upMs - event.downMs) / beatMs);
    if (i === gaps.length) return { start, dur: held };
    const gap = snapTicks(gaps[i] / beatMs);
    const rest = events[i + 1].downMs - event.upMs > beatMs / 2;
    // A rest keeps the note's held length, leaving at least half a beat of silence.
    const dur = rest ? Math.max(half, Math.min(held, gap - half)) : gap;
    const note = { start, dur };
    start += gap;
    return note;
  });
  return { notes, beatMs };
}
