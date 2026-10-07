// The pure ABC writer (decision D6): bar splitting, ties, per-bar
// accidentals, key signatures from `K:`, hidden mode, chord symbols, and
// lyric (degree) alignment.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chordSymbol, describeNote, HIDDEN_CHORD_MARK, songToAbc } from "../../src/staff/abc.js";

const CONFIRMED = { mode: "confirmed", labelStyle: "roman", showDegrees: true };
const HIDDEN = { ...CONFIRMED, mode: "hidden" };

/**
 * @param {{ tonic: string, mode: "major" | "minor" }} key
 * @param {import("../../src/types.js").Note[]} notes
 * @param {import("../../src/types.js").Chord[]} [chords]
 * @param {Partial<import("../../src/types.js").Meter>} [meter]
 */
function song(key, notes, chords = [], meter = {}) {
  return {
    schemaVersion: /** @type {const} */ (1),
    id: "s",
    title: "Test",
    key: { ...key, provisional: false },
    meter: {
      beatsPerBar: 4,
      beatUnit: /** @type {const} */ (4),
      pickupTicks: 0,
      provisional: false,
      ...meter,
    },
    tempo: 100,
    version: 1,
    notes,
    chords,
  };
}

/** @param {string} id @param {number} midi @param {number} start @param {number} dur */
const note = (id, midi, start, dur) => ({ id, midi, start, dur });

/** The music lines (no header, no lyric lines). */
const body = (/** @type {string} */ abc) =>
  abc
    .trim()
    .split("\n")
    .filter((line) => !/^[A-Z]:/.test(line) && !line.startsWith("w:"));
const header = (/** @type {string} */ abc, /** @type {string} */ field) =>
  abc.split("\n").find((line) => line.startsWith(`${field}:`));
const lyrics = (/** @type {string} */ abc) => abc.split("\n").filter((l) => l.startsWith("w:"));

test("a note crossing the bar line is split into tied pieces, one per bar", () => {
  const { abc, pieces } = songToAbc(
    song({ tonic: "C", mode: "major" }, [note("a", 60, 36, 24)]),
    CONFIRMED,
  );
  assert.deepEqual(body(abc), ["z36 C12- | C12 |]"]);
  assert.deepEqual(pieces, [
    { noteId: "a", chordId: null },
    { noteId: "a", chordId: null },
  ]);
});

test("an undrawable length is tied from drawable glyphs, longest first", () => {
  const { abc } = songToAbc(song({ tonic: "C", mode: "major" }, [note("a", 60, 0, 30)]), CONFIRMED);
  assert.deepEqual(body(abc), ["C24- C6 |]"]);
});

test("an accidental lasts to the end of its bar and is restated after the bar line", () => {
  const { abc } = songToAbc(
    song({ tonic: "C", mode: "major" }, [
      note("a", 66, 0, 12),
      note("b", 66, 12, 12),
      note("c", 65, 24, 12),
      note("d", 66, 48, 12),
    ]),
    CONFIRMED,
  );
  // F# then a bare F# (still sharp), then F natural, then a new bar restates the sharp.
  assert.deepEqual(body(abc), ["^F12 F12 =F12 z12 | ^F12 |]"]);
});

test("a flat minor key takes its signature from K:, so a diatonic flat first in the bar is bare", () => {
  // C minor: three flats (B, E, A). Eb and Ab are diatonic; E natural needs a natural sign.
  const { abc } = songToAbc(
    song({ tonic: "C", mode: "minor" }, [
      note("a", 63, 0, 12),
      note("b", 68, 12, 12),
      note("c", 64, 24, 12),
      note("d", 63, 36, 12),
    ]),
    CONFIRMED,
  );
  assert.equal(header(abc, "K"), "K:Cm");
  assert.deepEqual(body(abc), ["E12 A12 =E12 _E12 |]"]);
});

test("F minor (four flats) writes Db bare and D natural with a sign", () => {
  const { abc } = songToAbc(
    song({ tonic: "F", mode: "minor" }, [note("a", 61, 0, 24), note("b", 62, 24, 24)]),
    CONFIRMED,
  );
  assert.equal(header(abc, "K"), "K:Fm");
  assert.deepEqual(body(abc), ["D24 =D24 |]"]);
});

test("a theoretical key beyond seven accidentals falls back to K:C with accidentals on the notes", () => {
  const { abc } = songToAbc(
    song({ tonic: "G#", mode: "major" }, [note("a", 68, 0, 48)]),
    CONFIRMED,
  );
  assert.equal(header(abc, "K"), "K:C");
  assert.match(body(abc)[0], /^\^G48/);
});

test("hidden mode writes K:C, accidentals on the notes, no degrees, and a neutral chord mark", () => {
  const { abc } = songToAbc(
    song(
      { tonic: "D", mode: "major" },
      [note("a", 66, 0, 24), note("b", 66, 24, 24)],
      [{ id: "x", noteId: "a", root: "D", type: "M" }],
    ),
    HIDDEN,
  );
  assert.equal(header(abc, "K"), "K:C");
  assert.deepEqual(body(abc), [`"${HIDDEN_CHORD_MARK}"^F24 F24 |]`]);
  assert.deepEqual(lyrics(abc), []);
  assert.doesNotMatch(abc, /"D"/);
});

test("confirmed mode writes the chord's letter name and no numeral", () => {
  const { abc, pieces } = songToAbc(
    song(
      { tonic: "D", mode: "major" },
      [note("a", 66, 0, 48)],
      [{ id: "x", noteId: "a", root: "A", type: "7" }],
    ),
    CONFIRMED,
  );
  assert.deepEqual(body(abc), ['"A7"F48 |]']);
  assert.deepEqual(pieces, [{ noteId: "a", chordId: "x" }]);
});

test("chord symbol text can't break out of its ABC quotes", () => {
  const nasty = { root: "D", type: '"\nK:F %x\\' };
  assert.equal(chordSymbol(nasty, "confirmed"), "DK:F x");
  assert.equal(chordSymbol({ root: '"', type: "M" }, "confirmed"), "?");
  const { abc } = songToAbc(
    song(
      { tonic: "C", mode: "major" },
      [note("a", 60, 0, 48)],
      [{ id: "x", noteId: "a", ...nasty }],
    ),
    CONFIRMED,
  );
  assert.equal(abc.split("\n").filter((l) => l.startsWith("K:")).length, 1);
});

test("degree lyrics align one syllable per glyph, with * for tied continuations and jianpu dots", () => {
  const { abc } = songToAbc(
    song({ tonic: "C", mode: "major" }, [
      note("a", 60, 0, 12),
      note("b", 72, 12, 12),
      note("c", 59, 24, 36),
      note("d", 66, 60, 12),
    ]),
    CONFIRMED,
  );
  assert.deepEqual(body(abc), ["C12 c12 B,24- | B,12 ^F12 |]"]);
  assert.deepEqual(lyrics(abc), ["w:1 1̇ 7̣ * ♯4"]);
});

test("the accessible name says only what the staff shows", () => {
  const key = { tonic: "D", mode: /** @type {const} */ ("major"), provisional: false };
  const chord = { id: "x", noteId: "a", root: "D", type: "M" };
  const n = note("a", 66, 0, 12);
  assert.equal(describeNote(n, chord, key, CONFIRMED), "F sharp 4, degree 3, chord D");
  assert.equal(describeNote(n, chord, key, HIDDEN), "F sharp 4, chord");
});
