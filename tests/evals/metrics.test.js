import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIT_THRESHOLD,
  baselineChord,
  chordNamesIn,
  dropdownTop,
  nudgeWithholds,
  numeralAgreesWithLetter,
  percentile,
  plausible,
  recognized,
  sameHarmony,
  scoreAlternatives,
  scoreSuggestions,
  usesVerdict,
} from "../../evals/metrics.js";
import { chordFromNumeral, fit } from "../../src/theory/index.js";

const G = { tonic: "G", mode: /** @type {const} */ ("major"), provisional: false };
const E_MINOR = { tonic: "E", mode: /** @type {const} */ ("minor"), provisional: false };

/** Four quarter notes in 4/4, G major: B A G D, no pickup. */
const song = {
  schemaVersion: /** @type {const} */ (1),
  id: "t",
  title: "t",
  key: G,
  meter: { beatsPerBar: 4, beatUnit: /** @type {const} */ (4), pickupTicks: 0, provisional: false },
  tempo: 100,
  version: 1,
  notes: [
    { id: "n1", midi: 71, start: 0, dur: 12 },
    { id: "n2", midi: 69, start: 12, dur: 12 },
    { id: "n3", midi: 67, start: 24, dur: 12 },
    { id: "n4", midi: 62, start: 36, dur: 12 },
  ],
  chords: [],
};

test("percentile uses nearest rank and is null for no samples", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([30, 10, 20], 50), 20);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
});

test("numeral and letter agree by chord identity, not spelling", () => {
  assert.ok(numeralAgreesWithLetter("V", "D", G));
  assert.ok(numeralAgreesWithLetter("V7", "D7", G));
  assert.ok(numeralAgreesWithLetter("vii°", "F#dim", G));
  assert.ok(numeralAgreesWithLetter("vii°", "F#°", G));
  assert.ok(numeralAgreesWithLetter("V7", "B7", E_MINOR));
  assert.ok(numeralAgreesWithLetter("bVI", "Eb", G), "Eb is bVI in G");
  assert.ok(numeralAgreesWithLetter("#iv°", "Dbdim", G), "Db and C# are the same root");
  assert.ok(numeralAgreesWithLetter("iiø7", "Aø7", G));
});

test("numeral and letter disagree on a different root, quality, or unreadable text", () => {
  assert.equal(numeralAgreesWithLetter("V", "A", G), false);
  assert.equal(numeralAgreesWithLetter("ii", "A", G), false, "ii is Am, not A");
  assert.equal(numeralAgreesWithLetter("V", "D7", G), false, "a seventh is a different chord");
  assert.equal(numeralAgreesWithLetter("Q", "D", G), false);
  assert.equal(numeralAgreesWithLetter("V", "not a chord", G), false);
});

test("sameHarmony matches root and triad quality, so sevenths count as their triad", () => {
  assert.ok(sameHarmony({ root: "D", type: "7" }, { root: "D", type: "M" }));
  assert.ok(sameHarmony({ root: "C", type: "6" }, { root: "C", type: "M" }));
  assert.ok(sameHarmony({ root: "A#", type: "m" }, { root: "Bb", type: "m7" }));
  assert.equal(sameHarmony({ root: "E", type: "m" }, { root: "E", type: "M" }), false);
  assert.equal(sameHarmony({ root: "G", type: "M" }, { root: "C", type: "M" }), false);
});

test("chordNamesIn flags numerals, chord symbols, and Nashville chords", () => {
  assert.deepEqual(chordNamesIn("Try a V7/IV here."), ["V7/IV"]);
  assert.deepEqual(chordNamesIn("Compare Em and A7, then the ii."), ["Em", "A7", "ii"]);
  assert.deepEqual(chordNamesIn("Does the 6m feel sad?"), ["6m"]);
  assert.deepEqual(chordNamesIn("Hear the V-I pull?"), ["V"]);
  assert.deepEqual(chordNamesIn("Is that a G chord?"), ["G chord"]);
});

