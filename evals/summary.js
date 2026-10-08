/**
 * Roll the eval's per-reply records up into rates, and render them as the
 * Markdown table in evals/results/README.md. Pure functions.
 *
 * @import { AlternativesScore, Rate, SuggestionLike, SuggestionScore } from "./metrics.js"
 */

import { percentile, rate } from "./metrics.js";

/**
 * What a reply's message says, read by rule (evals/prose.js): whether it
 * passes a verdict, the bars it cites that the song doesn't have, whether it
 * cites a melody repeat at both places (null for a check, or a melody with
 * none), how many numbered tests it lists, the chords it names as
 * alternatives and those with no card, and, for a check, whether its ideas
 * include the conventional choice (null when the placed chord is it).
 * @typedef {{
 *   verdict: boolean, missingBars: number[], repeatCited: boolean | null,
 *   tests: number, namedAlternatives: string[], uncarded: string[],
 *   conventional: boolean | null,
 * }} ProseScore
 */

/**
 * One request and what came back.
 * `kind`: "review" (the whole chart, mode "review") or "check" (does this
 * placed chord work?, mode "question"). `bar`, `beat`, `placed`: where a
 * check asks and the chord placed there, null for a review.
 * `outcome`: "ok" (a suggestions event), "excluded" (`fallback: true`: the
 * refusal fallback wrote some of it), "invalid" (the server caught output
 * that broke the reply schema), or "failed" (anything else: an HTTP error,
 * an upstream error, a broken stream).
 * @typedef {{
 *   tune: string, kind: "review" | "check", mode: "review" | "question",
 *   bar: number | null, beat: number | null, placed: string | null,
 *   outcome: "ok" | "excluded" | "invalid" | "failed", code: string | null,
 *   servedBy: string | null, message: string,
 *   suggestions: SuggestionLike[] | null,
 *   dropped: number | null, withheld: number | null,
 *   schemaValid: boolean, score: SuggestionScore | null,
 *   alternatives: AlternativesScore | null, prose: ProseScore | null,
 *   ms: number, firstDeltaMs: number | null,
 * }} ReplyRecord
 *
 * `suggestions`: the suggestions event's list as the server sent it (null
 * without an event), kept so evals/score.js can re-score a run without asking
 * again. `score`, `alternatives`, and `prose` are that scoring.
 *
 * `dropped` and `withheld`: the suggestions event's counts of suggestions the
 * server rejected as invalid and valid ones its hidden-key clamp held back
 * (null without an event).
 *
 * @typedef {{
 *   replies: number, excluded: number, failed: number,
 *   schemaValidity: Rate, agreement: Rate,
 *   alternatives: Rate | null, beyond: Rate | null, offTarget: Rate | null,
 *   checkAlternatives: Rate | null,
 *   verdictFree: Rate | null, barsExist: Rate | null, repeatCited: Rate | null,
 *   testsWithinThree: Rate | null, alternativesCarded: Rate | null,
 *   conventional: Rate | null, clashRate: Rate,
 *   latencyMs: { p50: number | null, p95: number | null },
 *   firstDeltaMs: { p50: number | null, p95: number | null },
 * }} KindSummary
 */

/** The most numbered tests a reply should list. */
export const MAX_TESTS = 3;

/** @param {number | null} ms */
const roundMs = (ms) => (ms === null ? null : Math.round(ms));

/**
 * Summarize replies of one kind (or a mix). Every rate counts scored ("ok")
 * replies, each null when none is in `records`: alternatives, beyond, and
 * off-target all of them; the "does this work?" rate only checks, which
 * count as answered with options when they have playable alternatives and
 * no verdict words; the repeat rate only replies whose request has a repeat
 * to cite; the conventional choice only checks where the placed chord isn't
 * already it.
 * @param {ReplyRecord[]} records
 * @returns {KindSummary}
 */
