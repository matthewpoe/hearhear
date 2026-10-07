/**
 * Validate bundled content against the contracts: every song against
 * song.schema.json and the store's invariants, and every tutor fixture's
 * `suggestions` event against the reply schema. Runs in CI.
 */

import { readdir, readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { validateSong } from "../src/store/song.js";

const root = new URL("../", import.meta.url);
/** @param {string} path */
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
/** @param {string} dir */
const jsonFiles = async (dir) =>
  (await readdir(new URL(dir, root))).filter((f) => f.endsWith(".json")).map((f) => dir + f);

const ajv = new Ajv2020({ strict: false, allErrors: true });
const checkSong = ajv.compile(await readJson("contracts/song.schema.json"));
const checkReply = ajv.compile(await readJson("contracts/tutor-reply.schema.json"));

/** @type {string[]} */
const failures = [];

for (const path of await jsonFiles("content/songs/")) {
  const song = await readJson(path);
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
  const { events } = await readJson(path);
  if (events.at(-1)?.event !== "done") failures.push(`${path}: last event must be done`);
  for (const { event, data } of events) {
    if (event !== "suggestions") continue;
    const { hint_level, suggestions } = data;
    const reply = { hint_level, message: "", suggestions };
    if (!checkReply(reply)) failures.push(`${path}: ${ajv.errorsText(checkReply.errors)}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Content matches the contracts.");
