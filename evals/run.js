/**
 * Run the tutor eval through the same endpoint and request schema the app
 * uses (the requests: evals/jobs.js), then score the replies with
 * evals/score.js, which can also re-score a saved run with no requests.
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
 * @import { Job } from "./jobs.js"
 * @import { ReplyRecord } from "./summary.js"
 */

import { parseArgs } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";
import { letterOf } from "../src/theory/index.js";
import { buildJobs, readJson } from "./jobs.js";
import { runPool } from "./pool.js";
import { scoreResults, writeResults } from "./score.js";
import { AccessError, callTutor } from "./tutorCall.js";

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

// Every request in order, first; the first `limit` of them are sent.
const ctx = await buildJobs();
const sent = ctx.jobs.slice(0, limit);

/**
 * Send one request and record its reply; score.js scores it.
 * @param {Job} job
 * @returns {Promise<ReplyRecord>}
 */
async function run({ tune, kind, mode, placed, bar, beat, body }) {
  let exchange;
  try {
    exchange = await callTutor(baseUrl, body, accessCode);
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    // No later request would get through: stop the whole run, in-flight ones too.
    console.error(error.message);
    process.exit(1);
  }
  const event = exchange.suggestionsEvent;
  const servedBy = event?.served_by ?? null;
  const reply = event && {
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
  const where = bar === null ? "" : ` bar ${bar} beat ${beat}`;
  console.log(`${tune}${where} ${kind}: ${outcome}`);
  return {
    tune,
    kind,
    mode,
    bar,
    beat,
    placed: placed ? letterOf(placed) : null,
    outcome,
    code: exchange.code,
    servedBy,
    message: exchange.message,
    suggestions: reply ? reply.suggestions : null,
    dropped,
    withheld,
    schemaValid: Boolean(reply && checkReply(reply)),
    score: null,
    alternatives: null,
    prose: null,
    ms: Math.round(exchange.ms),
    firstDeltaMs: exchange.firstDeltaMs === null ? null : Math.round(exchange.firstDeltaMs),
  };
}

// The first request alone, then up to `concurrency` in flight, in request order.
/** @type {ReplyRecord[]} */
const records = await runPool(sent, concurrency, run);

// The model as the server reported it, from the replies it served itself.
const served = [...new Set(records.flatMap((r) => (r.outcome === "ok" ? [r.servedBy] : [])))];
const model = served.join(", ") || "unknown";

const results = await scoreResults(
  {
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
    replies: records,
  },
  ctx,
);

if (limit !== Infinity) {
  console.log(JSON.stringify({ run: results.run, headline: results.headline }, null, 2));
  console.log(`Smoke run of ${records.length} requests: nothing written.`);
  process.exit(0);
}

await writeResults(results);
console.log(`Wrote evals/results/latest.json and README.md (${records.length} replies).`);
