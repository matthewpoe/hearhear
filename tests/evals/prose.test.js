import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chordFromNumeral } from "../../src/theory/index.js";
import {
  barCitations,
  citesRepeat,
  findRepeats,
  missingBars,
  namedAlternatives,
  namedChords,
  numberedTests,
} from "../../evals/prose.js";

const G = { tonic: "G", mode: /** @type {const} */ ("major"), provisional: false };
const C = { tonic: "C", mode: /** @type {const} */ ("major"), provisional: false };

/** @param {string} message */
const names = (message) => namedChords(message, G).map((n) => n.text);

/**
 * A card, as the tutor's suggestions carry it.
 * @param {number} bar @param {number} beat @param {string} numeral @param {string} letter
 */
const card = (bar, beat, numeral, letter) => ({ bar, beat, numeral, letter });

/** Bars 1..16 of a song. */
const sixteen = new Set(Array.from({ length: 16 }, (_, i) => i + 1));

test("barCitations reads bars, ranges, lists, and beats, never a bare number", () => {
  const at = (/** @type {string} */ text) =>
    barCitations(text).map(({ from, to, beat }) => [from, to, beat]);
  assert.deepEqual(at("Look at bar 5, beat 3."), [[5, 5, 3]]);
  assert.deepEqual(at("Bars 1–4 come back in bars 9-12."), [
    [1, 4, null],
    [9, 12, null],
  ]);
  assert.deepEqual(at("In bars 1, 5, and 9 the 3 is long."), [
    [1, 1, null],
    [5, 5, null],
    [9, 9, null],
  ]);
  assert.deepEqual(at("measures 3 to 4"), [[3, 4, null]]);
  assert.deepEqual(at("The 5 in the tune, 3 times."), []);
});

test("missingBars: a bar the song doesn't have fails, every cited bar that exists passes", () => {
  assert.deepEqual(missingBars("Try V at bar 99.", sixteen), [99], "bar 99 in a 16-bar song");
  assert.deepEqual(missingBars("Bars 15–17 close it.", sixteen), [17], "a range past the end");
  assert.deepEqual(missingBars("Bars 1–4 and bar 16.", sixteen), []);
  assert.deepEqual(missingBars("No bars at all.", sixteen), []);
});

/**
 * A snapshot of bars with these degree sequences, from bar 1.
 * @param {string[][]} bars
 */
const snapshotOf = (bars) => ({
  bars: [
    { bar: 0, notes: [{ degree: "5" }] },
    ...bars.map((degrees, i) => ({ bar: i + 1, notes: degrees.map((degree) => ({ degree })) })),
  ],
});

test("findRepeats finds two runs of 2+ bars with the same degrees, at full length", () => {
  const snapshot = snapshotOf([
    ["1", "3"],
    ["2", "1"],
    ["5", "5"],
    ["6", "5"],
    ["1", "3"],
    ["2", "1"],
    ["5", "5"],
    ["1"],
  ]);
  assert.deepEqual(findRepeats(snapshot), [{ first: [1, 3], second: [5, 7] }], "maximal only");
  assert.deepEqual(
    findRepeats(snapshotOf([["1"], ["2"], ["1"], ["3"]])),
    [],
    "one bar is no repeat",
  );
  assert.deepEqual(findRepeats(snapshotOf([[], [], [], []])), [], "empty bars never match");
});

test("citesRepeat wants both of a repeat's places cited", () => {
  const repeats = [
    {
      first: /** @type {[number, number]} */ ([1, 4]),
      second: /** @type {[number, number]} */ ([9, 12]),
    },
  ];
  assert.equal(citesRepeat("Bars 9–12 repeat bars 1–4, so reuse that chart.", repeats), true);
  assert.equal(citesRepeat("Bar 9 starts the same tune as bar 1.", repeats), true);
  assert.equal(citesRepeat("Bars 1–4 set up the tune.", repeats), false, "cited by only one range");
  assert.equal(citesRepeat("Bars 1–16 and bars 9–12.", repeats), false, "a range far past the run");
  assert.equal(citesRepeat("Anything.", []), null, "no repeat to cite");
});

test("numberedTests counts numbered things to try; more than three is too many", () => {
  const three = "Three tests:\n1. Play IV in bar 2.\n2. Try vi in bar 3.\n3) Hold V in bar 4.";
  assert.equal(numberedTests(three), 3);
  const four = `${three}\n4. Try ii in bar 5.`;
  assert.equal(numberedTests(four), 4, "four numbered tests");
  assert.equal(numberedTests("Try (1) IV, then (2) vi."), 2);
  assert.equal(numberedTests("Test 1 is IV; test 2 is vi."), 2);
  assert.equal(numberedTests("Bar 4. Then bar 5. Then bar 6. Then bar 7."), 0, "not a list");
});

test("namedChords reads every label style, but not pronouns, notes, degrees, or the key", () => {
  assert.deepEqual(names("Try G7, then V7/IV and ii."), ["G7", "V7/IV", "ii"]);
  assert.deepEqual(names("In Nashville, the 5⁷ or the 2m."), ["5⁷", "2m"]);
  assert.deepEqual(names("Under it, an E minor chord or a D major."), ["E minor chord", "D major"]);
  assert.deepEqual(names("I hear the long E; the 5 and 3 in bar 4 are strong."), []);
  assert.deepEqual(names("We are in G major, the key of G major."), []);
  const [five] = namedChords("the 5⁷", G);
  assert.deepEqual(five.chord, { root: "D", type: "7" });
  const [two] = namedChords("the 2m", G);
  assert.deepEqual(two.chord, { root: "A", type: "m" });
});

