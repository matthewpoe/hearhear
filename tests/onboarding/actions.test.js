// Matthew's rule for onboarding: every beginner tip and every guided tour
// step names one action, and only doing it moves on. No "Next" or "Got it".
// These checks keep that from regressing in the content or the components.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import callouts from "../../content/callouts.json" with { type: "json" };
import guided from "../../content/guided-path.json" with { type: "json" };
import { STORE_FACTS, actionParts } from "../../src/callouts/tour.js";

/**
 * How many action markers (`[[...]]`) a string has; unbalanced brackets count
 * as a failure, not a marker.
 * @param {string} text
 */
function actionCount(text) {
  const parts = actionParts(text);
  const stray = parts.some((p) => !p.act && /\[\[|\]\]/.test(p.text));
  return stray ? -1 : parts.filter((p) => p.act).length;
}

/** What a guided step's `done` can observe (src/guided/steps.js conditionMet). */
const CONDITIONS = ["songLoaded", "played", "keyChosen", "keyCommitted", "chordAt", "tutorReplied"];

/** @param {string} file */
const source = (file) => readFile(new URL(`../../src/${file}`, import.meta.url), "utf8");

/** Facts only a physical key can produce: their tips are skipped on touch screens. */
const KEY_ONLY_FACTS = ["chordKeyHeld"];

/** Every literal `id="…"` in src/, the ids a tip can point at. */
async function idsInSrc() {
  const root = new URL("../../src/", import.meta.url);
  const files = (await readdir(root, { recursive: true })).filter((f) => /\.(svelte|js)$/.test(f));
  const ids = new Set();
  for (const file of files) {
    const text = await readFile(new URL(file, root), "utf8");
    for (const [, id] of text.matchAll(/\bid="([\w-]+)"/g)) ids.add(id);
  }
  return ids;
}

/** @param {string} selector */
const idsIn = (selector) => [...selector.matchAll(/#([\w-]+)/g)].map(([, id]) => id);

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
      assert.equal(actionCount(tip.text), 1, "exactly one [[action]] marker");
      for (const fact of Object.keys(when)) assert.ok(facts.has(fact), `when: ${fact}`);
      if (KEY_ONLY_FACTS.includes(tip.doneWhen)) {
        assert.equal(tip.needsHardwareKeyboard, true, "a touch screen could never do it");
      }
    });
  }

  it("builds every store fact in the component", async () => {
    const component = await source("callouts/Callouts.svelte");
    for (const fact of STORE_FACTS) assert.match(component, new RegExp(`\\b${fact}:`), fact);
  });

  it("points only at ids that exist in src/", async () => {
    const ids = await idsInSrc();
    const component = await source("callouts/Callouts.svelte");
    const keepClear = component.match(/const KEEP_CLEAR = \[([\s\S]*?)\]/)?.[1] ?? "";
    assert.notEqual(keepClear, "", "KEEP_CLEAR is where this test expects it");
    const wanted = [
      ...callouts.callouts.map((tip) => ({ where: tip.id, id: tip.anchor })),
      ...callouts.callouts.flatMap((tip) =>
        idsIn(tip.part ?? "").map((id) => ({ where: tip.id, id })),
      ),
      ...Object.entries(callouts.pageFacts).flatMap(([fact, selector]) =>
        idsIn(selector).map((id) => ({ where: fact, id })),
      ),
      ...idsIn(keepClear).map((id) => ({ where: "KEEP_CLEAR", id })),
    ];
    for (const { where, id } of wanted) assert.ok(ids.has(id), `${where}: no id="${id}" in src/`);
  });

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
      assert.equal(actionCount(step.line), 1, "exactly one [[action]] marker");
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
