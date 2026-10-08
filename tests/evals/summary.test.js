import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRate, resultsTable, summarize } from "../../evals/summary.js";

const good = {
  atPoint: 2,
  considered: 2,
  offTarget: 0,
  distinct: 2,
  plausible: 2,
  beyond: 1,
  alternatives: true,
};
const none = { ...good, offTarget: 1, plausible: 1, beyond: 0, alternatives: false };

/** @type {import("../../evals/summary.js").ProseScore} */
const clean = {
  verdict: false,
  missingBars: [],
  repeatCited: null,
  tests: 2,
  namedAlternatives: [],
  uncarded: [],
  conventional: null,
};

/**
 * @param {Partial<import("../../evals/summary.js").ReplyRecord>} overrides
 * @param {Partial<import("../../evals/summary.js").ProseScore>} [prose]
 * @returns {import("../../evals/summary.js").ReplyRecord}
 */
const record = (overrides, prose = {}) => ({
  tune: "t",
  kind: "review",
  mode: "review",
  bar: null,
  beat: null,
  placed: null,
  outcome: "ok",
  code: null,
  servedBy: "m",
  message: "",
  dropped: 0,
  withheld: 0,
  schemaValid: true,
  score: { suggestions: 2, agreeing: 2, onOnset: 2, clashing: 0 },
  suggestions: [],
  alternatives: good,
  prose: { ...clean, ...prose },
  ms: 100,
  firstDeltaMs: 40,
  ...overrides,
});

test("summarize counts excluded and failed replies apart from the scored ones", () => {
  const s = summarize([
    record({ score: { suggestions: 2, agreeing: 1, onOnset: 1, clashing: 1 } }),
    record({ ms: 300 }),
    record({ outcome: "excluded", servedBy: "fallback", score: null, prose: null, ms: 9999 }),
    record({ outcome: "failed", code: "upstream", schemaValid: false, score: null, prose: null }),
    record({
      outcome: "invalid",
      code: "invalid_output",
      schemaValid: false,
      score: null,
      prose: null,
    }),
  ]);
  assert.equal(s.replies, 5);
  assert.equal(s.excluded, 1);
  assert.equal(s.failed, 1);
  assert.deepEqual(s.schemaValidity, { count: 2, total: 3 }, "invalid output counts against");
  assert.deepEqual(s.agreement, { count: 3, total: 4 });
  assert.deepEqual(s.clashRate, { count: 1, total: 3 });
  assert.deepEqual(s.alternatives, { count: 2, total: 2 }, "scored replies only");
  assert.deepEqual(s.latencyMs, { p50: 100, p95: 300 }, "excluded replies don't count");
});

test("summarize scores alternatives on every reply, and the 'does this work?' rate on checks", () => {
  const check = { kind: /** @type {const} */ ("check"), mode: /** @type {const} */ ("question") };
  const s = summarize([
    record({}),
    record({ alternatives: none }),
    record(check, { verdict: true }),
    record({ ...check, alternatives: none }),
    record(check),
  ]);
  assert.deepEqual(s.alternatives, { count: 3, total: 5 });
  assert.deepEqual(s.beyond, { count: 3, total: 8 });
  assert.deepEqual(s.offTarget, { count: 2, total: 10 });
  assert.deepEqual(
    s.checkAlternatives,
    { count: 1, total: 3 },
    "options and no verdict: alternatives with a verdict don't count",
  );
  assert.deepEqual(s.verdictFree, { count: 4, total: 5 });
  assert.equal(summarize([record({})]).checkAlternatives, null, "no checks");
});

test("summarize rolls up the prose checks, each pass or fail per reply", () => {
  const s = summarize([
    record({}, { missingBars: [99], tests: 4, uncarded: ["G7"], repeatCited: false }),
    record({}, { repeatCited: true, namedAlternatives: ["IV"] }),
    record({}, { tests: 3, conventional: true }),
    record({}, { conventional: false }),
  ]);
  assert.deepEqual(s.barsExist, { count: 3, total: 4 });
  assert.deepEqual(s.testsWithinThree, { count: 3, total: 4 }, "three is fine, four is not");
  assert.deepEqual(s.alternativesCarded, { count: 3, total: 4 });
  assert.deepEqual(s.repeatCited, { count: 1, total: 2 }, "only replies with a repeat to cite");
  assert.deepEqual(s.conventional, { count: 1, total: 2 }, "only where it applies");
  const empty = summarize([record({ outcome: "failed", prose: null, score: null })]);
  assert.equal(empty.barsExist, null);
  assert.equal(empty.repeatCited, null);
});

test("resultsTable has a row per tune and kind, the all row, and the baseline", () => {
  const s = summarize([record({})]);
  const baseline = {
    alternatives: { count: 1, total: 1 },
    offTarget: { count: 0, total: 3 },
    clashRate: { count: 0, total: 1 },
  };
  const table = resultsTable({
    byTune: [{ id: "t", kinds: { review: s }, baseline }],
    headline: { ...s, baseline },
  });
  const lines = table.split("\n");
  const width = lines[0].split("|").length;
  assert.ok(
    lines.every((l) => l.split("|").length === width),
    "every row as wide as the header",
  );
  assert.match(table, /\| t \| review \|/);
  assert.match(table, /\| \*\*all\*\* \| baseline \|/);
  assert.match(lines[0], /Named alternatives have cards/);
});

test("formatRate shows the count with the percentage, and a dash for nothing", () => {
  assert.equal(formatRate({ count: 3, total: 12 }), "3/12 (25%)");
  assert.equal(formatRate({ count: 0, total: 0 }), "—");
  assert.equal(formatRate(null), "—");
});
