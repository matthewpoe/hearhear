/**
 * Record the demo's lessons from the live tutor: every exchange in
 * content/lessons/plan.json goes to POST /api/tutor with the snapshot the app
 * would send, and the full event sequence is saved, with its timing, to
 * content/lessons/recorded/<id>.json in the shape of
 * contracts/fixtures/tutor/*.json, so a fixture replay can play it back.
 *
 *   node scripts/capture-lessons.js --url http://127.0.0.1:8000
 *   node scripts/capture-lessons.js --estimate   (no network: count and size)
 *   node scripts/capture-lessons.js --url … --only ode-ending
 *
 * A reply a fallback model served, an error event, or a reply that fails
 * scripts/contentChecks.js is reported and not saved; the run moves on. The
 * access gate's refusals stop the run. Run it through `make capture-lessons`,
 * which starts a live server and asks before spending anything.
 *
 * Environment: TUTOR_ACCESS_CODE, sent as X-Tutor-Access when set.
 *
 * @import { Song } from "../src/types.js"
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { format } from "prettier";
import { AccessError, callTutor } from "../evals/tutorCall.js";
import { createSongStore } from "../src/store/song.js";
import { toTutorSnapshot } from "../src/store/snapshot.js";
import { chordFromNumeral, positionOf } from "../src/theory/index.js";
import { eventFailures, recordedFailures } from "./contentChecks.js";

const root = new URL("../", import.meta.url);
const readJson = async (/** @type {URL} */ url) => JSON.parse(await readFile(url, "utf8"));

/**
 * @typedef {{
 *   id: string, label?: string, song: string, follows?: string,
 *   key: "committed" | "provisional", key_hidden?: boolean,
 *   chords: { bar: number, beat: number, numeral: string }[],
 *   hint_level: "nudge" | "comparison" | "answer", question: string,
 * }} PlannedExchange
 * @typedef {{ role: "student" | "tutor", text: string }} Turn
 */

/** @param {string} id */
export const loadSong = async (id) =>
  /** @type {Promise<Song>} */ (readJson(new URL(`content/songs/${id}.json`, root)));

/**
 * The snapshot the app would send for this song state: the song loaded into a
 * song store, its key committed or left provisional, and each chord placed on
 * the note at its bar and beat, as the student would.
 * @param {Song} song
 * @param {PlannedExchange} planned
 */
export function snapshotFor(song, planned) {
  const store = createSongStore();
  store.load({ ...song, chords: [] });
  store.rekey({ ...song.key, provisional: planned.key !== "committed" });
  for (const { bar, beat, numeral } of planned.chords) {
    const current = store.get();
    const note = current.notes.find((n) => {
      const p = positionOf(n.start, current.meter);
      return p.bar === bar && p.beat === beat;
    });
    if (!note) throw new Error(`${planned.id}: no note at bar ${bar} beat ${beat} in ${song.id}`);
    const chord = chordFromNumeral(numeral, current.key);
    if (!chord) throw new Error(`${planned.id}: ${numeral} is not a numeral`);
    store.setChord(note.id, chord);
  }
  return toTutorSnapshot(store.get(), {
    labelStyle: "roman",
    keyHidden: planned.key_hidden ?? false,
  });
}

/**
 * @param {PlannedExchange} planned
 * @param {Song} song
 * @param {Turn[]} history
 */
export const requestFor = (planned, song, history) => ({
  snapshot: snapshotFor(song, planned),
  hint_level: planned.hint_level,
  question: planned.question,
  history,
});

/**
 * Turn arrival times into the fixtures' `delayMs`: each event's wait after
 * the one before it (the first, after the request was sent).
 * @param {import("../evals/tutorCall.js").TimedEvent[]} events
 */
export const withDelays = (events) =>
  events.map(({ event, data, atMs }, i) => ({
    event,
    data,
    delayMs: Math.max(0, Math.round(atMs - (i ? events[i - 1].atMs : 0))),
  }));

/**
 * The reply text a later exchange carries as history.
 * @param {{ event: string, data: any }[]} events
 */
const messageOf = (events) =>
  events
    .filter((e) => e.event === "message")
    .map((e) => e.data.delta)
    .join("");

/**
 * Rough input size, in tokens: about four characters each. The system prompt
 * is added on top of every request.
 * @param {object} request
 */
const roughTokens = (request) => Math.ceil(JSON.stringify(request).length / 4);

/**
 * @param {{
 *   url?: string, plan?: URL, out?: URL, only?: string[], estimate?: boolean,
 *   accessCode?: string, log?: (line: string) => void, now?: () => Date,
 * }} options
 * @returns {Promise<{ saved: string[], refused: string[], skipped: string[] }>}
 */
