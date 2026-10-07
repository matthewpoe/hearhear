/**
 * Run the tutor eval through the same endpoint and request schema the app
 * uses, then score the replies (evals/metrics.js):
 *
 * - every hymn tune in evals/dataset, at every change point, at every hint
 *   level ("ask": what could go here?);
 * - the demo tunes in content/songs, at a few downbeats, at the comparison
 *   level ("ask"), and at a few others with a plausible chord placed there
 *   ("check": does this work?).
 *
 * Writes evals/results/latest.json and the table in evals/results/README.md.
 *
 *   node evals/run.js [--url http://127.0.0.1:8000] [--limit N] [--concurrency N]
 *
 * --limit N sends only the first N requests and prints their summary without
 * writing results: a smoke run before paying for a full live one.
 * --concurrency N keeps up to N requests in flight (default 4, the server's
 * TUTOR_MAX_CONCURRENT), after the first request goes alone. Results keep the
 * requests' order however they finish.
 *
 * Environment: EVAL_URL (instead of --url); TUTOR_ACCESS_CODE, sent as
 * X-Tutor-Access when set (the live tutor requires it).
 *
 * @import { ChordSpec, Song } from "../src/types.js"
 * @import { ReplyRecord } from "./summary.js"
 */

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";
import { format } from "prettier";
import { letterOf, numeralOf, positionOf } from "../src/theory/index.js";
import { DEMO_TUNES, demoPoints, loadDemo } from "./dataset/demos.js";
import { loadTunes } from "./dataset/derive.js";
import {
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
import { runPool } from "./pool.js";
import { evalRequest, evalSnapshot } from "./request.js";
import { resultsTable, summarize } from "./summary.js";
import { AccessError, callTutor } from "./tutorCall.js";

const LEVELS = /** @type {const} */ (["nudge", "comparison", "answer"]);
const root = new URL("../", import.meta.url);
const readJson = async (/** @type {string} */ path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: process.env.EVAL_URL ?? "http://127.0.0.1:8000" },
    limit: { type: "string" },
    concurrency: { type: "string", default: "4" },
  },
});
const baseUrl = /** @type {string} */ (args.url);
const limit = args.limit === undefined ? Infinity : Number(args.limit);
if (limit !== Infinity && !(Number.isInteger(limit) && limit >= 1)) {
  console.error(`--limit takes a whole number of requests, at least 1, not "${args.limit}".`);
  process.exit(1);
}
const concurrency = Number(args.concurrency);
if (!(Number.isInteger(concurrency) && concurrency >= 1)) {
  console.error(`--concurrency takes a whole number, at least 1, not "${args.concurrency}".`);
  process.exit(1);
}
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

const ajv = new Ajv2020({ strict: false });
const checkReply = ajv.compile(await readJson("contracts/tutor-reply.schema.json"));

/**
 * One request to send: a note at one hint level. `reference` is the hymnal's
 * chord there (hymn tunes only); `placed` the chord a "check" request asks about.
 * @typedef {{
 *   tune: string,
 *   kind: "ask" | "check",
 *   song: Song,
 *   reference: ChordSpec | null,
 *   placed: ChordSpec | null,
 *   level: (typeof LEVELS)[number],
 *   bar: number,
 *   beat: number,
 *   body: object,
 * }} Job
 */

/**
 * What the dropdown alone offers at a note, scored by the tutor's own rules:
 * its top 3 as suggestions, and its top pick against any reference.
 * @param {Song} melody
 * @param {import("../src/types.js").Note} note
 * @param {ChordSpec | null} reference
 */
function baselineAt(melody, note, reference) {
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
    alternatives: scoreAlternatives(top, melody, { bar, beat }).alternatives,
    hit: reference ? sameHarmony(pick, reference) : null,
    clash: clashes(note.midi, pick),
  };
}

