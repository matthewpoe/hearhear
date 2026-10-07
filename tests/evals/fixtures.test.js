import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { chordNamesIn } from "../../evals/metrics.js";

const dir = new URL("../../contracts/fixtures/tutor/", import.meta.url);
const fixtures = await Promise.all(
  (await readdir(dir))
    .filter((name) => name.endsWith(".json"))
    .map(async (name) => ({ name, ...JSON.parse(await readFile(new URL(name, dir), "utf8")) })),
);

/** @param {{ event: string, data: any }[]} events */
const levelOf = (events) => events.find((e) => e.event === "suggestions")?.data.hint_level;

test("every nudge fixture names no chord or numeral, as the prompt's nudge rule requires", () => {
  const nudges = fixtures.filter((f) => levelOf(f.events) === "nudge");
  assert.ok(nudges.length > 0, "there is a nudge fixture to check");
  for (const f of nudges) {
    const message = f.events
      .filter((/** @type {{ event: string }} */ e) => e.event === "message")
      .map((/** @type {{ data: { delta: string } }} */ e) => e.data.delta)
      .join("");
    assert.deepEqual(chordNamesIn(message), [], f.name);
  }
});
