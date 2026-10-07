/**
 * The checks a recorded event sequence must pass, shared by
 * scripts/validate-content.js (the shape fixtures and the recorded lessons)
 * and scripts/capture-lessons.js (each lesson before it is saved).
 *
 * @import { Song } from "../src/types.js"
 */

import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { chordFromNumeral, letterOf, positionOf } from "../src/theory/index.js";

const root = new URL("../", import.meta.url);
const ajv = new Ajv2020({ strict: false, allErrors: true });
const checkReply = ajv.compile(
  JSON.parse(await readFile(new URL("contracts/tutor-reply.schema.json", root), "utf8")),
);

/**
 * Failures in one sequence of `{ event, data }`: it must end with `done`, and
 * every `suggestions` event must match the reply schema, with each suggestion
 * on a note onset in the song and its numeral and letter naming the same chord
 * in the song's key.
 * @param {string} where prefixes every failure
 * @param {Song | undefined} song undefined when the song id is unknown
 * @param {string} songId
 * @param {{ event: string, data: any }[]} events
 * @returns {string[]}
 */
export function eventFailures(where, song, songId, events) {
  /** @type {string[]} */
  const failures = [];
  if (!song) failures.push(`${where}: unknown song ${songId}`);
  if (events.at(-1)?.event !== "done") failures.push(`${where}: last event must be done`);
  for (const { event, data } of events) {
    if (event !== "suggestions") continue;
    const { hint_level, suggestions } = data;
    const reply = { hint_level, message: "", suggestions };
    if (!checkReply(reply)) failures.push(`${where}: ${ajv.errorsText(checkReply.errors)}`);
    if (!song) continue;
    for (const { bar, beat, numeral, letter } of suggestions) {
      const at = `${where}: bar ${bar} beat ${beat}`;
      const onset = song.notes.some((n) => {
        const p = positionOf(n.start, song.meter);
        return p.bar === bar && p.beat === beat;
      });
      if (!onset) failures.push(`${at} is not a note onset in ${songId}`);
      const chord = chordFromNumeral(numeral, song.key);
      if (!chord || letterOf(chord) !== letter) {
        failures.push(`${at}: ${numeral} is not ${letter} in ${song.key.tonic} ${song.key.mode}`);
      }
    }
  }
  return failures;
}

/**
 * Failures that only a recorded lesson can have: it is real Claude output, so
 * it needs a suggestions event the requested model served, and no error.
 * @param {string} where
 * @param {{ event: string, data: any }[]} events
 * @returns {string[]}
 */
export function recordedFailures(where, events) {
  /** @type {string[]} */
  const failures = [];
  const error = events.find((e) => e.event === "error");
  if (error) failures.push(`${where}: has an error event (${error.data?.code})`);
  const suggestions = events.find((e) => e.event === "suggestions");
  if (!suggestions) failures.push(`${where}: has no suggestions event`);
  else if (suggestions.data.fallback !== false) {
    failures.push(`${where}: a fallback model served this reply`);
  } else if (suggestions.data.served_by === "fixture") {
    failures.push(`${where}: served by the fixture replay, not Claude`);
  }
  return failures;
}
