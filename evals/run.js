/**
 * Run the tutor eval: for every tune in evals/dataset, every change point, and
 * every hint level, ask the tutor what goes there through the same endpoint
 * and request schema the app uses, then score the replies (evals/metrics.js).
 * Writes evals/results/latest.json and the table in evals/results/README.md.
 *
 *   node evals/run.js [--url http://127.0.0.1:8000]
 *
 * Environment: EVAL_URL (instead of --url); TUTOR_MODEL, the model under test
 * in live mode (default claude-opus-5-5); TUTOR_ACCESS_CODE, sent as
 * X-Tutor-Access when set.
 *
 * @import { Song } from "../src/types.js"
 * @import { ReplyRecord } from "./summary.js"
 */

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";
import { format } from "prettier";
import { toTutorSnapshot } from "../src/store/snapshot.js";
import { letterOf, positionOf } from "../src/theory/index.js";
import { loadTunes } from "./dataset/derive.js";
import {
  baselineChord,
  clashes,
  nudgeWithholds,
  rate,
  sameHarmony,
  scoreSuggestions,
} from "./metrics.js";
import { resultsTable, summarize } from "./summary.js";
import { callTutor } from "./tutorCall.js";

const LEVELS = /** @type {const} */ (["nudge", "comparison", "answer"]);
const root = new URL("../", import.meta.url);
const readJson = async (/** @type {string} */ path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const { values: args } = parseArgs({
  options: { url: { type: "string", default: process.env.EVAL_URL ?? "http://127.0.0.1:8000" } },
});
const baseUrl = /** @type {string} */ (args.url);
const accessCode = process.env.TUTOR_ACCESS_CODE || undefined;

const health = await fetch(new URL("/api/health", baseUrl))
  .then((r) => r.json())
  .catch((error) => {
    console.error(
      `Can't reach the tutor at ${baseUrl} (${error.message}). Is \`make dev\` running?`,
    );
    process.exit(1);
  });
const mode = health.tutor_mode === "live" ? "live" : "fixture";
const model = mode === "live" ? (process.env.TUTOR_MODEL ?? "claude-opus-5-5") : "fixture";

const ajv = new Ajv2020({ strict: false });
const checkReply = ajv.compile(await readJson("contracts/tutor-reply.schema.json"));

/** @type {ReplyRecord[]} */
const records = [];
const byTune = [];
const baselineTotals = { hits: 0, clashing: 0, points: 0 };

for (const tune of await loadTunes()) {
  /** @type {Song} */
  const song = await readJson(`evals/dataset/songs/${tune.id}.json`);
  // The tutor sees the melody with no chords: it is asked what goes there.
  const snapshot = toTutorSnapshot({ ...song, chords: [] }, { labelStyle: "roman" });
  const baseline = { hits: 0, clashing: 0 };

  for (const chord of song.chords) {
    const note = /** @type {import("../src/types.js").Note} */ (
      song.notes.find((n) => n.id === chord.noteId)
    );
    const { bar, beat } = positionOf(note.start, song.meter);
    const point = { bar, beat, reference: chord };
    const pick = baselineChord(song, note.id);
    if (sameHarmony(pick, chord)) baseline.hits += 1;
    if (clashes(note.midi, pick)) baseline.clashing += 1;

    for (const level of LEVELS) {
      const exchange = await callTutor(
        baseUrl,
        {
          snapshot,
          hint_level: level,
          question: `What chord could go under the melody note at bar ${bar}, beat ${beat}?`,
          history: [],
        },
        accessCode,
      );
      const event = exchange.suggestionsEvent;
      const servedBy = event?.served_by ?? null;
      const reply = event && {
        hint_level: event.hint_level,
        message: exchange.message,
        suggestions: event.suggestions,
      };
      /** @type {ReplyRecord["outcome"]} */
      let outcome = "failed";
      if (exchange.outcome === "ok") outcome = servedBy === model ? "ok" : "excluded";
      else if (exchange.code === "invalid_output") outcome = "invalid";
      const scored = outcome === "ok" && reply;
      records.push({
        tune: tune.id,
        level,
        bar,
        beat,
        reference: letterOf(chord),
        outcome,
        code: exchange.code,
        servedBy,
        message: exchange.message,
        schemaValid: Boolean(reply && checkReply(reply)),
        score: scored ? scoreSuggestions(reply.suggestions, song, point) : null,
        withholds: scored && level === "nudge" ? nudgeWithholds(reply) : null,
        ms: Math.round(exchange.ms),
        firstDeltaMs: exchange.firstDeltaMs === null ? null : Math.round(exchange.firstDeltaMs),
      });
      console.log(`${tune.id} bar ${bar} beat ${beat} ${level}: ${outcome}`);
    }
  }

  const tuneRecords = records.filter((r) => r.tune === tune.id);
  byTune.push({
    id: tune.id,
    title: tune.title,
    case: tune.case,
    changePoints: song.chords.length,
    levels: Object.fromEntries(
      LEVELS.map((level) => [level, summarize(tuneRecords.filter((r) => r.level === level))]),
    ),
    baseline: {
      hitRate: rate(baseline.hits, song.chords.length),
      clashRate: rate(baseline.clashing, song.chords.length),
    },
  });
  baselineTotals.hits += baseline.hits;
  baselineTotals.clashing += baseline.clashing;
  baselineTotals.points += song.chords.length;
}

const results = {
  run: {
    date: new Date().toISOString(),
    mode,
    model,
    endpoint: new URL("/api/tutor", baseUrl).href,
    note:
      mode === "fixture"
        ? "Fixture run: the server replayed canned replies about a different song, so these numbers measure the plumbing (requests, streaming, parsing, scoring), not the model."
        : `Live run against ${model}.`,
  },
  headline: {
    ...summarize(records),
    hitRate: summarize(records.filter((r) => r.level === "comparison")).hitRate,
    baseline: {
      hitRate: rate(baselineTotals.hits, baselineTotals.points),
      clashRate: rate(baselineTotals.clashing, baselineTotals.points),
    },
  },
  byTune,
  replies: records,
};

const json = await format(JSON.stringify(results), { parser: "json" });
await writeFile(new URL("evals/results/latest.json", root), json);

const readme = `# Eval results

Written by \`node evals/run.js\`; don't edit by hand. Metric definitions are in [../README.md](../README.md).

**Run:** ${results.run.date}, ${mode} mode, model \`${model}\`.

${results.run.note}

${resultsTable(results)}

The **all** row's hit rate counts comparison replies only, as the hit-rate metric is defined at the comparison level.
`;
await writeFile(
  new URL("evals/results/README.md", root),
  await format(readme, { parser: "markdown" }),
);
console.log(`Wrote evals/results/latest.json and README.md (${records.length} replies).`);
