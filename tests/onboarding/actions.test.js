// Matthew's rule for onboarding: every walkthrough step names one action, in
// the accent color, and only doing it moves on. No Next, no Got it, and no
// button that does the step for the viewer: the strip offers only the way
// out. These checks keep that from regressing in the content or the
// component.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import guided from "../../content/guided-path.json" with { type: "json" };
import { actionParts } from "../../src/guided/actions.js";
import { FACTS } from "../../src/guided/steps.js";

/** What a step's `done` can observe (src/guided/steps.js conditionMet). */
const CONDITIONS = [
  "songLoaded",
  "played",
  "keyChosen",
  "keyCommitted",
  "chordAt",
  "tutorReplied",
  "fact",
];
/** Facts only a physical key can produce: their steps are skipped on touch screens. */
const KEY_ONLY_FACTS = ["chordKeyHeld"];

/** @param {string} file */
const source = (file) => readFile(new URL(`../../src/${file}`, import.meta.url), "utf8");

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

/** Every literal `id="…"` in src/, the ids a step can point at. */
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

const facts = new Set([...FACTS, ...Object.keys(guided.pageFacts ?? {})]);

describe("every walkthrough step waits for one action", () => {
  for (const step of guided.steps) {
    it(`${step.id}: has a done condition it can observe, one [[action]], and no Next`, () => {
      assert.ok(CONDITIONS.includes(step.done?.type), "done is what its action produces");
      if (step.done.type === "fact") assert.ok(facts.has(step.done.fact), step.done.fact);
      for (const fact of Object.keys(step.when ?? {})) assert.ok(facts.has(fact), `when: ${fact}`);
      assert.equal(actionCount(step.line), 1, "exactly one [[action]] marker");
      for (const key of ["next", "text", "action"]) assert.ok(!(key in step), key);
      assert.ok(step.target, "a real control to spotlight");
      if (step.done.type === "fact" && KEY_ONLY_FACTS.includes(step.done.fact)) {
        assert.equal(step.needsHardwareKeyboard, true, "a touch screen could never do it");
      }
    });
  }

  it("names every page fact with a selector", () => {
    for (const [fact, selector] of Object.entries(guided.pageFacts ?? {})) {
      assert.ok(typeof selector === "string" && selector.length > 0, fact);
    }
  });

  it("builds every store fact in the component", async () => {
    const component = await source("guided/GuidedPath.svelte");
    for (const fact of FACTS) assert.match(component, new RegExp(`\\b${fact}:`), fact);
  });

  it("points only at ids that exist in src/", async () => {
    const ids = await idsInSrc();
    const wanted = [
      ...guided.steps.flatMap((step) => {
        const t = step.target;
        if (t.type === "button") return [{ where: step.id, id: t.within }];
        if (t.type === "element") return idsIn(t.selector).map((id) => ({ where: step.id, id }));
        return [];
      }),
      ...Object.entries(guided.pageFacts ?? {}).flatMap(([fact, selector]) =>
        idsIn(selector).map((id) => ({ where: fact, id })),
      ),
    ];
    for (const { where, id } of wanted) assert.ok(ids.has(id), `${where}: no id="${id}" in src/`);
  });
});

describe("the strip offers only the way out", () => {
  it("GuidedPath.svelte's buttons are Leave tour and Finish, nothing else", async () => {
    const markup = (await source("guided/GuidedPath.svelte")).split("</script>").at(-1) ?? "";
    const labels = [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(([, t]) => t.trim());
    assert.deepEqual(labels.sort(), ["Finish", "Leave tour"]);
    assert.doesNotMatch(markup, /["'>]\s*(Next|Got it|Back)\s*["'<]/);
  });
});