test("chordNamesIn flags every letter-and-quality phrase, but not the key's name", () => {
  assert.deepEqual(chordNamesIn("Try D major there, or E minor."), ["D major", "E minor"]);
  assert.deepEqual(chordNamesIn("Hold a D major triad under it."), ["D major triad"]);
  assert.deepEqual(chordNamesIn("An F# diminished seventh, then C augmented."), [
    "F# diminished seventh",
    "C augmented",
  ]);
  assert.deepEqual(chordNamesIn("We are in G major."), []);
  assert.deepEqual(chordNamesIn("The key of E minor, and the G major scale."), []);
});

test("chordNamesIn lets ordinary prose, notes, degrees, and bars through", () => {
  const nudge =
    "Before I say anything, listen to the long E in bar 4. I think it wants to rest. " +
    "Hold just the 5 underneath, i.e. the dominant note, and compare. A drone helps.";
  assert.deepEqual(chordNamesIn(nudge), []);
});

test("a nudge withholds when the model offered nothing to strip and names no chord", () => {
  assert.ok(nudgeWithholds({ message: "Listen to bar 4.", dropped: 0, withheld: 0 }));
  assert.equal(nudgeWithholds({ message: "Try IV.", dropped: 0, withheld: 0 }), false);
  assert.equal(
    nudgeWithholds({ message: "Listen.", dropped: 0, withheld: 1 }),
    false,
    "the server held back a suggestion the model offered",
  );
  assert.equal(
    nudgeWithholds({ message: "Listen.", dropped: 1, withheld: 0 }),
    false,
    "an invalid suggestion was still an offer",
  );
});

test("baselineChord picks the best-fitting candidate", () => {
  // B A G D under bar 1: G major holds B, G, and D; only A is outside it.
  assert.deepEqual(baselineChord(song, "n1"), { root: "G", type: "M" });
});

test("baselineChord ignores chords already placed in the song", () => {
  // Fitted over A G D, G wins; a chord on the G would cut the span to A alone, where D wins.
  const placed = { ...song, chords: [{ id: "c1", noteId: "n3", root: "G", type: "M" }] };
  assert.deepEqual(baselineChord(song, "n2"), { root: "G", type: "M" });
  assert.deepEqual(baselineChord(placed, "n2"), { root: "G", type: "M" });
});

test("scoreSuggestions counts agreement, onsets, clashes, and a hit at the change point", () => {
  const point = { bar: 1, beat: 1, reference: { root: "G", type: "M" } };
  const s = (/** @type {object} */ x) => ({ confidence: "low", reason: "", ...x });
  const score = scoreSuggestions(
    [
      s({ bar: 1, beat: 1, numeral: "I", letter: "G" }), // hit
      s({ bar: 1, beat: 1, numeral: "bVI", letter: "Eb" }), // B over Bb: a clash
      s({ bar: 1, beat: 1, numeral: "V", letter: "A" }), // disagrees: not judged
      s({ bar: 1, beat: 1.5, numeral: "vi", letter: "Em" }), // agrees, no onset there
    ],
    song,
    point,
  );
  assert.deepEqual(score, { suggestions: 4, agreeing: 3, onOnset: 2, clashing: 1, hit: true });
});

test("a matching chord elsewhere is not a hit", () => {
  const point = { bar: 1, beat: 1, reference: { root: "G", type: "M" } };
  const score = scoreSuggestions([{ bar: 1, beat: 3, numeral: "I", letter: "G" }], song, point);
  assert.equal(score.hit, false);
  assert.equal(score.onOnset, 1);
});

test("scoreSuggestions never hits without a reference", () => {
  const point = { bar: 1, beat: 1, reference: null };
  const score = scoreSuggestions([{ bar: 1, beat: 1, numeral: "I", letter: "G" }], song, point);
  assert.equal(score.hit, false);
});

/** @param {string} id */
const noteOf = (id) => /** @type {any} */ (song.notes.find((n) => n.id === id));

