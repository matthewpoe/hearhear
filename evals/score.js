/**
 * Score an eval run's replies (evals/metrics.js, evals/prose.js), with no
 * requests: run.js calls it on the replies it just collected, and on its own
 * it re-scores a saved run, so a change to the scoring never needs the tutor
 * asked again.
 *
 *   node evals/score.js [path]    # default evals/results/latest.json
 *
 * Writes evals/results/latest.json and the table in evals/results/README.md.
 *
 * FIT_THRESHOLD stays fixed at 0.5, set before any live run. The headline is
 * also reported at 0.4 and 0.6 as a sensitivity line, never to pick one.
 *
 * @import { Rate, SuggestionLike } from "./metrics.js"
 * @import { BaselinePoint, Job } from "./jobs.js"
 * @import { ReplyRecord } from "./summary.js"
 */

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";
import { chordFromNumeral, letterOf, numeralOf, positionOf } from "../src/theory/index.js";
import { buildJobs, jobKey } from "./jobs.js";
import {
  BEAT_TOLERANCE,
  FIT_THRESHOLD,
  baselineChord,
  clashes,
  dropdownTop,
  noteAt,
  rate,
  sameHarmony,
  scoreAlternatives,
  scoreReviewAlternatives,
  scoreSuggestions,
  usesVerdict,
} from "./metrics.js";
import { citesRepeat, missingBars, namedAlternatives, numberedTests } from "./prose.js";
import { formatRate, resultsTable, summarize } from "./summary.js";

/** The fit thresholds the headline is also reported at. Not for tuning. */
export const SENSITIVITY = [0.4, FIT_THRESHOLD, 0.6];

const root = new URL("../", import.meta.url);

/**
 * Did a check's reply include the conventional choice, the dropdown's top
 * pick on the bare melody at the note, among its ideas there? Null when the
 * chord placed there already is that pick, so there is nothing to include.
 * @param {SuggestionLike[]} suggestions
 * @param {Job} job a check
 * @returns {boolean | null}
 */
function conventionalAt(suggestions, job) {
  const melody = { ...job.song, chords: [] };
  const note = noteAt(melody, /** @type {number} */ (job.bar), /** @type {number} */ (job.beat));
  if (!note || !job.placed) return null;
  const top = baselineChord(melody, note.id);
  if (sameHarmony(top, job.placed)) return null;
  return suggestions.some((s) => {
    const chord = chordFromNumeral(s.numeral, melody.key);
    return (
      s.bar === job.bar &&
      Math.abs(s.beat - /** @type {number} */ (job.beat)) < BEAT_TOLERANCE &&
      chord !== null &&
      sameHarmony(chord, top)
    );
  });
}

/**
 * Score one saved reply against the request it answered.
 * @param {ReplyRecord} record
 * @param {Job} job
 * @param {number} threshold
 * @returns {ReplyRecord}
 */
function scoreReply(record, job, threshold) {
  const suggestions = record.outcome === "ok" ? record.suggestions : null;
  if (suggestions === null) {
    return { ...record, score: null, alternatives: null, prose: null };
  }
  const { song, placed, kind, bar, beat } = job;
  const check = kind === "check";
  const melody = { ...song, chords: [] };
  const named = namedAlternatives(record.message, suggestions, song.key, job.chart);
  return {
    ...record,
    score: scoreSuggestions(suggestions, song),
    alternatives: check
      ? scoreAlternatives(
          suggestions,
          melody,
          { bar: /** @type {number} */ (bar), beat: /** @type {number} */ (beat) },
          placed,
          threshold,
        )
      : scoreReviewAlternatives(suggestions, song, threshold),
    prose: {
      verdict: usesVerdict(record.message),
      missingBars: missingBars(record.message, job.bars),
      repeatCited: check ? null : citesRepeat(record.message, job.repeats),
      tests: numberedTests(record.message),
      namedAlternatives: named.alternatives,
      uncarded: named.uncarded,
      conventional: check ? conventionalAt(suggestions, job) : null,
    },
  };
}

/**
 * What the dropdown alone offers at a check's note, scored by the tutor's
 * own rules: its top 3 as suggestions, with the placed chord set aside as
 * for the tutor, and whether its top pick clashes.
 * @param {BaselinePoint} point
 * @param {number} threshold
 */
