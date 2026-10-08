/**
 * Roll the eval's per-reply records up into rates, and render them as the
 * Markdown table in evals/results/README.md. Pure functions.
 *
 * @import { AlternativesScore, Rate, SuggestionLike, SuggestionScore } from "./metrics.js"
 */

import { percentile, rate } from "./metrics.js";

/**
 * One request and what came back.
 * `kind`: "ask" (what could go here?) or "check" (does this placed chord
 * work?). `reference`: the hymnal's chord there, null for a demo tune.
 * `placed`: the chord a "check" asks about.
 * `outcome`: "ok" (a suggestions event), "excluded" (`fallback: true`: the
 * refusal fallback wrote some of it), "invalid" (the server caught output
 * that broke the reply schema), or "failed" (anything else: an HTTP error,
 * an upstream error, a broken stream).
 * @typedef {{
 *   tune: string, kind: "ask" | "check", level: "nudge" | "comparison" | "answer",
 *   bar: number, beat: number, reference: string | null, placed: string | null,
 *   outcome: "ok" | "excluded" | "invalid" | "failed", code: string | null,
 *   servedBy: string | null, message: string,
 *   suggestions: SuggestionLike[] | null,
 *   dropped: number | null, withheld: number | null,
 *   schemaValid: boolean, score: SuggestionScore | null,
 *   alternatives: AlternativesScore | null, verdict: boolean | null,
 *   withholds: boolean | null,
 *   ms: number, firstDeltaMs: number | null,
 * }} ReplyRecord
 *
 * `suggestions`: the suggestions event's list as the server sent it (null
 * without an event), kept so evals/score.js can re-score a run without asking
 * again. `score`, `alternatives`, `verdict`, and `withholds` are that scoring.
 *
 * `dropped` and `withheld`: the suggestions event's counts of suggestions the
 * server rejected as invalid and valid ones its hint-level clamp held back
 * (null without an event). At a nudge, together they are everything the
 * model offered, since the server withholds every suggestion there.
 *
 * @typedef {{
 *   replies: number, excluded: number, failed: number,
 *   schemaValidity: Rate, agreement: Rate,
 *   alternatives: Rate | null, beyond: Rate | null, offTarget: Rate | null,
 *   hitRate: Rate | null, clashRate: Rate,
 *   checkAlternatives: Rate | null, checkOffTarget: Rate | null,
 *   verdictFree: Rate | null,
 *   pedagogy: Rate | null, nudgesClamped: Rate | null,
 *   latencyMs: { p50: number | null, p95: number | null },
 *   firstDeltaMs: { p50: number | null, p95: number | null },
 * }} LevelSummary
 */

/** @param {number | null} ms */
const roundMs = (ms) => (ms === null ? null : Math.round(ms));

/**
 * The share of the ideas weighed at the note that aren't plausible.
 * @param {AlternativesScore[]} alts
 */
const offTargetOf = (alts) =>
  rate(
    alts.reduce((n, a) => n + a.offTarget, 0),
    alts.reduce((n, a) => n + a.considered, 0),
  );

/**
 * Summarize replies at one hint level (or a mix). Alternatives, beyond, and
 * off-target count "ask" replies at comparison and answer; hit rate
 * ("includes the conventional choice") only those with a hymnal reference;
 * the "does this work?" rates only "check" replies, and a check counts as
 * answered with options only when it has playable alternatives and no
 * verdict words; pedagogy and clamped nudges only nudges. Each is null when
 * no reply of its kind is in `records`. A clamped nudge is one where the
 * server's clamp held back suggestions the model offered (`withheld` > 0).
 * @param {ReplyRecord[]} records
 * @returns {LevelSummary}
 */