test("plausible: agreeing, no clash, fit at the threshold, a recognized chord", () => {
  assert.ok(plausible({ numeral: "I", letter: "G" }, song, noteOf("n1")));
  assert.ok(plausible({ numeral: "V7/V", letter: "A7" }, song, noteOf("n1")), "applied dominant");
  assert.equal(plausible({ numeral: "I", letter: "C" }, song, noteOf("n1")), false, "disagree");
  assert.equal(plausible({ numeral: "vii°", letter: "F#°" }, song, noteOf("n3")), false, "clash");
  const bm = /** @type {any} */ (chordFromNumeral("iii", G));
  assert.ok(fit(song, "n2", bm) < FIT_THRESHOLD, "the A under Bm is only a tension");
  assert.equal(plausible({ numeral: "iii", letter: "Bm" }, song, noteOf("n2")), false, "low fit");
});

test("recognized: diatonic, applied, borrowed, and passing chords; not a stray bII", () => {
  const is = (/** @type {string} */ numeral, key = G) =>
    recognized(numeral, /** @type {any} */ (chordFromNumeral(numeral, key)), key);
  for (const n of [
    "I",
    "ii7",
    "vii°",
    "Imaj7",
    "V7/vi",
    "V/ii",
    "vii°7/V",
    "bVII",
    "iv",
    "#iv°7",
  ]) {
    assert.ok(is(n), n);
  }
  assert.ok(is("II"), "II is V/V");
  assert.equal(is("bII"), false);
  assert.ok(is("VII", E_MINOR), "minor's natural VII");
  assert.ok(is("V7", E_MINOR), "minor's raised V");
});

test("dropdownTop takes the best three by fit, ties to the commoner chord", () => {
  const top = dropdownTop(song, "n1");
  assert.equal(top.length, 3);
  assert.deepEqual(top[0], baselineChord(song, "n1"));
});

test("scoreAlternatives wants two distinct chords at the note, every one plausible", () => {
  const at = (/** @type {string} */ numeral, /** @type {string} */ letter, beat = 1) => ({
    bar: 1,
    beat,
    numeral,
    letter,
  });
  const point = { bar: 1, beat: 1 };
  const good = scoreAlternatives([at("I", "G"), at("V7/V", "A7"), at("IV", "C", 3)], song, point);
  assert.equal(good.atPoint, 2, "only suggestions on the note asked about");
  assert.equal(good.alternatives, true);
  assert.equal(good.plausible, 2);
  assert.equal(good.beyond, 1, "the dropdown's top 3 has I, not A7");
  const twice = scoreAlternatives([at("I", "G"), at("I", "G")], song, point);
  assert.equal(twice.distinct, 1);
  assert.equal(twice.alternatives, false);
  const oneBad = scoreAlternatives([at("I", "G"), at("V7/V", "A7"), at("I", "C")], song, point);
  assert.equal(oneBad.alternatives, false, "a malformed one spoils the reply");
  assert.equal(oneBad.plausible, 2);
});

test("scoreAlternatives sets aside the chord the player placed", () => {
  const placed = { root: "G", type: "M" };
  const point = { bar: 1, beat: 1 };
  const s = (/** @type {string} */ numeral, /** @type {string} */ letter) => ({
    bar: 1,
    beat: 1,
    numeral,
    letter,
  });
  const two = [s("I", "G"), s("V7/V", "A7"), s("IV", "C")];
  assert.equal(scoreAlternatives(two, song, point, placed).alternatives, true);
  assert.equal(scoreAlternatives(two.slice(0, 2), song, point, placed).alternatives, false);
});

test("usesVerdict flags verdict words, whole words in any case", () => {
  for (const m of ["That's wrong.", "Incorrect here", "a MISTAKE", "You should have used IV"]) {
    assert.equal(usesVerdict(m), true, m);
  }
  for (const m of ["It works; try IV too.", "a wrongly placed beam", "unmistakeable", ""]) {
    assert.equal(usesVerdict(m), false, m);
  }
});
