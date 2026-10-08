import { test } from "node:test";
import assert from "node:assert/strict";
import { letterOf, numeralOf } from "../../src/theory/index.js";
import { buildJobs } from "../../evals/jobs.js";
import { FIT_THRESHOLD, dropdownTop, noteAt } from "../../evals/metrics.js";
import { SENSITIVITY, scoreResults } from "../../evals/score.js";

const ctx = await buildJobs();

/**
 * A saved reply to a job, as run.js records it before scoring.
 * @param {import("../../evals/jobs.js").Job} job
 * @param {object[]} suggestions
 */
const saved = (job, suggestions) => ({
  tune: job.tune,
  kind: job.kind,
  level: job.level,
  bar: job.bar,
  beat: job.beat,
  reference: job.reference ? letterOf(job.reference) : null,
  placed: job.placed ? letterOf(job.placed) : null,
  outcome: /** @type {const} */ ("ok"),
  code: null,
  servedBy: "m",
  message: "Try these.",
  suggestions,
  dropped: 0,
  withheld: 0,
  schemaValid: true,
  score: null,
  alternatives: null,
  verdict: null,
  withholds: null,
  ms: 100,
  firstDeltaMs: 40,
});

test("scoreResults re-scores saved replies with no requests", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("score.js must not ask the tutor");
  });
  const job = ctx.jobs.find((j) => j.kind === "ask" && j.level === "comparison");
  assert.ok(job);
  const { bar, beat, song } = job;
  const note = /** @type {import("../../src/types.js").Note} */ (noteAt(song, bar, beat));
  const top = dropdownTop(song, note.id).map((c) => ({
    bar,
    beat,
    numeral: numeralOf(c, song.key),
    letter: letterOf(c),
  }));
  const results = await scoreResults({ run: { mode: "fixture" }, replies: [saved(job, top)] }, ctx);
  const reply = results.replies[0];
  assert.ok(reply.alternatives, "scored as an ask");
  assert.equal(reply.alternatives.atPoint, 3);
  assert.equal(results.byTune.length, 1, "only the tunes the run reached");
  assert.equal(results.byTune[0].points, 1, "the baseline at the notes asked about");
  assert.deepEqual(
    results.headline.sensitivity.map((s) => s.threshold),
    SENSITIVITY,
  );
  assert.ok(SENSITIVITY.includes(FIT_THRESHOLD));
  const atFixed = results.headline.sensitivity.find((s) => s.threshold === FIT_THRESHOLD);
  assert.deepEqual(atFixed?.alternatives, results.headline.alternatives);
});

test("scoreResults refuses a run saved without its suggestions", async () => {
  const job = ctx.jobs[0];
  const old = { ...saved(job, []), suggestions: undefined };
  await assert.rejects(
    scoreResults({ run: {}, replies: [/** @type {any} */ (old)] }, ctx),
    /no saved suggestions/,
  );
});
