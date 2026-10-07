/**
 * Validate bundled content against the contracts: every song against
 * song.schema.json and the store's invariants, and every tutor fixture's and
 * recorded lesson's `suggestions` event against the reply schema and its song:
 * each suggestion must sit on a note onset, and its numeral and letter must
 * name the same chord in the song's key. A recorded lesson must also be real,
 * requested-model output: no error event and no fallback. Runs in CI.
 */

import { readdir, readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { validateSong } from "../src/store/song.js";
import { eventFailures, recordedFailures } from "./contentChecks.js";

const root = new URL("../", import.meta.url);
/** @param {string} path */
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
/** @param {string} dir A missing directory has no files. */
const jsonFiles = async (dir) =>
  (await readdir(new URL(dir, root)).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => dir + f);

const ajv = new Ajv2020({ strict: false, allErrors: true });
const checkSong = ajv.compile(await readJson("contracts/song.schema.json"));

/** @type {string[]} */
const failures = [];

/** @type {Map<string, import("../src/types.js").Song>} */
const songs = new Map();

for (const path of await jsonFiles("content/songs/")) {
  const song = await readJson(path);
  songs.set(song.id, song);
  if (!checkSong(song)) failures.push(`${path}: ${ajv.errorsText(checkSong.errors)}`);
  else {
    try {
      validateSong(song);
    } catch (error) {
      failures.push(`${path}: ${/** @type {Error} */ (error).message}`);
    }
  }
}

for (const path of await jsonFiles("contracts/fixtures/tutor/")) {
  const { song, events } = await readJson(path);
  failures.push(...eventFailures(path, songs.get(song), song, events));
}

for (const path of await jsonFiles("content/lessons/recorded/")) {
  const { song, events } = await readJson(path);
  failures.push(...eventFailures(path, songs.get(song), song, events));
  failures.push(...recordedFailures(path, events));
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Content matches the contracts.");
