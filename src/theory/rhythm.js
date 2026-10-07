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
 * nearer to together than to the shortest grid value, half a beat. Under a
 * quarter of a beat, so the short note of a hard (3:1) swing pair survives.
 */
const DUPLICATE_ONSET = 0.2;

/** The beat when there is no gap to measure (a single note): 96 BPM. */
const DEFAULT_BEAT_MS = 625;

/**
 * The tempos a beat is read in. A most common gap faster than FASTEST_BPM is
 * an eighth (a tune that moves mostly in eighths, like St. James at 76), so the
 * beat is twice it; slower than SLOWEST_BPM, half it. The band is wider than
 * an octave, so one doubling or halving never jumps across it.
 */
const FASTEST_BPM = 140;
const SLOWEST_BPM = 50;

/**
 * A beat length moved by octaves into the plausible tempo band.
 * @param {number} ms
 */
function plausibleBeat(ms) {
  if (!(ms > 0) || !Number.isFinite(ms)) return DEFAULT_BEAT_MS;
  let beat = ms;
  while (60000 / beat > FASTEST_BPM) beat *= 2;
  while (60000 / beat < SLOWEST_BPM) beat /= 2;
  return beat;
}

/**
 * A computer key is tapped, not held like a piano key (Matthew's spec): a
 * press shorter than this, or shorter than half a beat, is a tap, and a tap
 * says nothing about the note's length.
 */
const TAP_MS = 250;

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
 * A long-short pair from about 3:2 to 3:1 (wider, 5:4 to 3.6:1, for human timing)
 * is a swung eighth pair when it fills one beat.
 */
const SWING_MIN = 1.25;
const SWING_MAX = 3.6;

/** @param {number} long @param {number} short */
const swingRatio = (long, short) =>
  short > 0 && long / short >= SWING_MIN && long / short <= SWING_MAX;

/**
 * Indices of the gaps that start a swung pair filling one beat, left to right,
 * never overlapping.
 * @param {number[]} gaps ms
 * @param {number} beatMs
 */
function swungPairs(gaps, beatMs) {
  const starts = [];
  for (let i = 0; i + 1 < gaps.length; i++) {
    const sum = gaps[i] + gaps[i + 1];
    if (swingRatio(gaps[i], gaps[i + 1]) && Math.abs(sum - beatMs) <= SAME_GAP * beatMs) {
      starts.push(i);
      i++;
    }
  }
  return starts;
}

/**
 * Read swing the jazz way: a swung eighth pair is written as two straight
 * eighths. The beat is the most common gap (moved into a plausible tempo,
 * 50–140 BPM), unless the most common sum of a
 * swung pair explains more of the take (a line of swung eighths alternates
 * two gaps, neither of them the beat). Each swung pair's
 * gaps are then evened out to half its length.
 * @param {number[]} gaps ms between onsets
 * @returns {{ gaps: number[], beatMs: number, swing: boolean }} `swing`:
 *   more of the take's eighth pairs were swung than straight
 */
function readSwing(gaps) {
  const positive = gaps.filter((g) => g > 0);
  const straightBeat = plausibleBeat(mostCommonGap(positive));
  const sums = [];
  for (let i = 0; i + 1 < gaps.length; i++) {
    if (swingRatio(gaps[i], gaps[i + 1])) sums.push(gaps[i] + gaps[i + 1]);
  }
  /**
   * How many gaps a beat explains: those in swung pairs that fill it, and the
   * rest that are about one beat long.
   * @param {number} beat
   */
  const explained = (beat) => {
    const inPairs = new Set(swungPairs(gaps, beat).flatMap((i) => [i, i + 1]));
    const onBeat = gaps.filter((g, i) => !inPairs.has(i) && Math.abs(g - beat) <= SAME_GAP * beat);
    return inPairs.size + onBeat.length;
  };
  let beatMs = straightBeat;
  if (sums.length > 0) {
    const swingBeat = plausibleBeat(mostCommonGap(sums));
    if (explained(swingBeat) > explained(straightBeat)) beatMs = swingBeat;
  }
  const pairs = swungPairs(gaps, beatMs);
  const even = [...gaps];
  for (const i of pairs) even[i] = even[i + 1] = (gaps[i] + gaps[i + 1]) / 2;
  const eighth = beatMs / 2;
  const isEighth = (/** @type {number} */ g) => Math.abs(g - eighth) <= SAME_GAP * eighth;
  let straightPairs = 0;
  const swung = new Set(pairs.flatMap((i) => [i, i + 1]));
  for (let i = 0; i + 1 < gaps.length; i++) {
    if (!swung.has(i) && !swung.has(i + 1) && isEighth(gaps[i]) && isEighth(gaps[i + 1])) {
      straightPairs++;
      i++;
    }
  }
  return { gaps: even, beatMs, swing: pairs.length > straightPairs };
}

