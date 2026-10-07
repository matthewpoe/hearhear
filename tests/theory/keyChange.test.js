import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { midiToDegree, numeralOf, rekeySong, transposeSong } from "../../src/theory/index.js";

/** @type {any} */
const odeWithChords = {
  ...ode,
  chords: [
    { id: "c1", noteId: "n1", root: "D", type: "M" },
    { id: "c2", noteId: "nf", root: "A", type: "7" },
    { id: "c3", noteId: "n10", root: "Bb", type: "M" },
    { id: "c4", noteId: "n12", root: "G#", type: "dim7" },
  ],
};
/** @type {any} */
const stJamesSong = { ...stJames, chords: [{ id: "c1", noteId: "n1", root: "B", type: "7" }] };

/** @param {any} song */
const numerals = (song) => song.chords.map((/** @type {any} */ c) => numeralOf(c, song.key));
/** @param {any} song */
const degrees = (song) =>
  song.notes.map((/** @type {any} */ n) => {
    const { degree, accidental } = midiToDegree(n.midi, song.key);
    return `${accidental}:${degree}`;
  });

describe("transposeSong", () => {
  it("names the new tonic from the PRD's conventional keys", () => {
    const tonic = (/** @type {any} */ song, /** @type {number} */ s) =>
      transposeSong(song, s).key.tonic;
    assert.deepEqual(
      [-1, 1, 2, 4, 6, 8].map((s) => tonic(odeWithChords, s)),
      ["Db", "Eb", "E", "F#", "Ab", "Bb"],
    );
    assert.deepEqual(
      [-3, -1, 2, 4, 6].map((s) => tonic(stJamesSong, s)),
      ["C#", "Eb", "F#", "G#", "Bb"],
    );
  });

  it("moves melody, chords, and tonic together, so every number stays the same", () => {
    for (const song of [odeWithChords, stJamesSong]) {
      for (let s = -6; s <= 6; s++) {
        const moved = transposeSong(song, s);
        assert.deepEqual(numerals(moved), numerals(song), `${song.id} by ${s}`);
        assert.deepEqual(degrees(moved), degrees(song), `${song.id} by ${s}`);
        assert.equal(moved.notes[0].midi, song.notes[0].midi + s);
      }
    }
  });

  it("spells chord roots in the new key", () => {
    const inF = transposeSong(odeWithChords, 3);
    assert.deepEqual(
      inF.chords.map((/** @type {any} */ c) => c.root),
      ["F", "C", "Db", "B"],
    );
  });

  it("keeps the tonic's spelling when moving by octaves", () => {
    const inGb = { ...odeWithChords, key: { ...odeWithChords.key, tonic: "Gb" } };
    assert.equal(transposeSong(inGb, 12).key.tonic, "Gb");
    assert.equal(transposeSong(odeWithChords, -12).notes[0].midi, 54);
  });
});

describe("rekeySong", () => {
  it("keeps what was heard and re-derives the labels", () => {
    const asBMinor = rekeySong(odeWithChords, { tonic: "B", mode: "minor", provisional: false });
    assert.equal(asBMinor.notes, odeWithChords.notes);
    assert.equal(asBMinor.chords[0].root, "D");
    assert.equal(numeralOf(asBMinor.chords[0], asBMinor.key), "III");
    // Ode's opening F# is now 5, in the octave below B minor's home.
    assert.deepEqual(midiToDegree(66, asBMinor.key), { degree: 5, accidental: 0, octave: -1 });
  });

  it("respells every root with an enharmonic twin key, keeping the numerals", () => {
    const inFSharp = transposeSong(odeWithChords, 4);
    const asGb = rekeySong(inFSharp, { tonic: "Gb", mode: "major", provisional: false });
    assert.deepEqual(
      asGb.chords.map((/** @type {any} */ c) => c.root),
      ["Gb", "Db", "Ebb", "C"],
    );
    assert.deepEqual(numerals(asGb), numerals(inFSharp));
  });

  it("otherwise respells only a root the new key can't name", () => {
    const asGb = rekeySong(odeWithChords, { tonic: "Gb", mode: "major", provisional: false });
    assert.deepEqual(
      asGb.chords.map((/** @type {any} */ c) => c.root),
      ["D", "A", "Bb", "Ab"],
    );
    assert.ok(!numerals(asGb).includes("?"));
  });
});