export function summarize(records) {
  const judged = records.filter((r) => r.outcome === "ok" || r.outcome === "invalid");
  const ok = records.filter((r) => r.outcome === "ok");
  const scores = ok.map((r) => /** @type {SuggestionScore} */ (r.score));
  const sum = (/** @type {(s: SuggestionScore) => number} */ pick) =>
    scores.reduce((total, s) => total + pick(s), 0);
  const asks = ok.filter((r) => r.kind !== "check" && r.level !== "nudge");
  const referenced = asks.filter((r) => r.reference);
  const checks = ok.filter((r) => r.kind === "check");
  const nudges = ok.filter((r) => r.level === "nudge");
  const alts = asks.map((r) => /** @type {AlternativesScore} */ (r.alternatives));
  const checkAlts = checks.map((r) => /** @type {AlternativesScore} */ (r.alternatives));
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
    alternatives: asks.length ? rate(alts.filter((a) => a.alternatives).length, asks.length) : null,
    beyond: asks.length
      ? rate(
          alts.reduce((n, a) => n + a.beyond, 0),
          alts.reduce((n, a) => n + a.plausible, 0),
        )
      : null,
    offTarget: asks.length ? offTargetOf(alts) : null,
    hitRate: referenced.length
      ? rate(referenced.filter((r) => r.score?.hit).length, referenced.length)
      : null,
    clashRate: rate(
      sum((s) => s.clashing),
      sum((s) => s.onOnset),
    ),
    checkAlternatives: checks.length
      ? rate(checks.filter((r) => r.alternatives?.alternatives && !r.verdict).length, checks.length)
      : null,
    checkOffTarget: checks.length ? offTargetOf(checkAlts) : null,
    verdictFree: checks.length
      ? rate(checks.filter((r) => !r.verdict).length, checks.length)
      : null,
    pedagogy: nudges.length ? rate(nudges.filter((r) => r.withholds).length, nudges.length) : null,
    nudgesClamped: nudges.length
      ? rate(nudges.filter((r) => (r.withheld ?? 0) > 0).length, nudges.length)
      : null,
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
 * @typedef {{ alternatives: Rate, offTarget: Rate, hitRate: Rate, clashRate: Rate }} Baseline
 */

/**
 * The results table: one row per tune and hint level (and "check" for the
 * "does this work?" requests), then the baseline.
 * @param {{
 *   byTune: { id: string, levels: Record<string, LevelSummary>, baseline: Baseline }[],
 *   headline: LevelSummary & { baseline: Baseline },
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
    "Playable alternatives",
    "Beyond the obvious",
    "Off-target ideas",
    "Does this work? options, no verdict",
    "Does this work? off-target",
    "No verdict words",
    "Includes the conventional choice",
    "Clash rate",
    "Nudge withholds",
    "Nudges clamped",
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
    formatRate(s.alternatives),
    formatRate(s.beyond),
    formatRate(s.offTarget),
    formatRate(s.checkAlternatives),
    formatRate(s.checkOffTarget),
    formatRate(s.verdictFree),
    formatRate(s.hitRate),
    formatRate(s.clashRate),
    formatRate(s.pedagogy),
    formatRate(s.nudgesClamped),
    formatMs(s.latencyMs.p50),
    formatMs(s.latencyMs.p95),
  ];
  const rows = results.byTune.flatMap((t) =>
    Object.entries(t.levels).map(([level, s]) => row(t.id, level, s)),
  );
  rows.push(row("**all**", "all", results.headline));
  const dash = "—";
  const baselineRow = (/** @type {string} */ tune, /** @type {Baseline} */ b) => [
    tune,
    "baseline",
    ...Array(5).fill(dash),
    formatRate(b.alternatives),
    dash,
    formatRate(b.offTarget),
    ...Array(3).fill(dash),
    formatRate(b.hitRate),
    formatRate(b.clashRate),
    ...Array(4).fill(dash),
  ];
  for (const t of results.byTune) rows.push(baselineRow(t.id, t.baseline));
  rows.push(baselineRow("**all**", results.headline.baseline));
  const line = (/** @type {string[]} */ cells) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}
