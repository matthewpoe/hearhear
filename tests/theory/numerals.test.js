import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidates,
  chordFromNumeral,
  functionOf,
  letterOf,
  nashvilleOf,
  numeralOf,
  parseNumeral,
} from "../../src/theory/index.js";

const D_MAJOR = { tonic: "D", mode: "major", provisional: false };
const E_MINOR = { tonic: "E", mode: "minor", provisional: false };

describe("parseNumeral", () => {
  it("reads degree, accidental, and quality", () => {
    assert.deepEqual(parseNumeral("bVII"), { degree: 7, accidental: -1, type: "M", of: null });
    assert.deepEqual(parseNumeral("#iv°7"), { degree: 4, accidental: 1, type: "dim7", of: null });
    assert.equal(parseNumeral("ii7")?.type, "m7");
    assert.equal(parseNumeral("III+")?.type, "aug");
    assert.equal(parseNumeral(" V7 ")?.type, "7");
  });

  it("reads applied chords with their target", () => {
    assert.deepEqual(parseNumeral("V7/ii"), {
      degree: 5,
      accidental: 0,
      type: "7",
      of: { degree: 2, accidental: 0, type: "m", of: null },
    });
  });

  it("rejects what isn't a numeral", () => {
    for (const text of ["", "VIII", "V°", "Vm", "ii+", "V7/", "X/V", "D", "v9"]) {
      assert.equal(parseNumeral(text), null, text);
    }
  });
});

describe("numeralOf", () => {
  it("names a dominant seventh that resolves to a diatonic chord as applied", () => {
    assert.equal(numeralOf({ root: "D", type: "7" }, D_MAJOR), "V7/IV");
    assert.equal(numeralOf({ root: "E", type: "7" }, D_MAJOR), "V7/V");
    assert.equal(numeralOf({ root: "F#", type: "7" }, D_MAJOR), "V7/vi");
    assert.equal(numeralOf({ root: "E", type: "7" }, E_MINOR), "V7/iv");
    assert.equal(numeralOf({ root: "F#", type: "7" }, E_MINOR), "V7/V");
  });

  it("keeps V7 plain, and doesn't tonicize a diminished chord", () => {
    assert.equal(numeralOf({ root: "A", type: "7" }, D_MAJOR), "V7");
    assert.equal(numeralOf({ root: "B", type: "7" }, E_MINOR), "V7");
    // G#7 would resolve to C#°, the leading-tone chord.
    assert.equal(numeralOf({ root: "G#", type: "7" }, D_MAJOR), "#IV7");
    // C7 in D resolves to F, which isn't in the key.
    assert.equal(numeralOf({ root: "C", type: "7" }, D_MAJOR), "bVII7");
  });

  it("tonicizes only iv, V, and VI in minor, so the minor blues IV7 keeps its name", () => {
    assert.equal(numeralOf({ root: "A", type: "7" }, E_MINOR), "IV7");
    assert.equal(numeralOf({ root: "D", type: "7" }, E_MINOR), "VII7");
    assert.equal(numeralOf({ root: "G", type: "7" }, E_MINOR), "V7/VI");
    // The same chord on the major 4th degree has always been IV7.
    assert.equal(numeralOf({ root: "G", type: "7" }, D_MAJOR), "IV7");
  });

  it("only applies to dominant sevenths; triads keep plain numerals", () => {
    assert.equal(numeralOf({ root: "E", type: "M" }, D_MAJOR), "II");
    assert.equal(numeralOf({ root: "D", type: "maj7" }, D_MAJOR), "Imaj7");
  });

  it("returns ? for a root it can't name", () => {
    assert.equal(numeralOf({ root: "Ab", type: "M" }, { ...D_MAJOR, tonic: "D#" }), "?");
    assert.equal(numeralOf({ root: "D", type: "9" }, D_MAJOR), "?");
  });
});

describe("nashvilleOf", () => {
  it("writes secondary dominants as plain numbers with their quality", () => {
    assert.equal(nashvilleOf({ root: "B", type: "7" }, D_MAJOR), "67");
    assert.equal(nashvilleOf({ root: "D", type: "7" }, D_MAJOR), "17");
  });

  it("formats every quality the PRD lists", () => {
    const cases = [
      [{ root: "E", type: "m" }, "2m"],
      [{ root: "C#", type: "dim" }, "7°"],
      [{ root: "D", type: "maj7" }, "1maj7"],
      [{ root: "C", type: "M" }, "b7"],
      [{ root: "G#", type: "dim" }, "#4°"],
    ];
    for (const [chord, label] of cases) {
      assert.equal(nashvilleOf(/** @type {any} */ (chord), D_MAJOR), label);
    }
  });

  it("counts from the minor tonic", () => {
    assert.equal(nashvilleOf({ root: "A", type: "m" }, E_MINOR), "4m");
    assert.equal(nashvilleOf({ root: "G", type: "M" }, E_MINOR), "3");
  });
});

describe("chordFromNumeral", () => {
  it("builds chords in the key", () => {
    assert.deepEqual(chordFromNumeral("bVI", D_MAJOR), { root: "Bb", type: "M" });
    assert.deepEqual(chordFromNumeral("VII", E_MINOR), { root: "D", type: "M" });
    assert.deepEqual(chordFromNumeral("#vii°7", E_MINOR), { root: "D#", type: "dim7" });
    assert.deepEqual(chordFromNumeral("V7/V", E_MINOR), { root: "F#", type: "7" });
    assert.equal(chordFromNumeral("nope", D_MAJOR), null);
  });

  it("round-trips every dropdown chord through its numeral", () => {
    for (const key of [
      D_MAJOR,
      E_MINOR,
      { tonic: "Gb", mode: "major" },
      { tonic: "C#", mode: "minor" },
    ]) {
      const k = /** @type {any} */ ({ provisional: false, ...key });
      for (const chord of candidates(k, { extended: true })) {
        const numeral = numeralOf(chord, k);
        assert.deepEqual(chordFromNumeral(numeral, k), chord, `${letterOf(chord)} as ${numeral}`);
      }
    }
  });
});

describe("functionOf", () => {
  it("colors every dropdown chord, and the extended ones by their pull", () => {
    const fns = (/** @type {any} */ key) =>
      candidates(key, { extended: true }).map((c) => functionOf(numeralOf(c, key), key.mode));
    assert.deepEqual(fns(D_MAJOR), [
      ...["tonic", "subdominant", "dominant", "tonic", "subdominant", "tonic"],
      ...["dominant", "dominant", "dominant", "dominant", "dominant"],
      ...["subdominant", "other", "subdominant", "subdominant"],
      ...["dominant", "dominant", "dominant", "dominant"],
    ]);
    assert.deepEqual(fns(E_MINOR), [
      ...["tonic", "subdominant", "dominant", "tonic", "subdominant"],
      ...["dominant", "dominant", "dominant"],
      ...["tonic", "subdominant"],
      ...["dominant", "dominant"],
    ]);
  });
});
