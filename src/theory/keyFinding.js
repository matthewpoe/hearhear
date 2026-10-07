/**
 * Key finding: candidates to test by ear, never a verdict.
 *
 * @import { Key, Note } from "../types.js"
 */

import { CONVENTIONAL_TONICS, SCALES, chromaOf, mod, spell } from "./pitch.js";

/** Krumhansl-Kessler key profiles, from the tonic up by semitone. */
const PROFILES = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

/**
 * Semitones above the tonic that count as in the key. Minor also accepts the
 * raised 6th and 7th, so a leading tone at a cadence isn't flagged.
 */
const IN_SCALE = { major: SCALES.major, minor: [...SCALES.minor, 9, 11] };

/**
 * Pearson correlation; 0 when either side is flat (no notes yet).
 * @param {number[]} xs
 * @param {number[]} ys
 */
function correlation(xs, ys) {
  const mean = (/** @type {number[]} */ v) => v.reduce((a, b) => a + b, 0) / v.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/**
 * Rank all 24 keys by Krumhansl-Schmuckler correlation. Candidates, never a
 * verdict: out-of-scale notes are annotations, not filters ("F natural is
 * outside D major"), so a blue-note melody keeps its real key in the running.
 * Each pitch class counts by its total duration.
 * @param {Note[]} notes
 * @returns {{ key: Key, score: number, outOfScale: { noteId: string, pitch: string }[] }[]}
 *   24 entries, best first; `pitch` is spelled in that key, e.g. "F4"
 */
export function rankKeys(notes) {
  const histogram = Array(12).fill(0);
  for (const note of notes) histogram[mod(note.midi, 12)] += note.dur;

  const modes = /** @type {const} */ (["major", "minor"]);
  const ranked = modes.flatMap((mode) =>
    CONVENTIONAL_TONICS[mode].map((tonic) => {
      /** @type {Key} */
      const key = { tonic, mode, provisional: true };
      const root = chromaOf(tonic);
      const fromTonic = histogram.map((_, i) => histogram[mod(i + root, 12)]);
      const outOfScale = notes
        .filter((n) => !IN_SCALE[mode].includes(mod(n.midi - root, 12)))
        .map((n) => ({ noteId: n.id, pitch: spell(n.midi, key) }));
      return { key, score: correlation(fromTonic, PROFILES[mode]), outOfScale };
    }),
  );
  return ranked.sort((a, b) => b.score - a.score);
}
