import { test } from "node:test";
import assert from "node:assert/strict";
import { Ajv2020 } from "ajv/dist/2020.js";
import requestSchema from "../../contracts/tutor-request.schema.json" with { type: "json" };
import {
  ASK_POINTS,
  CHECK_POINTS,
  DEMO_TUNES,
  demoPoints,
  loadDemo,
} from "../../evals/dataset/demos.js";
import { loadTunes } from "../../evals/dataset/derive.js";
import { plausible } from "../../evals/metrics.js";
import { letterOf, numeralOf, positionOf } from "../../src/theory/index.js";
import { evalRequest, evalSnapshot } from "../../evals/request.js";
import { readFile } from "node:fs/promises";

const tunes = await loadTunes();
/** @param {string} id */
const songOf = async (id) =>
  JSON.parse(
    await readFile(new URL(`../../evals/dataset/songs/${id}.json`, import.meta.url), "utf8"),
  );

test("the eval's request carries no title and no chords, and meets the contract", async () => {
  const validate = new Ajv2020({ strict: false }).compile(requestSchema);
  for (const tune of tunes) {
    const song = await songOf(tune.id);
    assert.ok(song.title, "the dataset song has a title to strip");
    const body = evalRequest(evalSnapshot(song), "nudge", 1, 1);
    assert.equal("title" in body.snapshot, false, tune.id);
    assert.equal(JSON.stringify(body).includes(song.title), false, tune.id);
    assert.ok(
      body.snapshot.bars.every((b) => b.chords.length === 0),
      "melody only",
    );
    assert.ok(validate(body), JSON.stringify(validate.errors));
  }
});

test("demo-tune requests carry no title, and a check carries only the chord asked about", async () => {
  const validate = new Ajv2020({ strict: false }).compile(requestSchema);
  for (const id of DEMO_TUNES) {
    const song = await loadDemo(id);
    assert.ok(song.title, "the demo song has a title to strip");
    const { ask, check } = demoPoints(song);
    assert.equal(ask.length, ASK_POINTS, id);
    assert.equal(check.length, CHECK_POINTS, id);
    assert.ok(
      check.every((c) => !ask.includes(c.note)),
      "the two sets never share a note",
    );
    for (const { note, placed } of check) {
      const at = positionOf(note.start, song.meter);
      const suggestion = { numeral: numeralOf(placed, song.key), letter: letterOf(placed) };
      assert.ok(plausible(suggestion, { ...song, chords: [] }, note), `${id} placed chord`);
      const snapshot = evalSnapshot(song, [{ id: "c1", noteId: note.id, ...placed }]);
      const body = evalRequest(snapshot, "comparison", at.bar, at.beat, suggestion.numeral);
      assert.equal("title" in body.snapshot, false, id);
      assert.equal(JSON.stringify(body).includes(song.title), false, id);
      assert.equal(body.snapshot.bars.flatMap((b) => b.chords).length, 1);
      assert.match(body.question, /^Does .+ work under the melody note at bar \d+, beat 1\?$/);
      assert.ok(validate(body), JSON.stringify(validate.errors));
    }
  }
});