function baselineAt({ melody, note, placed }, threshold) {
  const { bar, beat } = positionOf(note.start, melody.meter);
  const top = dropdownTop(melody, note.id).map((c) => ({
    bar,
    beat,
    numeral: numeralOf(c, melody.key),
    letter: letterOf(c),
  }));
  return {
    alternatives: scoreAlternatives(top, melody, { bar, beat }, placed, threshold),
    clash: clashes(note.midi, baselineChord(melody, note.id)),
  };
}

/**
 * The baseline over the checks' notes: the dropdown's top 3 judged as
 * alternatives to the placed chord (and their off-target share), and its
 * top pick's clashes.
 * @param {ReturnType<typeof baselineAt>[]} picks
 */
function baselineOf(picks) {
  return {
    alternatives: rate(picks.filter((p) => p.alternatives.alternatives).length, picks.length),
    offTarget: rate(
      picks.reduce((n, p) => n + p.alternatives.offTarget, 0),
      picks.reduce((n, p) => n + p.alternatives.considered, 0),
    ),
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
    // The baseline counts the checks the run reached.
    const checked = tuneRecords.filter((r) => r.kind === "check").length;
    const all = /** @type {BaselinePoint[]} */ (points.get(tune.id));
    const picks = all.slice(0, checked).map((p) => baselineAt(p, threshold));
    allPicks.push(...picks);
    const rows = /** @type {const} */ (["review", "check"])
      .map((kind) => /** @type {const} */ ([kind, tuneRecords.filter((r) => r.kind === kind)]))
      .filter(([, rs]) => rs.length);
    byTune.push({
      id: tune.id,
      title: tune.title,
      case: tune.case,
      points: picks.length,
      kinds: Object.fromEntries(rows.map(([kind, rs]) => [kind, summarize(rs)])),
      baseline: baselineOf(picks),
    });
  }

  const headline = { ...summarize(replies), baseline: baselineOf(allPicks) };
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
    requests: ctx.jobs.length,
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
  const { run, headline, requests } = /** @type {any} */ (results);
  // The repo's Prettier settings (its print width), so `make lint` passes what this writes.
  const config = (await resolveConfig(new URL("evals/results/latest.json", root))) ?? {};
  const style = { printWidth: config.printWidth };
  const json = await format(JSON.stringify(results), { ...style, parser: "json" });
  await writeFile(new URL("evals/results/latest.json", root), json);

  const sensitivity = headline.sensitivity
    .map(
      (/** @type {{ threshold: number, alternatives: Rate, baseline: Rate }} */ s) =>
        `at ${s.threshold.toFixed(1)}, ${formatRate(s.alternatives)} (dropdown ${formatRate(s.baseline)})`,
    )
    .join("; ");
  const readme = `# Eval results

Written by \`node evals/run.js\` and re-scored by \`node evals/score.js\`; don't edit by hand. Metric definitions are in [../README.md](../README.md).

**Run:** ${run.date}, ${run.mode} mode, model \`${run.model}\`. **Requests:** ${requests} a run (${headline.replies} replies here).

${run.note}

${resultsTable(/** @type {any} */ (results))}

The **review** rows are reviews of a whole chart: a hymn with its hymnal's printed chords, or a demo tune with the dropdown's top pick at each downbeat. The **check** rows are "does this work?" questions: a plausible chord placed at one note. The **all** row counts both. The **baseline** rows are the dropdown's top 3 at the checks' notes, judged by the same rule.

**Off-target ideas** (reported on their own, not a veto on the headline): ${formatRate(headline.offTarget)} of the tutor's ideas weren't plausible where they were placed; the dropdown's top 3, ${formatRate(headline.baseline.offTarget)}.

**Threshold sensitivity.** The fit threshold is fixed at ${FIT_THRESHOLD}, set before any live run. Playable alternatives ${sensitivity}.
`;
  await writeFile(
    new URL("evals/results/README.md", root),
    await format(readme, { ...style, parser: "markdown" }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2] ?? new URL("evals/results/latest.json", root);
  const saved = JSON.parse(await readFile(path, "utf8"));
  const results = await scoreResults(saved);
  await writeResults(results);
  console.log(`Re-scored ${results.replies.length} replies, no requests sent.`);
}
