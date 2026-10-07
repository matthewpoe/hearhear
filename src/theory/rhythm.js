/**
 * Rhythm guessing for record mode. The guess is shown, never trusted: the
 * user fixes it by ear.
 */

import { TICKS_PER_QUARTER } from "./meter.js";

/** Gap lengths a guess can snap to, in beats. */
const GRID = [0.5, 1, 1.5, 2, 3, 4];

/** Gaps within this fraction of each other count as the same gap. */
const SAME_GAP = 0.2;

/**
 * Onsets closer than this fraction of a beat are one slip, not two notes:
 * nearer to together than to the shortest grid value, half a beat.
 */
const DUPLICATE_ONSET = 0.25;

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
 * Indices of events followed by another onset within DUPLICATE_ONSET of a
 * beat: of two keys pressed together, the earlier is the slip.
 * @param {{ downMs: number }[]} events
 */
function duplicateOnsets(events) {
  const gaps = events.slice(1).map((e, i) => e.downMs - events[i].downMs);
  const beatMs = mostCommonGap(gaps.filter((g) => g > 0));
  const dropped = [];
  for (const [i, gap] of gaps.entries()) {
    if (gap < beatMs * DUPLICATE_ONSET) dropped.push(i);
  }
  return dropped;
}

/**
 * Guess rhythm from key-down/up times. The most common gap between onsets is
 * the beat (a quarter); other gaps snap to ½, 1, 1½, 2, 3, or 4 beats; a
 * pause over half a beat after a release becomes a rest; the last note's
 * length comes from its release.
 *
 * Two onsets less than a quarter of a beat apart (a two-finger slip) are one
 * note: the earlier event is dropped and listed in `dropped`, so the caller
 * can pair the remaining events with `notes` in order. A missing or invalid
 * release (not a number, or before its key-down) is treated as legato: the
 * note lasts until the next one, and the last note lasts one beat.
 * @param {{ downMs: number, upMs: number }[]} events in order
 * @returns {{ notes: { start: number, dur: number }[], beatMs: number, dropped: number[] }}
 *   notes in ticks from 0, one per event not dropped; `beatMs` is the detected
 *   beat, so record mode can set the tempo; `dropped` lists the indices of
 *   events merged into the next one, ascending
 */
export function guessRhythm(events) {
  const dropped = duplicateOnsets(events);
  const kept = events.filter((_, i) => !dropped.includes(i));
  return { ...guessKept(kept), dropped };
}

/**
 * The PRD's algorithm, on events with no duplicate onsets.
 * @param {{ downMs: number, upMs: number }[]} events
 */
function guessKept(events) {
  const gaps = events.slice(1).map((e, i) => e.downMs - events[i].downMs);
  const beatMs = mostCommonGap(gaps.filter((g) => g > 0));
  const half = TICKS_PER_QUARTER / 2;

  let start = 0;
  const notes = events.map((event, i) => {
    const heldMs = event.upMs - event.downMs;
    const held = Number.isFinite(heldMs) && heldMs >= 0 ? snapTicks(heldMs / beatMs) : null;
    if (i === gaps.length) return { start, dur: held ?? TICKS_PER_QUARTER };
    const gap = snapTicks(gaps[i] / beatMs);
    const rest = held !== null && events[i + 1].downMs - event.upMs > beatMs / 2;
    // A rest keeps the note's held length, leaving at least half a beat of silence.
    const dur = rest ? Math.max(half, Math.min(held, gap - half)) : gap;
    const note = { start, dur };
    start += gap;
    return note;
  });
  return { notes, beatMs };
}
