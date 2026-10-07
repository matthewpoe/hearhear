import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { positionOf, rebar } from "../../src/theory/index.js";

/** @type {any} */
const odeSong = ode;
/** @type {any} */
const stJamesSong = stJames;

describe("positionOf", () => {
  it("finds bars and fractional beats", () => {
    assert.deepEqual(positionOf(0, odeSong.meter), { bar: 1, beat: 1 });
    assert.deepEqual(positionOf(162, odeSong.meter), { bar: 4, beat: 2.5 });
    assert.deepEqual(positionOf(4, odeSong.meter), { bar: 1, beat: 1 + 1 / 3 });
  });

  it("puts a pickup at the end of bar 0", () => {
    assert.deepEqual(positionOf(0, stJamesSong.meter), { bar: 0, beat: 4 });
    assert.deepEqual(positionOf(12, stJamesSong.meter), { bar: 1, beat: 1 });
  });

  it("counts 6/8 in eighths", () => {
    const sixEight = { beatsPerBar: 6, beatUnit: 8, pickupTicks: 0, provisional: false };
    assert.deepEqual(positionOf(42, /** @type {any} */ (sixEight)), { bar: 2, beat: 2 });
  });
});

describe("rebar", () => {
  it("lays Ode out in eight bars of four", () => {
    const bars = rebar(odeSong, odeSong.meter);
    assert.equal(bars.length, 8);
    assert.deepEqual(bars[3], { index: 4, startTick: 144, noteIds: ["nd", "ne", "nf"] });
  });

  it("moves bar lines, never notes", () => {
    const threeFour = { ...odeSong.meter, beatsPerBar: 3 };
    const bars = rebar(odeSong, threeFour);
    assert.equal(bars.length, 11);
    assert.deepEqual(
      bars.flatMap((b) => b.noteIds),
      odeSong.notes.map((/** @type {any} */ n) => n.id),
    );
    assert.deepEqual(bars[1], { index: 2, startTick: 36, noteIds: ["n4", "n5", "n6"] });
  });

  it("starts St. James with its pickup in bar 0", () => {
    const bars = rebar(stJamesSong, stJamesSong.meter);
    assert.deepEqual(bars[0], { index: 0, startTick: 0, noteIds: ["n1"] });
    assert.equal(bars[1].startTick, 12);
  });

  it("adds a pickup when the meter hypothesis gains one", () => {
    const pickup = { ...odeSong.meter, pickupTicks: 24 };
    const bars = rebar(odeSong, pickup);
    assert.deepEqual(bars[0], { index: 0, startTick: 0, noteIds: ["n1", "n2"] });
    assert.equal(bars[1].startTick, 24);
  });

  it("keeps an empty bar as a bar of rest", () => {
    const gap = {
      ...odeSong,
      notes: [
        { id: "n1", midi: 62, start: 0, dur: 48 },
        { id: "n2", midi: 62, start: 96, dur: 48 },
      ],
    };
    assert.deepEqual(
      rebar(gap, gap.meter).map((b) => b.noteIds),
      [["n1"], [], ["n2"]],
    );
  });

  it("returns one empty bar for an empty song", () => {
    assert.deepEqual(rebar({ ...odeSong, notes: [] }, odeSong.meter), [
      { index: 1, startTick: 0, noteIds: [] },
    ]);
  });
});
