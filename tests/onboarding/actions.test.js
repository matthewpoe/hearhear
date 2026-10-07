// Matthew's rule for onboarding: every beginner tip and every guided tour
// step names one action, and only doing it moves on. No "Next" or "Got it".
// These checks keep that from regressing in the content or the components.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import callouts from "../../content/callouts.json" with { type: "json" };
import guided from "../../content/guided-path.json" with { type: "json" };
import { STORE_FACTS } from "../../src/callouts/tour.js";

/** What a guided step's `done` can observe (src/guided/steps.js conditionMet). */
const CONDITIONS = ["songLoaded", "played", "keyChosen", "keyCommitted", "chordAt", "tutorReplied"];

/** @param {string} file */
const source = (file) => readFile(new URL(`../../src/${file}`, import.meta.url), "utf8");

describe("every beginner tip waits for an action", () => {
  const facts = new Set([...STORE_FACTS, ...Object.keys(callouts.pageFacts)]);

  for (const tip of callouts.callouts) {
    it(`${tip.id}: has a doneWhen the tour can observe, and no Next`, () => {
      assert.equal(typeof tip.doneWhen, "string", "doneWhen is the fact its action produces");
      assert.ok(facts.has(tip.doneWhen), `${tip.doneWhen} is a store fact or a pageFact`);
      // A tip that needs its own action already done could never show.
      const when = /** @type {Record<string, boolean>} */ (tip.when ?? {});
      assert.notEqual(when[tip.doneWhen], true);
      for (const key of ["noNext", "next", "nextLabel"]) assert.ok(!(key in tip), key);
    });
  }

  it("names every page fact with a selector", () => {
    for (const [fact, selector] of Object.entries(callouts.pageFacts)) {
      assert.ok(typeof selector === "string" && selector.length > 0, fact);
    }
  });
});

describe("every guided step waits for an action", () => {
  for (const step of guided.steps) {
    it(`${step.id}: has a done condition, and no Next`, () => {
      assert.ok(CONDITIONS.includes(step.done?.type), "done is what its action produces");
      for (const key of ["next", "text"]) assert.ok(!(key in step), key);
    });
  }
});

describe("the onboarding components offer no Next", () => {
  for (const file of ["callouts/Callouts.svelte", "guided/GuidedPath.svelte"]) {
    it(`${file} has no Next, Got it, or Back button`, async () => {
      const markup = (await source(file)).split("</script>").at(-1) ?? "";
      assert.doesNotMatch(markup, /["'>]\s*(Next|Got it|Back)\s*["'<]/);
    });
  }
});
