import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { replySteps } from "../../src/tutor/replySteps.js";

const dir = new URL("../../contracts/fixtures/tutor/", import.meta.url);
const fixtures = await Promise.all(
  (await readdir(dir))
    .filter((name) => name.endsWith(".json"))
    .map(async (name) => ({ name, ...JSON.parse(await readFile(new URL(name, dir), "utf8")) })),
);

/** @param {{ event: string, data: any }[]} events */
const messageOf = (events) =>
  events
    .filter((e) => e.event === "message")
    .map((e) => e.data.delta)
    .join("");

test("there is a shape fixture for each request mode, and suggestions carry only their fields", () => {
  const names = fixtures.map((f) => f.name).sort();
  assert.deepEqual(names, ["malformed", "over-budget", "question", "review"]);
  for (const f of fixtures) {
    const event = f.events.find((/** @type {{ event: string }} */ e) => e.event === "suggestions");
    if (event) {
      assert.deepEqual(
        Object.keys(event.data).sort(),
        ["dropped", "snapshot_version", "suggestions"],
        f.name,
      );
    }
  }
});

test("the review and question fixtures read as the prompt asks", () => {
  for (const name of ["review", "question"]) {
    const f = fixtures.find((x) => x.name === name);
    const message = messageOf(f.events);
    const { prose, steps } = replySteps(message);
    assert.ok(steps.length >= 1 && steps.length <= 3, `${name}: one to three listening tests`);
    assert.doesNotMatch(prose, /^\s*\d+\.\s/m, `${name}: no numbered outline in the prose`);
    assert.doesNotMatch(message, /\b(?:wrong|incorrect|mistake|should have)\b/i, name);
    const suggestions = f.events.find(
      (/** @type {{ event: string }} */ e) => e.event === "suggestions",
    ).data.suggestions;
    assert.ok(suggestions.length >= 2, `${name}: alternatives come back as suggestions`);
    // Ode to Joy has eight bars: every bar the message cites is one of them.
    for (const [, bar] of message.matchAll(/\bbars? (\d+)/g)) {
      assert.ok(Number(bar) >= 1 && Number(bar) <= 8, `${name}: bar ${bar}`);
    }
  }
  const review = messageOf(fixtures.find((x) => x.name === "review").events);
  const words = review.split(/\s+/).length;
  assert.ok(words >= 250 && words <= 450, `the review is ${words} words`);
});
