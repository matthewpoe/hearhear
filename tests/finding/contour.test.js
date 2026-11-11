import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { contour } from "../../src/finding/contour.js";
import { transposeSong } from "../../src/theory/index.js";

const meter = { beatsPerBar: 4, beatUnit: 4, pickupTicks: 0, provisional: false };

describe("contour", () => {
  it("draws only the opening bars, one dash per note, left to right", () => {
    const shape = contour(/** @type {any} */ (ode));
    const bar = 48;
    const opening = ode.notes.filter((n) => n.start < 4 * bar);
    assert.equal(shape.dashes.length, opening.length);
    const xs = shape.dashes.map((d) => d.x);
    assert.deepEqual(
      xs,
      [...xs].sort((a, b) => a - b),
    );
    assert.ok(shape.path.startsWith("M"));
  });

  it("puts higher notes higher, inside the box", () => {
    const notes = [
      { id: "a", midi: 60, start: 0, dur: 12 },
      { id: "b", midi: 67, start: 12, dur: 12 },
      { id: "c", midi: 64, start: 24, dur: 24 },
    ];
    const { dashes, height } = contour({ notes, meter }, { height: 40, pad: 4 });
    assert.equal(dashes[0].y, 36);
    assert.equal(dashes[1].y, 4);
    assert.ok(dashes[2].y > dashes[1].y && dashes[2].y < dashes[0].y);
    assert.ok(dashes[2].w > dashes[0].w, "a longer note draws a longer dash");
    for (const d of dashes) assert.ok(d.y >= 0 && d.y <= height);
  });

  it("is the same shape in any key: relationships, not pitches", () => {
    const up = transposeSong(/** @type {any} */ (ode), 5);
    assert.deepEqual(contour(up), contour(/** @type {any} */ (ode)));
  });

  it("centers a one-pitch tune and draws nothing for an empty one", () => {
    const flat = contour({ notes: [{ id: "a", midi: 62, start: 0, dur: 12 }], meter });
    assert.equal(flat.dashes[0].y, flat.height / 2);
    assert.deepEqual(contour({ notes: [], meter }).dashes, []);
  });
});