test("a named alternative needs its card", () => {
  const prose = "Try G7 here for more pull.";
  assert.deepEqual(
    namedAlternatives(prose, [card(2, 1, "V7", "G7")], C, []).uncarded,
    [],
    "G7 with a G7 card",
  );
  assert.deepEqual(namedAlternatives(prose, [], C, []).uncarded, ["G7"], "G7 with no card");
  assert.deepEqual(
    namedAlternatives("Try V7 here.", [card(2, 1, "V", "G")], C, []).uncarded,
    [],
    "a V card stands for V7",
  );
  assert.deepEqual(
    namedAlternatives("Try ii or V7/IV.", [card(3, 1, "ii", "Dm")], C, []).uncarded,
    ["V7/IV"],
  );
});

test("a card must sit at the bar (and beat) the prose cites", () => {
  const prose = "In bar 3, beat 1, try IV.";
  assert.deepEqual(namedAlternatives(prose, [card(3, 1, "IV", "F")], C, []).uncarded, []);
  assert.deepEqual(
    namedAlternatives(prose, [card(5, 1, "IV", "F")], C, []).uncarded,
    ["IV"],
    "wrong bar",
  );
  assert.deepEqual(
    namedAlternatives(prose, [card(3, 3, "IV", "F")], C, []).uncarded,
    ["IV"],
    "wrong beat",
  );
  assert.deepEqual(
    namedAlternatives("Bars 3–4 could take vi.", [card(4, 1, "vi", "Am")], C, []).uncarded,
    [],
    "anywhere in a cited range",
  );
});

test("the student's own chords are not alternatives", () => {
  const none = (/** @type {string} */ prose, chart = /** @type {any[]} */ ([])) =>
    namedAlternatives(prose, [], C, chart);
  assert.deepEqual(none("Your Dm is a fine choice.").alternatives, [], "your Dm without a card");
  assert.deepEqual(none("You have IV here, which works.").alternatives, []);
  assert.deepEqual(none("You've got V7 there.").alternatives, []);
  assert.deepEqual(none("Your IV and V set it up.").alternatives, [], "a list after 'your'");
  assert.deepEqual(none("Keep it, but try ii instead of IV.").alternatives, ["ii"]);
  assert.deepEqual(none("Your chord there is fine.").alternatives, [], "your chord, unnamed");
  const chart = [{ bar: 3, beat: 1, chord: { root: "F", type: "M" } }];
  assert.deepEqual(
    none("IV at bar 3 sets up V.", chart).alternatives,
    ["V"],
    "the chart's IV in a cited bar",
  );
  assert.deepEqual(
    none("IV at bar 3 sets up V. Then V at bar 4.", chart).alternatives,
    ["V", "V"],
    "the chart's IV in bar 3 isn't a V in bar 4",
  );
  const placed = [{ bar: 2, beat: 1, chord: { root: "G", type: "M" } }];
  assert.deepEqual(
    none("V works here because the melody's D is its fifth.", placed).alternatives,
    [],
    "with no bar in sight, a chord the chart has: in a check, the chord asked about",
  );
  assert.deepEqual(
    none("In bar 2 the tune turns. V there pulls home.", placed).alternatives,
    [],
    "an earlier sentence on the line gives the place",
  );
  assert.deepEqual(
    none("In bar 2 the tune turns.\nV there pulls home.", [
      { bar: 5, beat: 1, chord: { root: "G", type: "M" } },
    ]).alternatives,
    [],
    "a new line starts with no place, and the chart has V somewhere",
  );
});

test("the review fixture names no alternative without its card", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../../contracts/fixtures/tutor/review.json", import.meta.url), "utf8"),
  );
  const message = fixture.events
    .filter((/** @type {{ event: string }} */ e) => e.event === "message")
    .map((/** @type {{ data: { delta: string } }} */ e) => e.data.delta)
    .join("");
  const { suggestions } = fixture.events.find(
    (/** @type {{ event: string }} */ e) => e.event === "suggestions",
  ).data;
  const D = { tonic: "D", mode: /** @type {const} */ ("major"), provisional: false };
  // Its chart, as the fixture describes it: I | V | I | I V | I | V | I | V I.
  /** @type {[number, number, string][]} */
  const plan = [
    [1, 1, "I"],
    [2, 1, "V"],
    [3, 1, "I"],
    [4, 1, "I"],
    [4, 3, "V"],
    [5, 1, "I"],
    [6, 1, "V"],
    [7, 1, "I"],
    [8, 1, "V"],
    [8, 3, "I"],
  ];
  const chart = plan.map(([bar, beat, numeral]) => ({
    bar,
    beat,
    chord: /** @type {import("../../src/types.js").ChordSpec} */ (chordFromNumeral(numeral, D)),
  }));
  const named = namedAlternatives(message, suggestions, D, chart);
  assert.ok(named.alternatives.length > 0, "it names alternatives");
  assert.deepEqual(named.uncarded, []);
  assert.ok(numberedTests(message) <= 3);
  const repeats = [
    {
      first: /** @type {[number, number]} */ ([1, 3]),
      second: /** @type {[number, number]} */ ([5, 7]),
    },
  ];
  assert.equal(citesRepeat(message, repeats), true);
});
