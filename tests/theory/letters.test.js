import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chordFromLetter, chordFromNumeral, letterOf, sameChord } from "../../src/theory/index.js";

describe("chordFromLetter", () => {
  it("reads a root with its accidental, keeping the spelling", () => {
    assert.deepEqual(chordFromLetter("A"), { root: "A", type: "M" });
    assert.deepEqual(chordFromLetter("A#"), { root: "A#", type: "M" });
    assert.deepEqual(chordFromLetter("Bb"), { root: "Bb", type: "M" });
    assert.deepEqual(chordFromLetter(" Bbm7b5 "), { root: "Bb", type: "m7b5" });
  });

  const SPELLINGS = {
    M: [""],
    m: ["m", "min"],
    7: ["7"],
    maj7: ["maj7", "M7"],
    m7: ["m7"],
    dim: ["dim", "o", "°"],
    dim7: ["dim7", "o7", "°7"],
    m7b5: ["m7b5", "ø", "ø7"],
    aug: ["aug", "+"],
    sus2: ["sus2"],
    sus4: ["sus4"],
    6: ["6"],
    m6: ["m6"],
  };
  for (const [type, suffixes] of Object.entries(SPELLINGS)) {
    it(`reads ${suffixes.map((s) => `"${s}"`).join(", ")} as ${type}`, () => {
      for (const suffix of suffixes) assert.equal(chordFromLetter(`F#${suffix}`)?.type, type);
    });
  }

  it("reads back every letter name the app writes", () => {
    for (const type of Object.keys(SPELLINGS)) {
      assert.deepEqual(chordFromLetter(letterOf({ root: "Eb", type })), { root: "Eb", type });
    }
  });

  for (const text of ["", "H", "a", "Ax", "A##", "Cmaj9", "Dm7b9", "G/B", "C major"]) {
    it(`rejects ${JSON.stringify(text)}`, () => assert.equal(chordFromLetter(text), null));
  }
});

describe("sameChord", () => {
  const D_MAJOR = { tonic: "D", mode: "major", provisional: false };

  it("treats enharmonic roots as one root", () => {
    const flat = /** @type {any} */ (chordFromNumeral("bVI", D_MAJOR));
    assert.equal(flat.root, "Bb");
    assert.ok(sameChord(/** @type {any} */ (chordFromLetter("A#")), flat));
  });

  it("tells chords apart by root and by type", () => {
    assert.equal(sameChord({ root: "A", type: "M" }, { root: "E", type: "M" }), false);
    assert.equal(sameChord({ root: "A", type: "M" }, { root: "A", type: "m" }), false);
    assert.equal(sameChord({ root: "Cb", type: "M" }, { root: "B", type: "M" }), true);
  });
});
