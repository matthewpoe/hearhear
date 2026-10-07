/** @import { Meter, Song } from "../types.js" */

/** Ticks per quarter note. 12 makes eighths, sixteenths, and triplets all exact. */
export const TICKS_PER_QUARTER = 12;

/**
 * Ticks in one beat of the meter (a quarter in 4/4, an eighth in 6/8).
 * @param {Meter} meter
 */
export function ticksPerBeat(meter) {
  return (TICKS_PER_QUARTER * 4) / meter.beatUnit;
}

/** @param {Meter} meter */
export function ticksPerBar(meter) {
  return ticksPerBeat(meter) * meter.beatsPerBar;
}

/**
 * Where a tick falls in the meter. Bar 0 is the pickup; its notes sit at the
 * end of an imaginary full bar, so a one-beat pickup in 4/4 is on beat 4.
 * Beats are 1-based and fractional (2.5 is the "and" of 2).
 *
 * @param {number} tick
 * @param {Meter} meter
 * @returns {{ bar: number, beat: number }}
 */
export function positionOf(tick, meter) {
  const barTicks = ticksPerBar(meter);
  const fromDownbeat = tick - meter.pickupTicks;
  const bar = Math.floor(fromDownbeat / barTicks) + 1;
  const offset = fromDownbeat - (bar - 1) * barTicks;
  return { bar, beat: 1 + offset / ticksPerBeat(meter) };
}

/**
 * Lay out bars for a meter hypothesis. Notes never move; only bar lines do.
 * Bar 0 is the pickup when meter.pickupTicks > 0. Every bar up to the last
 * note's end is listed, including empty ones (a bar of rest).
 * @param {Song} song
 * @param {Meter} meter
 * @returns {{ index: number, startTick: number, noteIds: string[] }[]}
 */
export function rebar(song, meter) {
  const end = song.notes.reduce((max, n) => Math.max(max, n.start + n.dur), 0);
  const barTicks = ticksPerBar(meter);
  const firstBar = meter.pickupTicks > 0 ? 0 : 1;
  const lastBar = end === 0 ? firstBar : positionOf(end - 1, meter).bar;
  const bars = [];
  for (let index = firstBar; index <= lastBar; index++) {
    const startTick = index === 0 ? 0 : meter.pickupTicks + (index - 1) * barTicks;
    const noteIds = song.notes
      .filter((n) => positionOf(n.start, meter).bar === index)
      .map((n) => n.id);
    bars.push({ index, startTick, noteIds });
  }
  return bars;
}