export function summarize(records) {
  const judged = records.filter((r) => r.outcome === "ok" || r.outcome === "invalid");
  const ok = records.filter((r) => r.outcome === "ok");
  const scores = ok.map((r) => /** @type {SuggestionScore} */ (r.score));
  const sum = (/** @type {(s: SuggestionScore) => number} */ pick) =>
    scores.reduce((total, s) => total + pick(s), 0);
  const alts = ok.map((r) => /** @type {AlternativesScore} */ (r.alternatives));
  const prose = ok.map((r) => /** @type {ProseScore} */ (r.prose));
  const checks = ok.filter((r) => r.kind === "check");
  const share = (/** @type {(p: ProseScore) => boolean} */ pass) =>
    ok.length ? rate(prose.filter(pass).length, ok.length) : null;
  const repeats = prose.filter((p) => p.repeatCited !== null);
  const conventional = prose.filter((p) => p.conventional !== null);
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
    alternatives: ok.length ? rate(alts.filter((a) => a.alternatives).length, ok.length) : null,
    beyond: ok.length
      ? rate(
          alts.reduce((n, a) => n + a.beyond, 0),
          alts.reduce((n, a) => n + a.plausible, 0),
        )
      : null,
    offTarget: ok.length
      ? rate(
          alts.reduce((n, a) => n + a.offTarget, 0),
          alts.reduce((n, a) => n + a.considered, 0),
        )
      : null,
    checkAlternatives: checks.length
      ? rate(
          checks.filter((r) => r.alternatives?.alternatives && !r.prose?.verdict).length,
          checks.length,
        )
      : null,
    verdictFree: share((p) => !p.verdict),
    barsExist: share((p) => p.missingBars.length === 0),
    repeatCited: repeats.length
      ? rate(repeats.filter((p) => p.repeatCited).length, repeats.length)
      : null,
    testsWithinThree: share((p) => p.tests <= MAX_TESTS),
    alternativesCarded: share((p) => p.uncarded.length === 0),
    conventional: conventional.length
      ? rate(conventional.filter((p) => p.conventional).length, conventional.length)
      : null,
    clashRate: rate(
      sum((s) => s.clashing),
      sum((s) => s.onOnset),
    ),
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
 * @typedef {{ alternatives: Rate, offTarget: Rate, clashRate: Rate }} Baseline
 */

/**
 * The results table: one row per tune and kind of request, then the
 * baseline.
 * @param {{
 *   byTune: { id: string, kinds: Record<string, KindSummary>, baseline: Baseline }[],
 *   headline: KindSummary & { baseline: Baseline },
 * }} results
 */
export function resultsTable(results) {
  const header = [
    "Tune",
    "Request",
    "Replies",
    "Excluded",
    "Failed",
    "Schema valid",
    "Numeral = letter",
    "Playable alternatives",
    "Beyond the obvious",
    "Off-target ideas",
    "Does this work? options, no verdict",
    "No verdict words",
    "Cited bars exist",
    "Repeat cited at both places",
    "At most three tests",
    "Named alternatives have cards",
    "Includes the conventional choice",
    "Clash rate",
    "Latency p50",
    "Latency p95",
  ];
  /** @param {string} tune @param {string} kind @param {KindSummary} s */
  const row = (tune, kind, s) => [
    tune,
    kind,
    String(s.replies),
    String(s.excluded),
    String(s.failed),
    formatRate(s.schemaValidity),
    formatRate(s.agreement),
    formatRate(s.alternatives),
    formatRate(s.beyond),
    formatRate(s.offTarget),
    formatRate(s.checkAlternatives),
    formatRate(s.verdictFree),
    formatRate(s.barsExist),
    formatRate(s.repeatCited),
    formatRate(s.testsWithinThree),
    formatRate(s.alternativesCarded),
    formatRate(s.conventional),
    formatRate(s.clashRate),
    formatMs(s.latencyMs.p50),
    formatMs(s.latencyMs.p95),
  ];
  const rows = results.byTune.flatMap((t) =>
    Object.entries(t.kinds).map(([kind, s]) => row(t.id, kind, s)),
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
    ...Array(7).fill(dash),
    formatRate(b.clashRate),
    dash,
    dash,
  ];
  for (const t of results.byTune)
    if (t.baseline.alternatives.total) rows.push(baselineRow(t.id, t.baseline));
  rows.push(baselineRow("**all**", results.headline.baseline));
  const line = (/** @type {string[]} */ cells) => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}