/**
 * Guess rhythm from key-down/up times. The most common gap between onsets is
 * the beat (a quarter); other gaps snap to ½, 1, 1½, 2, 3, or 4 beats.
 *
 * Computer keys are tapped (held about 100 ms), so a tap reads as its full
 * gap: the note lasts until the next one starts. Only a held note (half a
 * beat or longer) followed by a full beat of silence leaves a rest; it keeps
 * its held length. The last note's length comes from its release when held;
 * a tapped last note lasts until `endMs` (when the take stopped), or one beat
 * without it.
 *
 * Swung eighths are written straight, the jazz convention: a long-short pair
 * (about 2:1, from 3:2 to 3:1) that fills one beat becomes two eighths, and
 * `swing` says whether most of the take's eighth pairs were swung.
 *
 * Two onsets less than a quarter of a beat apart (a two-finger slip) are one
 * note: the earlier event is dropped and listed in `dropped`, so the caller
 * can pair the remaining events with `notes` in order. A missing or invalid
 * release (not a number, or before its key-down) is treated as legato: the
 * note lasts until the next one, and the last note lasts one beat.
 * @param {{ downMs: number, upMs: number }[]} events in order
 * @param {{ endMs?: number }} [options] `endMs`: when the take stopped
 * @returns {{ notes: { start: number, dur: number }[], beatMs: number, dropped: number[], swing: boolean }}
 *   notes in ticks from 0, one per event not dropped; `beatMs` is the detected
 *   beat, so record mode can set the tempo; `dropped` lists the indices of
 *   events merged into the next one, ascending
 */
export function guessRhythm(events, { endMs } = {}) {
  const dropped = duplicateOnsets(events);
  const kept = events.filter((_, i) => !dropped.includes(i));
  return { ...guessKept(kept, endMs), dropped };
}

/**
 * The PRD's algorithm, with Matthew's tapped-key rule, on events with no
 * duplicate onsets.
 * @param {{ downMs: number, upMs: number }[]} events
 * @param {number | undefined} endMs
 */
function guessKept(events, endMs) {
  const { gaps, beatMs, swing } = readSwing(
    events.slice(1).map((e, i) => e.downMs - events[i].downMs),
  );
  const half = TICKS_PER_QUARTER / 2;

  let start = 0;
  const notes = events.map((event, i) => {
    const heldMs = event.upMs - event.downMs;
    const valid = Number.isFinite(heldMs) && heldMs >= 0;
    const tapped = valid && (heldMs < TAP_MS || heldMs < beatMs / 2);
    const held = valid && !tapped ? snapTicks(heldMs / beatMs) : null;
    if (i === gaps.length) {
      if (tapped && Number.isFinite(endMs) && /** @type {number} */ (endMs) > event.downMs) {
        return { start, dur: snapTicks(/** @type {number} */ (endMs - event.downMs) / beatMs) };
      }
      return { start, dur: held ?? TICKS_PER_QUARTER };
    }
    const gap = snapTicks(gaps[i] / beatMs);
    const rest = held !== null && events[i + 1].downMs - event.upMs >= beatMs;
    // A rest keeps the note's held length, leaving at least a beat of silence.
    const dur = rest ? Math.min(gap, Math.max(half, Math.min(held, gap - TICKS_PER_QUARTER))) : gap;
    const note = { start, dur };
    start += gap;
    return note;
  });
  return { notes, beatMs, swing };
}
