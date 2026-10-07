import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { validateSong } from "../../src/store/song.js";
import { parseAbc } from "../../evals/dataset/abc.js";
import { deriveTune, loadTunes } from "../../evals/dataset/derive.js";
import { chordOf } from "../../evals/dataset/sonority.js";

const root = new URL("../../", import.meta.url);
const readJson = async (/** @type {string} */ path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const checkSong = new Ajv2020({ strict: false }).compile(
  await readJson("contracts/song.schema.json"),
);

test("every dataset song matches the song schema and the store's invariants", async () => {
  for (const tune of await loadTunes()) {
    const song = await readJson(`evals/dataset/songs/${tune.id}.json`);
    assert.ok(checkSong(song), `${tune.id}: ${JSON.stringify(checkSong.errors)}`);
    assert.doesNotThrow(() => validateSong(song), tune.id);
  }
});

test("the committed songs are exactly what derive.js reads from the sources", async () => {
  for (const tune of await loadTunes()) {
    const committed = await readJson(`evals/dataset/songs/${tune.id}.json`);
    assert.deepEqual(await deriveTune(tune), committed, `${tune.id}: re-run derive.js`);
  }
});

test("the dataset has a minor-key tune and one in 3/4", async () => {
  const tunes = await loadTunes();
  assert.ok(tunes.some((t) => t.key.mode === "minor"));
  const meters = await Promise.all(
    tunes.map(async (t) => (await readJson(`evals/dataset/songs/${t.id}.json`)).meter.beatsPerBar),
  );
  assert.ok(meters.includes(3));
});

test("parseAbc reads key signatures, bar accidentals, lengths, and ties", () => {
  const abc = parseAbc(
    ["M: 3/4", "L: 1/4", "K: G", "[V: S1V1] F ^c c | c3/2 B/ d- | d3 |]"].join("\n"),
  );
  const notes = abc.voices.S1V1.map((n) => [n.name, n.midi, n.start, n.dur]);
  assert.deepEqual(notes, [
    ["F#", 66, 0, 12], // the key signature's F#
    ["C#", 73, 12, 12],
    ["C#", 73, 24, 12], // the accidental lasts to the bar line
    ["C", 72, 36, 18], // and no further
    ["B", 71, 54, 6],
    ["D", 74, 60, 48], // tied across the bar
  ]);
  assert.deepEqual(abc.barStarts, [36, 72, 108]);
});

test("chordOf names complete chords, prefers the bass as root, and refuses passing tones", () => {
  const n = (/** @type {string} */ name, /** @type {number} */ midi) => ({
    name,
    midi,
    start: 0,
    dur: 12,
  });
  assert.deepEqual(chordOf([n("G", 43), n("D", 50), n("B", 59), n("G", 67)]), {
    root: "G",
    type: "M",
  });
  // C E G A over C: C6 rather than Am7.
  assert.deepEqual(chordOf([n("C", 48), n("A", 57), n("E", 64), n("G", 67)]), {
    root: "C",
    type: "6",
  });
  // A seventh chord may drop its fifth.
  assert.deepEqual(chordOf([n("D", 50), n("C", 60), n("F#", 66)]), { root: "D", type: "7" });
  // G B C D: a passing C on the beat spells nothing.
  assert.equal(chordOf([n("G", 43), n("B", 59), n("C", 60), n("D", 62)]), null);
});