export async function capture({
  url,
  plan = new URL("content/lessons/plan.json", root),
  out = new URL("content/lessons/recorded/", root),
  only,
  estimate = false,
  accessCode,
  log = console.log,
  now = () => new Date(),
}) {
  /** @type {PlannedExchange[]} */
  const exchanges = (await readJson(plan)).exchanges;
  const ids = new Set(exchanges.map((e) => e.id));
  for (const id of only ?? []) if (!ids.has(id)) throw new Error(`No exchange ${id} in the plan`);
  const chosen = only ? exchanges.filter((e) => only.includes(e.id)) : exchanges;

  /** @type {Map<string, Song>} */
  const songs = new Map();
  for (const { song } of exchanges) if (!songs.has(song)) songs.set(song, await loadSong(song));

  if (estimate) {
    // History is not known until the earlier reply arrives; a follow-up's
    // question stands in for it.
    const tokens = chosen.reduce(
      (sum, e) =>
        sum +
        roughTokens(requestFor(e, /** @type {Song} */ (songs.get(e.song)), [])) *
          (e.follows ? 2 : 1),
      0,
    );
    log(
      `${chosen.length} requests, about ${tokens.toLocaleString("en-US")} tokens of request ` +
        `in all, plus the system prompt on each and a reply of a few hundred tokens: ` +
        `a few cents a request at the tutor model's rates.`,
    );
    return { saved: [], refused: [], skipped: [] };
  }
  if (!url) throw new Error("capture needs the tutor's url");

  const health = await fetch(new URL("/api/health", url)).then((r) => r.json());
  if (health.tutor_mode !== "live") {
    throw new Error(
      `The tutor at ${url} is in ${health.tutor_mode} mode. Recorded lessons are real Claude ` +
        `output, so capture needs a live tutor.`,
    );
  }

  /** @type {Map<string, { question: string, message: string }>} */
  const replies = new Map();
  const result = {
    saved: /** @type {string[]} */ ([]),
    refused: /** @type {string[]} */ ([]),
    skipped: /** @type {string[]} */ ([]),
  };

  for (const planned of chosen) {
    const song = /** @type {Song} */ (songs.get(planned.song));
    /** @type {Turn[]} */
    let history = [];
    if (planned.follows) {
      const earlier = replies.get(planned.follows) ?? (await savedReply(out, planned.follows));
      if (!earlier) {
        log(`skip ${planned.id}: it follows ${planned.follows}, which has no recorded reply.`);
        result.skipped.push(planned.id);
        continue;
      }
      history = [
        { role: "student", text: earlier.question },
        { role: "tutor", text: earlier.message },
      ];
    }
    const request = requestFor(planned, song, history);
    // AccessError propagates: every later request would be refused too.
    const exchange = await callTutor(url, request, accessCode);
    if (exchange.outcome === "http_error") {
      log(`refused ${planned.id}: the tutor answered ${exchange.code}; not saved.`);
      result.refused.push(planned.id);
      continue;
    }
    const where = `${planned.id}`;
    const failures = [
      ...recordedFailures(where, exchange.events),
      ...eventFailures(where, song, song.id, exchange.events),
    ];
    if (failures.length) {
      log(`refused ${failures.join("; ")}; not saved.`);
      result.refused.push(planned.id);
      continue;
    }
    const suggestions = /** @type {Record<string, any>} */ (exchange.suggestionsEvent);
    const lesson = {
      name: planned.id,
      song: song.id,
      description: planned.label ?? planned.question,
      ...(planned.follows ? { follows: planned.follows } : {}),
      served_by: suggestions.served_by,
      fallback: suggestions.fallback,
      model: suggestions.served_by,
      date: now().toISOString().slice(0, 10),
      request,
      events: withDelays(exchange.events),
    };
    const file = new URL(`${planned.id}.json`, out);
    await mkdir(out, { recursive: true });
    await writeFile(file, await format(JSON.stringify(lesson), { parser: "json" }));
    replies.set(planned.id, { question: planned.question, message: messageOf(exchange.events) });
    log(
      `saved ${planned.id} (${Math.round(exchange.ms)} ms, ${suggestions.suggestions.length} suggestions)`,
    );
    result.saved.push(planned.id);
  }
  log(
    `${result.saved.length} saved, ${result.refused.length} refused, ${result.skipped.length} skipped.`,
  );
  return result;
}

/**
 * An earlier run's recorded reply, so `--only` can redo a follow-up alone.
 * @param {URL} out
 * @param {string} id
 */
async function savedReply(out, id) {
  try {
    const { request, events } = await readJson(new URL(`${id}.json`, out));
    return { question: request.question, message: messageOf(events) };
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: args } = parseArgs({
    options: {
      url: { type: "string" },
      only: { type: "string", multiple: true },
      estimate: { type: "boolean", default: false },
    },
  });
  try {
    const { refused, skipped } = await capture({
      url: args.url,
      only: args.only,
      estimate: args.estimate,
      accessCode: process.env.TUTOR_ACCESS_CODE || undefined,
    });
    if (refused.length || skipped.length) process.exitCode = 1;
  } catch (error) {
    // AccessError's message never carries the code; neither does any other here.
    console.error(
      error instanceof AccessError
        ? `Stopped: ${error.message}`
        : /** @type {Error} */ (error).message,
    );
    process.exitCode = 1;
  }
}
