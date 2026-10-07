/**
 * Roll the eval's per-reply records up into rates, and render them as the
 * Markdown table in evals/results/README.md. Pure functions.
 *
 * @import { Rate, SuggestionScore } from "./metrics.js"
 */

import { percentile, rate } from "./metrics.js";

/**
 * One request and what came back.
 * `outcome`: "ok" (a suggestions event), "excluded" (`fallback: true`: the
 * refusal fallback wrote some of it), "invalid" (the server caught output
 * that broke the reply schema), or "failed" (anything else: an HTTP error,
 * an upstream error, a broken stream).
 * @typedef {{
 *   tune: string, level: "nudge" | "comparison" | "answer",
 *   bar: number, beat: number, reference: string,
 *   outcome: "ok" | "excluded" | "invalid" | "failed", code: string | null,
 *   servedBy: string | null, message: string,
 *   schemaValid: boolean, score: SuggestionScore | null, withholds: boolean | null,
 *   ms: number, firstDeltaMs: number | null,
 * }} ReplyRecord
 *
 * @typedef {{
 *   replies: number, excluded: number, failed: number,
 *   schemaValidity: Rate, agreement: Rate, hitRate: Rate | null, clashRate: Rate,
 *   pedagogy: Rate | null,
 *   latencyMs: { p50: number | null, p95: number | null },
 *   firstDeltaMs: { p50: number | null, p95: number | null },
 * }} LevelSummary
 */

/** @param {number | null} ms */
const roundMs = (ms) => (ms === null ? null : Math.round(ms));

/**
 * Summarize replies at one hint level (or a mix). Hit rate counts only
 * comparison and answer replies, pedagogy only nudges; either is null when
 * no reply of its level is in `records`.
 * @param {ReplyRecord[]} records
 * @returns {LevelSummary}
 */
export function summarize(records) {
  const judged = records.filter((r) => r.outcome === "ok" || r.outcome === "invalid");
  const ok = records.filter((r) => r.outcome === "ok");
  const scores = ok.map((r) => /** @type {SuggestionScore} */ (r.score));
  const sum = (/** @type {(s: SuggestionScore) => number} */ pick) =>
    scores.reduce((total, s) => total + pick(s), 0);
  const offering = ok.filter((r) => r.level !== "nudge");
  const nudges = ok.filter((r) => r.level === "nudge");
  const latencies = ok.map((r) => r.ms);
  const firsts = ok.flatMap((r) => (r.firstDeltaMs === null ? [] : [r.firstDeltaMs]));
  return {
    replies: records.length,
    excluded: records.filter((r) => r.outcome === "excluded").length,
    failed: records.filter((r) => r.outcome === "failed").length,
    schemaValidity: rate(judged.filter((r) => r.schemaValid).length, judged.length),
    agreement: rate(
      sum((s) => s.agreeing),
      sum((s) => s.suggestions),
    ),
    hitRate: offering.length
      ? rate(offering.filter((r) => r.score?.hit).length, offering.length)
      : null,
    clashRate: rate(
      sum((s) => s.clashing),
      sum((s) => s.onOnset),
    ),
    pedagogy: nudges.length ? rate(nudges.filter((r) => r.withholds).length, nudges.length) : null,
    latencyMs: { p50: roundMs(percentile(latencies, 50)), p95: roundMs(percentile(latencies, 95)) },
    firstDeltaMs: { p50: roundMs(percentile(firsts, 50)), p95: roundMs(percentile(firsts, 95)) },
  };
}

/**
 * "3/12 (25%)", or "—" when there is nothing to count.
 * @param {Rate | null} r
 */
export function formatRate(r) {
  if (!r || r.total === 0) return "—";
  return `${r.count}/${r.total} (${Math.round((100 * r.count) / r.total)}%)`;
}

/** @param {number | null} ms */
const formatMs = (ms) => (ms === null ? "—" : `${ms} ms`);

/**
 * The results table: one row per tune and hint level, then the baseline.
 * @param {{
 *   byTune: { id: string, levels: Record<string, LevelSummary>, baseline: { hitRate: Rate, clashRate: Rate } }[],
 *   headline: LevelSummary & { baseline: { hitRate: Rate, clashRate: Rate } },
 * }} results
 */
export function resultsTable(results) {
  const header = [
    "Tune",
    "Level",
    "Replies",
    "Excluded",
    "Failed",
    "Schema valid",
    "Numeral = letter",
    "Hit rate",
    "Clash rate",
    "Nudge withholds",
    "Latency p50",
    "Latency p95",
  ];
  /** @param {string} tune @param {string} level @param {LevelSummary} s */
  const row = (tune, level, s) => [
    tune,
    level,
    String(s.replies),
    String(s.excluded),
    String(s.failed),
    formatRate(s.schemaValidity),
    formatRate(s.agreement),
    formatRate(s.hitRate),
    formatRate(s.clashRate),
    formatRate(s.pedagogy),
    formatMs(s.latencyMs.p50),
    formatMs(s.latencyMs.p95),
  ];
  const rows = results.byTune.flatMap((t) =>
    Object.entries(t.levels).map(([level, s]) => row(t.id, level, s)),
  );
  rows.push(row("**all**", "all", results.headline));
  const dash = "—";
  const baselineRow = (
    /** @type {string} */ tune,
    /** @type {{ hitRate: Rate, clashRate: Rate }} */ b,
  ) => [
    tune,
    "baseline",
    ...Array(5).fill(dash),
    formatRate(b.hitRate),
    formatRate(b.clashRate),
    ...Array(3).fill(dash),
  ];
  for (const t of results.byTune) rows.push(baselineRow(t.id, t.baseline));
  rows.push(baselineRow("**all**", results.headline.baseline));
  const line = (/** @type {string[]} */ cells) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}
