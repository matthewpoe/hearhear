// Contract tests for the theory API's frozen shapes. Stream A owns
// tests/theory/ and adds behavior tests alongside these.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import songSchema from "../../contracts/song.schema.json" with { type: "json" };
import {
  chordFromNumeral,
  functionOf,
  letterOf,
  nashvilleOf,
  numeralOf,
  parseNumeral,
} from "../../src/theory/index.js";

const CHORD_TYPES = songSchema.$defs.chord.properties.type.enum;
const D_MAJOR = { tonic: "D", mode: "major", provisional: false };
const E_MINOR = { tonic: "E", mode: "minor", provisional: false };

describe("numeral grammar covers every chord type in the song schema", () => {
  for (const type of CHORD_TYPES) {
    for (const [key, roots] of [
      [D_MAJOR, ["D", "B", "Bb", "G#"]],
      [E_MINOR, ["E", "C", "B", "F"]],
    ]) {
      for (const root of roots) {
        const chord = { root, type };
        it(`${letterOf(chord)} in ${key.tonic} ${key.mode} round-trips`, () => {
          const numeral = numeralOf(chord, key);
          assert.notEqual(numeral, "?");
          assert.ok(parseNumeral(numeral), `${numeral} parses`);
          assert.deepEqual(chordFromNumeral(numeral, key), chord);
          assert.notEqual(nashvilleOf(chord, key), "?");
        });
      }
    }
  }
});

describe("numeral spelling", () => {
  it("names chromatic roots by letter, not semitone", () => {
    assert.equal(numeralOf({ root: "Bb", type: "M" }, D_MAJOR), "bVI");
    assert.equal(numeralOf({ root: "G#", type: "dim7" }, D_MAJOR), "#iv°7");
  });

  it("keeps maj7 distinct from a dominant seventh", () => {
    assert.equal(numeralOf({ root: "D", type: "maj7" }, D_MAJOR), "Imaj7");
    assert.equal(functionOf("Imaj7", "major"), "tonic");
    assert.equal(functionOf("I7", "major"), "dominant");
  });

  it("counts Nashville numbers from the minor tonic", () => {
    assert.equal(nashvilleOf({ root: "E", type: "m" }, E_MINOR), "1m");
    assert.equal(nashvilleOf({ root: "B", type: "7" }, E_MINOR), "57");
  });

  it("accepts o and ø shorthands", () => {
    assert.equal(parseNumeral("viio")?.type, "dim");
    assert.equal(parseNumeral("iiø")?.type, "m7b5");
  });

  it("resolves applied chords against their target", () => {
    assert.deepEqual(chordFromNumeral("V7/IV", D_MAJOR), { root: "D", type: "7" });
    assert.equal(parseNumeral("V/IV/ii"), null);
  });
});

describe("functionOf follows contracts/functions.json", () => {
  const cases = [
    ["I", "major", "tonic"],
    ["vi", "major", "tonic"],
    ["ii7", "major", "subdominant"],
    ["bVII", "major", "subdominant"],
    ["V7", "major", "dominant"],
    ["VI7", "minor", "dominant"],
    ["#iv°", "major", "dominant"],
    ["V7/V", "major", "dominant"],
    ["III", "minor", "tonic"],
    ["bII", "major", "other"],
    ["not a numeral", "major", "other"],
  ];
  for (const [numeral, mode, fn] of cases) {
    it(`${numeral} in ${mode} is ${fn}`, () => assert.equal(functionOf(numeral, mode), fn));
  }
});