// Every request in order, first; the first `limit` of them are sent.
/** @type {{ id: string, title: string, case: string }[]} */
const tunes = [];
/** @type {Job[]} */
const jobs = [];
/** The baseline at each note asked about, by tune. */
const baselines = new Map();
for (const tune of await loadTunes()) {
  /** @type {Song} */
  const song = await readJson(`evals/dataset/songs/${tune.id}.json`);
  tunes.push(tune);
  // The tutor and the baseline both see the melody with no chords: what goes there is the question.
  const melody = { ...song, chords: [] };
  const snapshot = evalSnapshot(song);
  const picks = [];
  for (const chord of song.chords) {
    const note = /** @type {import("../src/types.js").Note} */ (
      melody.notes.find((n) => n.id === chord.noteId)
    );
    const { bar, beat } = positionOf(note.start, melody.meter);
    picks.push(baselineAt(melody, note, chord));
    for (const level of LEVELS) {
      const body = evalRequest(snapshot, level, bar, beat);
      jobs.push({
        tune: tune.id,
        kind: "ask",
        song: melody,
        reference: chord,
        placed: null,
        level,
        bar,
        beat,
        body,
      });
    }
  }
  baselines.set(tune.id, picks);
}
for (const id of DEMO_TUNES) {
  const song = await loadDemo(id);
  tunes.push({ id, title: song.title, case: "Demo tune: no reference, judged for plausibility." });
  const melody = { ...song, chords: [] };
  const snapshot = evalSnapshot(song);
  const { ask, check } = demoPoints(song);
  const picks = [];
  for (const note of ask) {
    const { bar, beat } = positionOf(note.start, melody.meter);
    picks.push(baselineAt(melody, note, null));
    const body = evalRequest(snapshot, "comparison", bar, beat);
    jobs.push({
      tune: id,
      kind: "ask",
      song: melody,
      reference: null,
      placed: null,
      level: "comparison",
      bar,
      beat,
      body,
    });
  }
  for (const { note, placed } of check) {
    const { bar, beat } = positionOf(note.start, melody.meter);
    const chord = { id: "c1", noteId: note.id, ...placed };
    const body = evalRequest(
      evalSnapshot(song, [chord]),
      "comparison",
      bar,
      beat,
      numeralOf(placed, song.key),
    );
    jobs.push({
      tune: id,
      kind: "check",
      song: melody,
      reference: null,
      placed,
      level: "comparison",
      bar,
      beat,
      body,
    });
  }
  baselines.set(id, picks);
}
const sent = jobs.slice(0, limit);

/**
 * Send one request and score its reply.
 * @param {Job} job
 * @returns {Promise<ReplyRecord>}
 */
async function run({ tune, kind, song, reference, placed, level, bar, beat, body }) {
  let exchange;
  try {
    exchange = await callTutor(baseUrl, body, accessCode);
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    // No later request would get through: stop the whole run, in-flight ones too.
    console.error(error.message);
    process.exit(1);
  }
  const point = { bar, beat, reference };
  const event = exchange.suggestionsEvent;
  const servedBy = event?.served_by ?? null;
  const reply = event && {
    hint_level: event.hint_level,
    message: exchange.message,
    suggestions: event.suggestions,
  };
  // Suggestions the server rejected as invalid, and valid ones its clamp held back.
  const dropped = typeof event?.dropped === "number" ? event.dropped : null;
  const withheld = typeof event?.withheld === "number" ? event.withheld : null;
  /** @type {ReplyRecord["outcome"]} */
  let outcome = "failed";
  if (exchange.outcome === "ok") outcome = event?.fallback === true ? "excluded" : "ok";
  else if (exchange.code === "invalid_output") outcome = "invalid";
  const scored = outcome === "ok" && reply;
  console.log(`${tune} bar ${bar} beat ${beat} ${kind} ${level}: ${outcome}`);
  return {
    tune,
    kind,
    level,
    bar,
    beat,
    reference: reference ? letterOf(reference) : null,
    placed: placed ? letterOf(placed) : null,
    outcome,
    code: exchange.code,
    servedBy,
    message: exchange.message,
    dropped,
    withheld,
    schemaValid: Boolean(reply && checkReply(reply)),
    score: scored ? scoreSuggestions(reply.suggestions, song, point) : null,
    alternatives:
      scored && level !== "nudge"
        ? scoreAlternatives(reply.suggestions, song, { bar, beat }, placed)
        : null,
    verdict: scored && kind === "check" ? usesVerdict(reply.message) : null,
    withholds:
      scored && level === "nudge"
        ? nudgeWithholds({
            message: reply.message,
            dropped: dropped ?? 0,
            withheld: withheld ?? 0,
          })
        : null,
    ms: Math.round(exchange.ms),
    firstDeltaMs: exchange.firstDeltaMs === null ? null : Math.round(exchange.firstDeltaMs),
  };
}

