/** @import { Meter } from "../types.js" */

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
