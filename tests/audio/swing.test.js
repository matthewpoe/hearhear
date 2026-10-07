// Swing playback: an off-beat eighth sounds at about 2/3 of the beat, on-beat
// ticks never move, straight songs are untouched, and the staff stays in
// straight eighths with a "Swing" marking.

import { test } from "node:test";
import assert from "node:assert/strict";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { melodyCues, swingPassage, swingTick } from "../../src/audio/passage.js";
import { songToAbc } from "../../src/staff/abc.js";
import { validateSong } from "../../src/store/song.js";

/** @type {any} */
const odeSong = ode;
/** @type {any} */
const james = stJames;

const FOUR = {
  beatsPerBar: 4,
  beatUnit: /** @type {const} */ (4),
  pickupTicks: 0,
  provisional: false,
};

/** A bar of 4/4 with one eighth pair on beat 2. */
const pair = {
  ...odeSong,
  meter: FOUR,
  chords: [],
  swing: 2,
  notes: [
    { id: "n1", midi: 60, start: 0, dur: 12 },
    { id: "n2", midi: 62, start: 12, dur: 6 },
    { id: "n3", midi: 64, start: 18, dur: 6 },
    { id: "n4", midi: 65, start: 24, dur: 24 },
  ],
};

test("an eighth pair swings long-short, 2:1", () => {
  const range = { fromTick: 0, toTick: 48 };
  const { cues, fromTick, toTick } = swingPassage(
    { cues: melodyCues(pair, range), ...range },
    pair,
  );
  assert.deepEqual(
    cues.map((c) => [c.tick, c.dur]),
    [
      [0, 12],
      [12, 8], // the on-beat eighth lasts 2/3 of the beat
      [20, 4], // the off-beat eighth starts 2/3 of the way in
      [24, 24],
    ],
  );
  assert.deepEqual([fromTick, toTick], [0, 48]);
});

test("on-beat ticks never move; the grid counts from the first downbeat", () => {
  const pickup = { ...FOUR, pickupTicks: 6 };
  assert.equal(swingTick(6, pickup, 2), 6);
  assert.equal(swingTick(18, pickup, 2), 18);
  assert.equal(swingTick(12, pickup, 2), 14); // the off-beat after a half-beat pickup
  assert.equal(swingTick(30, FOUR, 3), 33); // 3:1 puts it at 3/4 of the beat
});

test("straight songs play exactly as before", () => {
  const range = { fromTick: 0, toTick: 96 };
  const passage = { cues: melodyCues(odeSong, range), ...range };
  assert.equal(swingPassage(passage, odeSong), passage);
  const straight = { ...pair, swing: 1 };
  assert.equal(swingPassage(passage, straight), passage);
  assert.equal(swingTick(18, FOUR, 1), 18);
});

test("a meter counted in eighths doesn't swing", () => {
  const sixEight = { ...pair, meter: { ...FOUR, beatsPerBar: 6, beatUnit: 8 } };
  const range = { fromTick: 0, toTick: 48 };
  const passage = { cues: melodyCues(sixEight, range), ...range };
  assert.equal(swingPassage(passage, sixEight), passage);
});

test("St. James swings, and its staff says so in straight eighths", () => {
  assert.equal(james.swing, 2);
  validateSong(james);
  const view = { mode: /** @type {const} */ ("confirmed"), labelStyle: "roman", showDegrees: true };
  const swung = songToAbc(james, view).abc;
  assert.match(swung, /^Q:"Swing"$/m);
  const straight = { ...james };
  delete straight.swing;
  const plain = songToAbc(straight, view).abc;
  assert.doesNotMatch(plain, /^Q:/m);
  // Only the marking differs: the notes are written the same.
  assert.equal(swung.replace(/^Q:"Swing"\n/m, ""), plain);
});

test("validation bounds the ratio", () => {
  assert.throws(() => validateSong({ ...pair, swing: 0.5 }), /swing/);
  assert.throws(() => validateSong({ ...pair, swing: 4 }), /swing/);
  validateSong({ ...pair, swing: 1.5 });
});
