import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { meterSummary, nextStep, rhythmSource } from "../../src/steps/nextStep.js";

/** @type {import("../../src/types.js").Song} */
const settled = /** @type {any} */ ({ ...ode, chords: [] });
const unkeyed = { ...settled, key: { ...settled.key, provisional: true } };
const recorded = { ...settled, meter: { ...settled.meter, provisional: true }, tempo: 90 };

/** @param {ReturnType<typeof nextStep>} path */
const statuses = (path) => path.steps.map((s) => `${s.id}:${s.status}`);

describe("nextStep", () => {
  it("starts at the key, with a demo's rhythm already settled", () => {
    const path = nextStep(unkeyed, { keyOpen: false });
    assert.equal(path.current, "key");
    assert.deepEqual(statuses(path), ["song:done", "key:current", "chords:todo"]);
    assert.equal(path.steps[1].summary, "Where's home?");
  });

  it("keeps the key current while its question is open, even once chosen", () => {
    assert.equal(nextStep(settled, { keyOpen: true }).current, "key");
  });

  it("collapses a chosen key to its name and moves on to chords", () => {
    const path = nextStep(settled, { keyOpen: false });
    assert.equal(path.current, "chords");
    assert.deepEqual(statuses(path), ["song:done", "key:done", "chords:current"]);
    assert.equal(path.steps[1].summary, "D major");
  });

  it("asks a recorded tune to confirm its rhythm guess before chords", () => {
    const path = nextStep(recorded, { keyOpen: false });
    assert.equal(path.current, "rhythm");
    assert.deepEqual(statuses(path), ["song:done", "key:done", "rhythm:current"]);
    assert.match(path.steps[2].summary, /^4\/4 at 90 beats a minute\?/);
  });

  it("counts placed chords", () => {
    const one = { ...settled, chords: [{ id: "c", noteId: "n", root: "D", type: "M" }] };
    assert.equal(nextStep(one, { keyOpen: false }).steps[2].summary, "1 chord placed");
    assert.equal(
      nextStep(settled, { keyOpen: false }).steps[2].summary,
      "Click a note on the staff",
    );
  });

  it("summarizes a settled meter", () => {
    assert.equal(
      meterSummary({ beatsPerBar: 3, beatUnit: 4, pickupTicks: 0, provisional: false }, 100),
      "3/4, set from the tune",
    );
  });

  it("calls a recording a recording, and typed notes your notes", () => {
    assert.equal(rhythmSource(true), "The recording reads as");
    assert.equal(rhythmSource(false), "Your notes read as");
  });
});
