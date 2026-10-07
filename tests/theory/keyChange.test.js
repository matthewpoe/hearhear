import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { Key, Note } from "tonal";
import { midiToDegree, numeralOf, rekeySong, transposeSong } from "../../src/theory/index.js";
import { chromaOf, mod } from "../../src/theory/pitch.js";

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

  it("defaults to the key signature with fewer accidentals, F# major and Eb minor on a tie", () => {
    const signature = (/** @type {string} */ tonic, /** @type {string} */ mode) =>
      Math.abs(mode === "major" ? Key.majorKey(tonic).alteration : Key.minorKey(tonic).alteration);
    for (const song of [odeWithChords, stJamesSong]) {
      const { mode } = song.key;
      for (let s = 1; s < 12; s++) {
        const { tonic } = transposeSong(song, s).key;
        const twin = /** @type {string} */ (Note.enharmonic(tonic));
        if (twin === tonic || signature(twin, mode) > 7) continue;
        assert.ok(signature(tonic, mode) <= signature(twin, mode), `${tonic} over ${twin}`);
      }
    }
    assert.equal(transposeSong(odeWithChords, 4).key.tonic, "F#");
    assert.equal(transposeSong(stJamesSong, -1).key.tonic, "Eb");
  });

  it("names the tonic with sharps or flats on request, where both are real keys", () => {
    const tonic = (
      /** @type {any} */ song,
      /** @type {number} */ s,
      /** @type {"sharps" | "flats"} */ prefer,
    ) => transposeSong(song, s, { prefer }).key.tonic;
    assert.deepEqual(
      [-1, 4, 9].map((s) => [tonic(odeWithChords, s, "sharps"), tonic(odeWithChords, s, "flats")]),
      [
        ["C#", "Db"],
        ["F#", "Gb"],
        ["B", "Cb"],
      ],
    );
    assert.deepEqual(
      [-1, 4, 6].map((s) => [tonic(stJamesSong, s, "sharps"), tonic(stJamesSong, s, "flats")]),
      [
        ["D#", "Eb"],
        ["G#", "Ab"],
        ["A#", "Bb"],
      ],
    );
    // Only one real key: the preference can't apply.
    assert.equal(tonic(odeWithChords, 2, "flats"), "E");
    assert.equal(tonic(odeWithChords, 1, "sharps"), "Eb");
    assert.equal(tonic(stJamesSong, -3, "flats"), "C#");
  });

  it("rejects a preference that isn't sharps or flats", () => {
    assert.throws(
      () => transposeSong(odeWithChords, 1, /** @type {any} */ ({ prefer: "naturals" })),
      RangeError,
    );
  });

  it("moves melody, chords, and tonic together, so every number stays the same", () => {
    for (const song of [odeWithChords, stJamesSong]) {
      for (let s = -11; s <= 11; s++) {
        for (const prefer of /** @type {const} */ ([undefined, "sharps", "flats"])) {
          const moved = transposeSong(song, s, { prefer });
          const at = `${song.id} by ${s} to ${moved.key.tonic}`;
          // The one exception: bVI in Db, Gb, or Cb would need a double flat.
          const expected = ["Db", "Gb", "Cb"].includes(moved.key.tonic)
            ? numerals(song).map((n) => (n === "bVI" ? "#V" : n))
            : numerals(song);
          assert.deepEqual(numerals(moved), expected, at);
          assert.deepEqual(degrees(moved), degrees(song), at);
          assert.equal(moved.notes[0].midi, song.notes[0].midi + s);
          for (const [i, c] of moved.chords.entries()) {
            assert.ok(!c.root.includes("bb"), `${at}: ${c.root}`);
            assert.equal(mod(chromaOf(c.root) - chromaOf(song.chords[i].root), 12), mod(s, 12));
          }
        }
      }
    }
  });

  it("respells a double-flat root to the key's conventional letter", () => {
    const inDb = transposeSong(odeWithChords, -1);
    assert.deepEqual(
      inDb.chords.map((/** @type {any} */ c) => c.root),
      ["Db", "Ab", "A", "G"],
    );
    assert.deepEqual(numerals(inDb), ["I", "V7", "#V", "#iv°7"]);
  });

  it("keeps a double sharp, minor's own spelling of its raised degrees", () => {
    /** @type {any} */
    const withLeadingTone = {
      ...stJamesSong,
      chords: [{ id: "c1", noteId: "n1", root: "D#", type: "dim7" }],
    };
    const inGSharp = transposeSong(withLeadingTone, 4);
    assert.equal(inGSharp.chords[0].root, "F##");
    assert.deepEqual(numerals(inGSharp), ["#vii°7"]);
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
