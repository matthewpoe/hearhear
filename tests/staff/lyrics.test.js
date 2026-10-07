// The words under the staff: each note's optional `lyric` syllable becomes a
// `w:` line in the ABC, the tutor never sees it, and the store keeps or drops
// it sensibly. Assertions count syllable slots; they never spell the words.

import { test } from "node:test";
import assert from "node:assert/strict";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { abcSyllable, hasLyrics, songToAbc } from "../../src/staff/abc.js";
import { toTutorSnapshot } from "../../src/store/snapshot.js";
import { createSongStore, validateSong } from "../../src/store/song.js";
import { transposeSong } from "../../src/theory/index.js";

/** @type {any} */
const james = stJames;
/** @type {any} */
const odeSong = ode;

const VIEW = { mode: /** @type {const} */ ("confirmed"), labelStyle: "roman", showDegrees: false };

/** The `w:` lines of an ABC string, each split into its slot tokens. */
const wordLines = (/** @type {string} */ abc) =>
  abc
    .split("\n")
    .filter((l) => l.startsWith("w:"))
    .map((l) => l.slice(2).trim().split(/\s+/));

test("St. James has one syllable on every note", () => {
  assert.equal(james.notes.length, 28);
  assert.ok(james.notes.every((/** @type {any} */ n) => typeof n.lyric === "string" && n.lyric));
  assert.ok(hasLyrics(james));
  validateSong(james);
});

test("St. James writes a w: line with one slot per drawn note and a syllable per note", () => {
  const { abc, pieces } = songToAbc(james, VIEW);
  const slots = wordLines(abc).flat();
  // One slot per drawn glyph (rests excluded); tied continuations hold "*".
  assert.equal(slots.length, pieces.length);
  const sung = slots.filter((s) => s !== "*");
  assert.equal(sung.length, james.notes.length);
  // A tied piece never starts a new syllable: each note's first glyph carries it.
  const firstGlyph = pieces.map((p, i) => i === 0 || pieces[i - 1].noteId !== p.noteId);
  assert.deepEqual(
    slots.map((s) => s !== "*"),
    firstGlyph,
  );
});

test("split words join with a trailing hyphen only", () => {
  const { abc } = songToAbc(james, VIEW);
  const slots = wordLines(abc).flat();
  const trailing = james.notes.filter((/** @type {any} */ n) => n.lyric.endsWith("-")).length;
  assert.ok(trailing > 0);
  assert.equal(slots.filter((s) => s.endsWith("-")).length, trailing);
  assert.equal(slots.filter((s) => s.startsWith("-")).length, 0);
});

test("words sit on their own line under the degrees", () => {
  const withDegrees = songToAbc(james, { ...VIEW, showDegrees: true }).abc;
  const without = songToAbc(james, VIEW).abc;
  assert.equal(wordLines(withDegrees).length, 2 * wordLines(without).length);
});

test("the Words switch off drops the line", () => {
  const { abc } = songToAbc(james, { ...VIEW, showWords: false });
  assert.equal(wordLines(abc).length, 0);
});

test("Ode to Joy has no words, so no w: line and no switch", () => {
  assert.equal(hasLyrics(odeSong), false);
  assert.equal(wordLines(songToAbc(odeSong, VIEW).abc).length, 0);
});

test("syllables align past rests and ties", () => {
  const song = {
    ...odeSong,
    meter: { beatsPerBar: 4, beatUnit: 4, pickupTicks: 0, provisional: false },
    chords: [],
    notes: [
      { id: "n1", midi: 60, start: 0, dur: 12, lyric: "a" },
      // a rest, then a note tied across the bar line
      { id: "n2", midi: 62, start: 36, dur: 24, lyric: "b-" },
      { id: "n3", midi: 64, start: 60, dur: 12, lyric: "-c" },
    ],
  };
  const { abc } = songToAbc(song, VIEW);
  assert.deepEqual(wordLines(abc), [["a", "b-", "*", "c"]]);
});

test("a syllable can't break the w: line", () => {
  assert.equal(abcSyllable("x*y|z_%"), "xyz");
  assert.equal(abcSyllable("two words"), "two~words");
  assert.equal(abcSyllable("in-ner"), "in\\-ner");
  assert.equal(abcSyllable("-"), "*");
});

test("the tutor snapshot carries no lyrics", () => {
  const snap = JSON.stringify(toTutorSnapshot(james, { labelStyle: "roman" }));
  assert.doesNotMatch(snap, /lyric/i);
  for (const n of james.notes) {
    const word = n.lyric.replace(/^-|-$/g, "");
    if (word.length > 3) assert.ok(!snap.includes(`"${word}`), "a syllable leaked");
  }
});

test("transpose keeps syllables; a recorded take has none", () => {
  const up = transposeSong(james, 2);
  assert.deepEqual(
    up.notes.map((/** @type {any} */ n) => n.lyric),
    james.notes.map((/** @type {any} */ n) => n.lyric),
  );
  const store = createSongStore(structuredClone(james));
  const [id] = store.replaceTake(
    [james.notes[0].id],
    [/** @type {any} */ ({ midi: 71, start: 0, dur: 12, lyric: "x" })],
  );
  const added = store.get().notes.find((n) => n.id === id);
  assert.equal(added?.lyric, undefined);
});

test("validation rejects an empty or overlong syllable", () => {
  const bad = (/** @type {string} */ lyric) => ({
    ...odeSong,
    notes: [{ ...odeSong.notes[0], lyric }],
    chords: [],
  });
  assert.throws(() => validateSong(bad("")), /lyric/);
  assert.throws(() => validateSong(bad("x".repeat(41))), /lyric/);
});
