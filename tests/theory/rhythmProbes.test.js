// The #53 gate's rhythm probe matrix, as one table (docs/decisions/record-tune.md,
// "A swung pair's long note is never longer than the beat"). Each line is
// played legato with a little human wobble at each tempo and must read at the
// right tempo, swung or not. The cases the gate found wrong on main and on
// the branch alike are kept as `todo`, with the reason, so a fix shows up.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guessRhythm } from "../../src/theory/index.js";

const WOBBLE_MS = [0, 14, -11, 7, -16, 9, -5, 12];

/**
 * Key events for a line of note lengths (in beats), legato, with wobble.
 * @param {number[]} lengths
 * @param {number} bpm
 */
function play(lengths, bpm) {
  const beatMs = 60000 / bpm;
  let at = 1000;
  return lengths.map((beats, i) => {
    const downMs = at + WOBBLE_MS[i % WOBBLE_MS.length];
    at += beats * beatMs;
    return { downMs, upMs: downMs + beats * beatMs - 20 };
  });
}

const h = 2;
const dq = 1.5;
const q = 1;
const e = 0.5;
const SW = [2 / 3, 1 / 3];

/**
 * @typedef {{
 *   name: string,
 *   line: number[],
 *   bpms: number[],
 *   swing: boolean,
 *   beat?: number,
 *   todo?: string,
 * }} Probe
 * `beat`: the line's beat in its own units when it isn't a quarter.
 */

/** @type {Probe[]} */
const PROBES = [
  { name: "h q. e e e q", line: [h, dq, e, e, e, q], bpms: [100, 120], swing: false },
  { name: "h q. e q q", line: [h, dq, e, q, q], bpms: [100], swing: false },
  {
    name: "h q. e q q (this table's wobble)",
    line: [h, dq, e, q, q],
    bpms: [120],
    swing: false,
    todo: "passed the gate's probe; with this table's wobble it misreads (not tuned under the freeze)",
  },
  {
    name: "dotted line [q. e]×3 + q q",
    line: [dq, e, dq, e, dq, e, q, q],
    bpms: [60, 70, 80, 100, 130],
    swing: false,
  },
  {
    name: "2:1 swing",
    line: [q, ...SW, ...SW, ...SW, q],
    bpms: [50, 60, 67, 80, 100, 120],
    swing: true,
  },
  {
    name: "slow 3:1 swing",
    line: [q, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25, q],
    bpms: [60],
    swing: true,
  },
  { name: "slow 3:2 swing", line: [q, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, q], bpms: [60], swing: true },
  {
    name: "h q. e e e q at 70",
    line: [h, dq, e, e, e, q],
    bpms: [70],
    swing: false,
    todo: "wrong on main and #53 alike: the gate's known slow case",
  },
  {
    name: "quarters over 140 BPM",
    line: [q, q, q, q, q, q, q, q],
    bpms: [160],
    swing: false,
    todo: "tempos over 140 BPM read at half speed (plausibleBeat's band)",
  },
  {
    name: "q. e h opening",
    line: [dq, e, h, dq, e, h],
    bpms: [100],
    swing: false,
    todo: "a q. e h opening has no quarter to anchor the beat",
  },
  {
    name: "pure dotted line, no quarters",
    line: [dq, e, dq, e, dq, e, dq, e],
    bpms: [90],
    swing: false,
    todo: "with no plain quarter the dotted figure can't be told from swing",
  },
];

describe("rhythm probe matrix (#53)", () => {
  for (const probe of PROBES) {
    for (const bpm of probe.bpms) {
      it(
        `${probe.name} at ${bpm} BPM reads ${probe.swing ? "swung" : "straight"} at ${bpm}`,
        { todo: probe.todo },
        () => {
          const { beatMs, swing } = guessRhythm(play(probe.line, bpm));
          const read = 60000 / beatMs;
          assert.equal(swing, probe.swing, `swing ${swing}`);
          assert.ok(Math.abs(read - bpm) / bpm < 0.08, `read ${Math.round(read)} BPM`);
        },
      );
    }
  }
});
