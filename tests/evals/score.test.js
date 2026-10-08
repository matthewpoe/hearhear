import { test } from "node:test";
import assert from "node:assert/strict";
import { letterOf, numeralOf } from "../../src/theory/index.js";
import { buildJobs } from "../../evals/jobs.js";
import { FIT_THRESHOLD, baselineChord, dropdownTop, noteAt } from "../../evals/metrics.js";
import { SENSITIVITY, scoreResults } from "../../evals/score.js";

const ctx = await buildJobs();

/**
 * A saved reply to a job, as run.js records it before scoring.
 * @param {import("../../evals/jobs.js").Job} job
 * @param {object[]} suggestions
 * @param {string} [message]
 */
const saved = (job, suggestions, message = "Try these.") => ({
  tune: job.tune,
  kind: job.kind,
  mode: job.mode,
  bar: job.bar,
  beat: job.beat,
  placed: job.placed ? letterOf(job.placed) : null,
  outcome: /** @type {const} */ ("ok"),
  code: null,
  servedBy: "m",
  message,
  suggestions,
  dropped: 0,
  withheld: 0,
  schemaValid: true,
  score: null,
  alternatives: null,
  prose: null,
  ms: 100,
  firstDeltaMs: 40,
});

const check = /** @type {import("../../evals/jobs.js").Job} */ (
  ctx.jobs.find((j) => j.kind === "check")
);
const melody = { ...check.song, chords: [] };
const note = /** @type {import("../../src/types.js").Note} */ (
  noteAt(melody, /** @type {number} */ (check.bar), /** @type {number} */ (check.beat))
);
const top = dropdownTop(melody, note.id).map((c) => ({
  bar: check.bar,
  beat: check.beat,
  numeral: numeralOf(c, melody.key),
  letter: letterOf(c),
}));

test("scoreResults re-scores saved replies with no requests", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("score.js must not ask the tutor");
  });
  const results = await scoreResults(
    { run: { mode: "fixture" }, replies: [saved(check, top)] },
    ctx,
  );
  const reply = results.replies[0];
  assert.ok(reply.alternatives, "scored as a check");
  assert.equal(reply.alternatives.atPoint, 3);
  assert.equal(results.requests, ctx.jobs.length);
  assert.equal(results.byTune.length, 1, "only the tunes the run reached");
  assert.equal(results.byTune[0].points, 1, "the baseline at the checks reached");
  assert.deepEqual(
    results.headline.sensitivity.map((s) => s.threshold),
    SENSITIVITY,
  );
  assert.ok(SENSITIVITY.includes(FIT_THRESHOLD));
  const atFixed = results.headline.sensitivity.find((s) => s.threshold === FIT_THRESHOLD);
  assert.deepEqual(atFixed?.alternatives, results.headline.alternatives);
});

test("a check's conventional choice is the dropdown's top pick, unless it was placed", async () => {
  const { replies } = await scoreResults({ run: {}, replies: [saved(check, top)] }, ctx);
  const prose = /** @type {any} */ (replies[0].prose);
  const placedIsTop =
    numeralOf(baselineChord(melody, note.id), melody.key) === numeralOf(check.placed, melody.key);
  assert.equal(prose.conventional, placedIsTop ? null : true);
});

test("a review is scored across the chart, with its prose read", async () => {
  const review = /** @type {import("../../evals/jobs.js").Job} */ (
    ctx.jobs.find((j) => j.kind === "review" && j.repeats.length)
  );
  const [{ first, second }] = review.repeats;
  const cites = `Bars ${first[0]}–${first[1]} come back at bars ${second[0]}–${second[1]}.`;
  const { replies } = await scoreResults(
    {
      run: {},
      replies: [
        saved(review, [], `${cites} Look at bar 99 too.`),
        saved(review, [], "1. One.\n2. Two.\n3. Three.\n4. Four."),
      ],
    },
    ctx,
  );
  const [cited, listed] = replies.map((r) => /** @type {any} */ (r.prose));
  assert.equal(cited.repeatCited, true);
  assert.deepEqual(cited.missingBars, [99]);
  assert.equal(listed.repeatCited, false);
  assert.equal(listed.tests, 4);
  assert.equal(replies[0].alternatives?.alternatives, false, "no cards, no alternatives");
});

test("scoreResults refuses a run saved without its suggestions", async () => {
  const job = ctx.jobs[0];
  const old = { ...saved(job, []), suggestions: undefined };
  await assert.rejects(
    scoreResults({ run: {}, replies: [/** @type {any} */ (old)] }, ctx),
    /no saved suggestions/,
  );
});
