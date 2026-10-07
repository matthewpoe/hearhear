import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRate, summarize } from "../../evals/summary.js";

/**
 * @param {Partial<import("../../evals/summary.js").ReplyRecord>} overrides
 * @returns {import("../../evals/summary.js").ReplyRecord}
 */
const record = (overrides) => ({
  tune: "t",
  kind: "ask",
  level: "comparison",
  bar: 1,
  beat: 1,
  reference: "G",
  placed: null,
  outcome: "ok",
  code: null,
  servedBy: "m",
  message: "",
  dropped: 0,
  withheld: 0,
  schemaValid: true,
  score: { suggestions: 2, agreeing: 2, onOnset: 2, clashing: 0, hit: false },
  alternatives: { atPoint: 2, distinct: 2, plausible: 2, beyond: 1, alternatives: true },
  verdict: null,
  withholds: null,
  ms: 100,
  firstDeltaMs: 40,
  ...overrides,
});

test("summarize counts excluded and failed replies apart from the scored ones", () => {
  const s = summarize([
    record({ score: { suggestions: 2, agreeing: 1, onOnset: 1, clashing: 1, hit: true } }),
    record({ ms: 300 }),
    record({ outcome: "excluded", servedBy: "fallback", score: null, ms: 9999 }),
    record({ outcome: "failed", code: "upstream", schemaValid: false, score: null }),
    record({ outcome: "invalid", code: "invalid_output", schemaValid: false, score: null }),
  ]);
  assert.equal(s.replies, 5);
  assert.equal(s.excluded, 1);
  assert.equal(s.failed, 1);
  assert.deepEqual(s.schemaValidity, { count: 2, total: 3 }, "invalid output counts against");
  assert.deepEqual(s.agreement, { count: 3, total: 4 });
  assert.deepEqual(s.hitRate, { count: 1, total: 2 });
  assert.deepEqual(s.clashRate, { count: 1, total: 3 });
  assert.equal(s.pedagogy, null, "no nudges");
  assert.deepEqual(s.latencyMs, { p50: 100, p95: 300 }, "excluded replies don't count");
});

test("summarize scores pedagogy on nudges only, and hit rate never on them", () => {
  const s = summarize([
    record({ level: "nudge", withholds: true }),
    record({ level: "nudge", withholds: false }),
  ]);
  assert.deepEqual(s.pedagogy, { count: 1, total: 2 });
  assert.equal(s.hitRate, null);
});

test("summarize counts the nudges the server had to clamp", () => {
  const s = summarize([
    record({ level: "nudge", withholds: true }),
    record({ level: "nudge", withholds: false, withheld: 2 }),
    record({ level: "nudge", withholds: false, withheld: 1 }),
    record({ level: "nudge", withholds: false, dropped: 1 }),
    record({ level: "comparison", withheld: 3 }),
  ]);
  assert.deepEqual(s.nudgesClamped, { count: 2, total: 4 }, "withheld nudges only");
  assert.equal(summarize([record({})]).nudgesClamped, null, "no nudges");
});

test("summarize scores alternatives on asks, beyond over plausible ones, and checks apart", () => {
  const none = { atPoint: 1, distinct: 1, plausible: 1, beyond: 0, alternatives: false };
  const s = summarize([
    record({}),
    record({ level: "answer", reference: null, alternatives: none }),
    record({ level: "nudge", alternatives: null }),
    record({ kind: "check", reference: null, placed: "C", verdict: true }),
    record({ kind: "check", reference: null, placed: "C", verdict: false, alternatives: none }),
  ]);
  assert.deepEqual(s.alternatives, { count: 1, total: 2 }, "asks at comparison and answer");
  assert.deepEqual(s.beyond, { count: 1, total: 3 });
  assert.deepEqual(s.hitRate, { count: 0, total: 1 }, "only replies with a reference");
  assert.deepEqual(s.checkAlternatives, { count: 1, total: 2 });
  assert.deepEqual(s.verdictFree, { count: 1, total: 2 });
  assert.equal(summarize([record({})]).checkAlternatives, null, "no checks");
});

test("formatRate shows the count with the percentage, and a dash for nothing", () => {
  assert.equal(formatRate({ count: 3, total: 12 }), "3/12 (25%)");
  assert.equal(formatRate({ count: 0, total: 0 }), "—");
  assert.equal(formatRate(null), "—");
});