// The first request alone, then up to `concurrency` in flight, in request order.
/** @type {ReplyRecord[]} */
const records = await runPool(sent, concurrency, run);

/**
 * The baseline over the notes the tutor was asked about: the dropdown's top
 * 3 judged as alternatives, and its top pick against the hymnal's chord.
 * @param {ReturnType<typeof baselineAt>[]} picks
 */
function baselineOf(picks) {
  const referenced = picks.filter((p) => p.reference);
  return {
    alternatives: rate(picks.filter((p) => p.alternatives).length, picks.length),
    hitRate: rate(referenced.filter((p) => p.hit).length, referenced.length),
    clashRate: rate(picks.filter((p) => p.clash).length, picks.length),
  };
}

const byTune = [];
/** @type {ReturnType<typeof baselineAt>[]} */
const allPicks = [];
for (const tune of tunes) {
  const tuneJobs = sent.filter((job) => job.tune === tune.id);
  // A --limit run stops at the first tune it never reached.
  if (tuneJobs.length === 0 && sent.length < jobs.length) break;
  // The baseline counts the notes the tutor was asked about.
  const asked = new Set(tuneJobs.filter((j) => j.kind === "ask").map((j) => `${j.bar}:${j.beat}`));
  const all = baselines.get(tune.id);
  const picks = all.slice(0, asked.size);
  allPicks.push(...picks);
  const tuneRecords = records.filter((r) => r.tune === tune.id);
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

// The model as the server reported it, from the replies it served itself.
const served = [...new Set(records.flatMap((r) => (r.outcome === "ok" ? [r.servedBy] : [])))];
const model = served.join(", ") || "unknown";

const comparisonAsks = records.filter((r) => r.kind === "ask" && r.level === "comparison");
const checks = summarize(records.filter((r) => r.kind === "check"));
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
    alternatives: summarize(comparisonAsks).alternatives,
    beyond: summarize(comparisonAsks).beyond,
    hitRate: summarize(comparisonAsks).hitRate,
    checkAlternatives: checks.checkAlternatives,
    verdictFree: checks.verdictFree,
    baseline: baselineOf(allPicks),
  },
  byTune,
  replies: records,
};

if (limit !== Infinity) {
  console.log(JSON.stringify({ run: results.run, headline: results.headline }, null, 2));
  console.log(`Smoke run of ${records.length} requests: nothing written.`);
  process.exit(0);
}

const json = await format(JSON.stringify(results), { parser: "json" });
await writeFile(new URL("evals/results/latest.json", root), json);

const readme = `# Eval results

Written by \`node evals/run.js\`; don't edit by hand. Metric definitions are in [../README.md](../README.md).

**Run:** ${results.run.date}, ${mode} mode, model \`${model}\`.

${results.run.note}

${resultsTable(results)}

The **all** row's alternatives, beyond-the-obvious, and conventional-choice rates count comparison-level "ask" replies only, as the headline is defined; its "Does this work?" rates count the "check" replies. The **check** rows are the "does this work?" requests: a plausible chord placed at the note, asked about at the comparison level.
`;
await writeFile(
  new URL("evals/results/README.md", root),
  await format(readme, { parser: "markdown" }),
);
console.log(`Wrote evals/results/latest.json and README.md (${records.length} replies).`);
