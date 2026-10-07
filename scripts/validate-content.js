/**
 * Validate bundled content against the contracts: every song against
 * song.schema.json and the store's invariants, and every tutor fixture's
 * `suggestions` event against the reply schema and its song: each suggestion
 * must sit on a note onset, and its numeral and letter must name the same
 * chord in the song's key. Runs in CI.
 */

import { readdir, readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { validateSong } from "../src/store/song.js";
import { chordFromNumeral, letterOf, positionOf } from "../src/theory/index.js";

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
  const { song: songId, events } = await readJson(path);
  const song = songs.get(songId);
  if (!song) failures.push(`${path}: unknown song ${songId}`);
  if (events.at(-1)?.event !== "done") failures.push(`${path}: last event must be done`);
  for (const { event, data } of events) {
    if (event !== "suggestions") continue;
    const { hint_level, suggestions } = data;
    const reply = { hint_level, message: "", suggestions };
    if (!checkReply(reply)) failures.push(`${path}: ${ajv.errorsText(checkReply.errors)}`);
    if (!song) continue;
    for (const { bar, beat, numeral, letter } of suggestions) {
      const where = `${path}: bar ${bar} beat ${beat}`;
      const onset = song.notes.some((n) => {
        const p = positionOf(n.start, song.meter);
        return p.bar === bar && p.beat === beat;
      });
      if (!onset) failures.push(`${where} is not a note onset in ${songId}`);
      const chord = chordFromNumeral(numeral, song.key);
      if (!chord || letterOf(chord) !== letter) {
        failures.push(
          `${where}: ${numeral} is not ${letter} in ${song.key.tonic} ${song.key.mode}`,
        );
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Content matches the contracts.");
