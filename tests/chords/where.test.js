// The position formatter: the one wording for where a note sits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { beatLabel, positionLabel, whereOf } from "../../src/chords/where.js";

test("whole beats read as plain numbers", () => {
  assert.equal(beatLabel(1), "1");
  assert.equal(beatLabel(4), "4");
});

test("fractional beats read as fractions, not decimals", () => {
  assert.equal(beatLabel(2.5), "2½");
  assert.equal(beatLabel(1.25), "1¼");
  assert.equal(beatLabel(3.75), "3¾");
  assert.equal(beatLabel(1 + 1 / 3), "1⅓");
  assert.equal(beatLabel(2 + 2 / 3), "2⅔");
});

test("a fraction with no single character rounds to two places", () => {
  assert.equal(beatLabel(1 + 1 / 12), "1.08");
});

test("bar 0 is the pickup", () => {
  assert.equal(positionLabel({ bar: 0, beat: 4 }), "pickup, beat 4");
  assert.equal(positionLabel({ bar: 3, beat: 2.5 }), "bar 3, beat 2½");
});

test("whereOf names a note's start in its meter", () => {
  const meter = {
    beatsPerBar: 4,
    beatUnit: /** @type {const} */ (4),
    pickupTicks: 12,
    provisional: false,
  };
  const note = (/** @type {number} */ start) => ({ id: "n", midi: 60, start, dur: 6 });
  assert.equal(whereOf(note(0), meter), "pickup, beat 4");
  assert.equal(whereOf(note(12), meter), "bar 1, beat 1");
  assert.equal(whereOf(note(12 + 18), meter), "bar 1, beat 2½");
});
