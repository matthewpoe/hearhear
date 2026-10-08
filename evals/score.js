/**
 * Score an eval run's replies (evals/metrics.js), with no requests: run.js
 * calls it on the replies it just collected, and on its own it re-scores a
 * saved run, so a change to the scoring never needs the tutor asked again.
 *
 *   node evals/score.js [path]    # default evals/results/latest.json
 *
 * Writes evals/results/latest.json and the table in evals/results/README.md.
 *
 * FIT_THRESHOLD stays fixed at 0.5, set before any live run. The headline is
 * also reported at 0.4 and 0.6 as a sensitivity line, never to pick one.
 *
 * @import { Rate } from "./metrics.js"
 * @import { BaselinePoint, Job } from "./jobs.js"
 * @import { ReplyRecord } from "./summary.js"
 */

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { format } from "prettier";
import { letterOf, numeralOf, positionOf } from "../src/theory/index.js";
import { LEVELS, buildJobs, jobKey } from "./jobs.js";
import {
  FIT_THRESHOLD,
  baselineChord,
  clashes,
  dropdownTop,
  nudgeWithholds,
  rate,
  sameHarmony,
  scoreAlternatives,
  scoreSuggestions,
  usesVerdict,
} from "./metrics.js";
import { formatRate, resultsTable, summarize } from "./summary.js";

/** The fit thresholds the headline is also reported at. Not for tuning. */
export const SENSITIVITY = [0.4, FIT_THRESHOLD, 0.6];

const root = new URL("../", import.meta.url);

/**
 * Score one saved reply against the request it answered.
 * @param {ReplyRecord} record
 * @param {Job} job
 * @param {number} threshold
 * @returns {ReplyRecord}
 */
function scoreReply(record, job, threshold) {
  const { song, reference, placed, kind, level, bar, beat } = job;
  const suggestions = record.outcome === "ok" ? record.suggestions : null;
  const scored = suggestions !== null;
  return {
    ...record,
    score: scored ? scoreSuggestions(suggestions, song, { bar, beat, reference }) : null,
    alternatives:
      scored && level !== "nudge"
        ? scoreAlternatives(suggestions, song, { bar, beat }, placed, threshold)
        : null,
    verdict: scored && kind === "check" ? usesVerdict(record.message) : null,
    withholds:
      scored && level === "nudge"
        ? nudgeWithholds({
            message: record.message,
            dropped: record.dropped ?? 0,
            withheld: record.withheld ?? 0,
          })
        : null,
  };
}

/**
 * What the dropdown alone offers at a note, scored by the tutor's own rules:
 * its top 3 as suggestions, and its top pick against any reference.
 * @param {BaselinePoint} point
 * @param {number} threshold
 */
function baselineAt({ melody, note, reference }, threshold) {
  const { bar, beat } = positionOf(note.start, melody.meter);
  const top = dropdownTop(melody, note.id).map((c) => ({
    bar,
    beat,
    numeral: numeralOf(c, melody.key),
    letter: letterOf(c),
  }));
  const pick = baselineChord(melody, note.id);
  return {
    reference,
    alternatives: scoreAlternatives(top, melody, { bar, beat }, null, threshold),
    hit: reference ? sameHarmony(pick, reference) : null,
    clash: clashes(note.midi, pick),
  };
}

/**
 * The baseline over the notes the tutor was asked about: the dropdown's top
 * 3 judged as alternatives (and their off-target share), and its top pick
 * against the hymnal's chord.
 * @param {ReturnType<typeof baselineAt>[]} picks
 */
function baselineOf(picks) {
  const referenced = picks.filter((p) => p.reference);
  return {
    alternatives: rate(picks.filter((p) => p.alternatives.alternatives).length, picks.length),
    offTarget: rate(
      picks.reduce((n, p) => n + p.alternatives.offTarget, 0),
      picks.reduce((n, p) => n + p.alternatives.considered, 0),
    ),
    hitRate: rate(referenced.filter((p) => p.hit).length, referenced.length),
    clashRate: rate(picks.filter((p) => p.clash).length, picks.length),
  };
}

/**
 * Score every reply and roll them up, at one fit threshold.
 * @param {ReplyRecord[]} saved
 * @param {Awaited<ReturnType<typeof buildJobs>>} ctx
 * @param {number} threshold
 */
