import { test } from "node:test";
import assert from "node:assert/strict";
import { Ajv2020 } from "ajv/dist/2020.js";
import requestSchema from "../../contracts/tutor-request.schema.json" with { type: "json" };
import { loadTunes } from "../../evals/dataset/derive.js";
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
