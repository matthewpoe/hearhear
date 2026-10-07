/**
 * The checks a recorded event sequence must pass, shared by
 * scripts/validate-content.js (the shape fixtures and the recorded lessons)
 * and scripts/capture-lessons.js (each lesson before it is saved).
 *
 * @import { Song } from "../src/types.js"
 */

import { readdir, readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { chordFromNumeral, letterOf, positionOf } from "../src/theory/index.js";

const root = new URL("../", import.meta.url);
const ajv = new Ajv2020({ strict: false, allErrors: true });
const checkReply = ajv.compile(
  JSON.parse(await readFile(new URL("contracts/tutor-reply.schema.json", root), "utf8")),
);

/**
 * The `.json` files in a directory, as `dir` + name. Only an `optional`
 * directory may be missing (it then has no files); any other read error
 * throws, so a moved content directory can't pass by checking nothing.
 * @param {URL} base
 * @param {string} dir relative to `base`, ending in "/"
 * @param {{ optional?: boolean }} [options]
 */
export async function jsonFiles(base, dir, { optional = false } = {}) {
  /** @type {string[]} */
  let names;
  try {
    names = await readdir(new URL(dir, base));
  } catch (error) {
    if (optional && /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return [];
    throw error;
  }
  return names.filter((f) => f.endsWith(".json")).map((f) => dir + f);
}

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

const ACCIDENTAL_WORDS = { "#": "(?:#|♯|[ -]sharp)", b: "(?:b|♭|[ -]flat)", "": "" };
/** A chord suffix after a letter: Dm, D7, Dmaj7, Dsus4, D°, D+. */
const CHORD_SUFFIX = "(?:m|maj|min|dim|aug|sus|add|°|ø|\\+)?\\d*";

/**
 * The words in a message that give away a hidden key: the tonic as a note or
 * chord name (word-bounded, with its accidental, so in D the "D" of "Do" or the
 * "D#" of a different note doesn't count), and the tonic paired with "major"
 * or "minor", which names the key outright. A bare "A" before a lowercase word
 * reads as the article, not the note, except in "A major" or "A minor" when
 * the tonic is A. Another letter with a mode ("A minor third" in D) is not
 * this key, so it passes.
 * @param {string} message
 * @param {{ tonic: string }} key
 * @returns {string[]}
 */
export function keySpoilers(message, key) {
  const letter = key.tonic[0].toUpperCase();
  const accidental = /** @type {"#" | "b" | ""} */ (key.tonic.slice(1));
  const natural = accidental ? "" : "(?!#|♯|♭|b(?![a-z])|[ -](?:sharp|flat))";
  const tonic = new RegExp(
    `(?<![A-Za-z0-9#♯♭])${letter}${ACCIDENTAL_WORDS[accidental]}${natural}${CHORD_SUFFIX}(?![A-Za-z0-9])`,
    "g",
  );
  const found = [...message.matchAll(tonic)]
    .filter((m) => !(m[0] === "A" && /^ [a-z]/.test(message.slice(m.index + 1))))
    .map((m) => m[0]);
  const keyPhrase = new RegExp(
    `(?<![A-Za-z0-9#♯♭])${letter}${ACCIDENTAL_WORDS[accidental]}${natural} (?:major|minor)\\b`,
    "gi",
  );
  // Case-insensitive for "Major", but the letter itself must be a capital.
  for (const m of message.matchAll(keyPhrase)) if (m[0][0] === letter) found.push(m[0]);
  return [...new Set(found)];
}

/**
 * Failures for a reply to a request whose key labels were hidden: its message
 * must not name the key (keySpoilers). No failures when the key was shown.
 * @param {string} where
 * @param {{ snapshot: { key: { tonic: string }, key_hidden?: boolean } }} request
 * @param {{ event: string, data: any }[]} events
 * @returns {string[]}
 */
export function hiddenKeyFailures(where, request, events) {
  if (!request.snapshot.key_hidden) return [];
  const message = events
    .filter((e) => e.event === "message")
    .map((e) => e.data.delta)
    .join("");
  const spoilers = keySpoilers(message, request.snapshot.key);
  return spoilers.length
    ? [`${where}: the key is hidden, but the reply names it (${spoilers.join(", ")})`]
    : [];
}