function scoreAt(saved, { tunes, jobs, points }, threshold) {
  const byKey = new Map(jobs.map((j) => [jobKey(j), j]));
  const replies = saved.map((record) => {
    const job = byKey.get(jobKey(record));
    if (!job) throw new Error(`No request matches the saved reply ${jobKey(record)}.`);
    return scoreReply(record, job, threshold);
  });

  const byTune = [];
  /** @type {ReturnType<typeof baselineAt>[]} */
  const allPicks = [];
  for (const tune of tunes) {
    const tuneRecords = replies.filter((r) => r.tune === tune.id);
    // A --limit run stops partway: only the tunes it reached.
    if (tuneRecords.length === 0) continue;
    // The baseline counts the notes the tutor was asked about.
    const asked = new Set(
      tuneRecords.filter((r) => r.kind === "ask").map((r) => `${r.bar}:${r.beat}`),
    );
    const all = /** @type {BaselinePoint[]} */ (points.get(tune.id));
    const picks = all.slice(0, asked.size).map((p) => baselineAt(p, threshold));
    allPicks.push(...picks);
    const rows = [
      ...LEVELS.map((level) => [
        level,
        tuneRecords.filter((r) => r.kind === "ask" && r.level === level),
      ]),
      ["check", tuneRecords.filter((r) => r.kind === "check")],
    ].filter(([, rs]) => rs.length);
    byTune.push({
      id: tune.id,
      title: tune.title,
      case: tune.case,
      points: picks.length,
      levels: Object.fromEntries(
        rows.map(([level, rs]) => [level, summarize(/** @type {ReplyRecord[]} */ (rs))]),
      ),
      baseline: baselineOf(picks),
    });
  }

  const comparisonAsks = summarize(
    replies.filter((r) => r.kind === "ask" && r.level === "comparison"),
  );
  const checks = summarize(replies.filter((r) => r.kind === "check"));
  const headline = {
    ...summarize(replies),
    alternatives: comparisonAsks.alternatives,
    beyond: comparisonAsks.beyond,
    offTarget: comparisonAsks.offTarget,
    hitRate: comparisonAsks.hitRate,
    checkAlternatives: checks.checkAlternatives,
    checkOffTarget: checks.checkOffTarget,
    verdictFree: checks.verdictFree,
    baseline: baselineOf(allPicks),
  };
  return { headline, byTune, replies };
}

/**
 * Score a run's saved replies, with no requests. Each reply must carry the
 * `suggestions` the server sent.
 * @param {{ run: object, replies: ReplyRecord[] }} saved
 * @param {Awaited<ReturnType<typeof buildJobs>>} [ctx] the run's requests, if already built
 */
export async function scoreResults(saved, ctx) {
  const unsaved = saved.replies.find((r) => r.outcome === "ok" && !Array.isArray(r.suggestions));
  if (unsaved) {
    throw new Error(
      `The reply ${jobKey(unsaved)} has no saved suggestions to score (a run from before score.js). Run node evals/run.js again.`,
    );
  }
  ctx ??= await buildJobs();
  const scored = scoreAt(saved.replies, ctx, FIT_THRESHOLD);
  /** @type {{ threshold: number, alternatives: Rate | null, baseline: Rate }[]} */
  const sensitivity = SENSITIVITY.map((threshold) => {
    const { headline } =
      threshold === FIT_THRESHOLD ? scored : scoreAt(saved.replies, ctx, threshold);
    return {
      threshold,
      alternatives: headline.alternatives,
      baseline: headline.baseline.alternatives,
    };
  });
  return {
    run: saved.run,
    headline: { ...scored.headline, sensitivity },
    byTune: scored.byTune,
    replies: scored.replies,
  };
}

/**
 * Write a scored run to evals/results: latest.json, and README.md's table.
 * @param {Awaited<ReturnType<typeof scoreResults>>} results
 */
export async function writeResults(results) {
  const { run, headline } = /** @type {any} */ (results);
  const json = await format(JSON.stringify(results), { parser: "json" });
  await writeFile(new URL("evals/results/latest.json", root), json);

  const sensitivity = headline.sensitivity
    .map(
      (/** @type {{ threshold: number, alternatives: Rate, baseline: Rate }} */ s) =>
        `at ${s.threshold.toFixed(1)}, ${formatRate(s.alternatives)} (dropdown ${formatRate(s.baseline)})`,
    )
    .join("; ");
  const readme = `# Eval results

Written by \`node evals/run.js\` and re-scored by \`node evals/score.js\`; don't edit by hand. Metric definitions are in [../README.md](../README.md).

**Run:** ${run.date}, ${run.mode} mode, model \`${run.model}\`.

${run.note}

${resultsTable(/** @type {any} */ (results))}

The **all** row's alternatives, beyond-the-obvious, off-target, and conventional-choice rates count comparison-level "ask" replies only, as the headline is defined; its "Does this work?" rates count the "check" replies. The **check** rows are the "does this work?" requests: a plausible chord placed at the note, asked about at the comparison level.

**Off-target ideas** (reported on their own, not a veto on the headline): ${formatRate(headline.offTarget)} of the tutor's ideas at the note asked about weren't plausible there; the dropdown's top 3, ${formatRate(headline.baseline.offTarget)}.

**Threshold sensitivity.** The fit threshold is fixed at ${FIT_THRESHOLD}, set before any live run. Playable alternatives ${sensitivity}.
`;
  await writeFile(
    new URL("evals/results/README.md", root),
    await format(readme, { parser: "markdown" }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? new URL("evals/results/latest.json", root);
  const saved = JSON.parse(await readFile(path, "utf8"));
  const results = await scoreResults(saved);
  await writeResults(results);
  console.log(`Re-scored ${results.replies.length} replies, no requests sent.`);
}
