import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import {
  candidates,
  chordFromNumeral,
  passageBelow,
  rebar,
  voice,
} from "../../src/theory/index.js";

/** @type {any} */
const odeSong = ode;
const D_MAJOR = odeSong.key;

/** The lowest melody note in one bar. @param {any} song @param {number} bar */
function lowestIn(song, bar) {
  const ids = rebar(song, song.meter).find((b) => b.index === bar)?.noteIds ?? [];
  return Math.min(...song.notes.filter((n) => ids.includes(n.id)).map((n) => n.midi));
}

/** @param {string} numeral @param {any} key */
const chord = (numeral, key) => /** @type {any} */ (chordFromNumeral(numeral, key));

/** @param {number[]} midis */
const pitchClasses = (midis) => midis.map((m) => m % 12).sort((a, b) => a - b);

describe("voice", () => {
  it("sits below the melody under Ode's bar 4", () => {
    const below = lowestIn(odeSong, 4);
    assert.equal(below, 64);
    for (const numeral of ["I", "IV", "V", "ii", "vi"]) {
      const voicing = voice(chord(numeral, D_MAJOR), null, { below });
      assert.ok(
        voicing.every((m) => m < below),
        `${numeral}: ${voicing}`,
      );
    }
  });

  it("plays every tone of the chord, ascending", () => {
    const A7 = { root: "A", type: "7" };
    const voicing = voice(A7, null, { below: 64 });
    assert.deepEqual(
      voicing,
      [...voicing].sort((a, b) => a - b),
    );
    assert.deepEqual(pitchClasses(voicing), [1, 4, 7, 9]);
  });

  it("starts a passage in root position, tucked just under the melody", () => {
    assert.deepEqual(voice(chord("I", D_MAJOR), null, { below: 66 }), [50, 54, 57]);
  });

  it("moves to the nearest inversion from the previous chord", () => {
    const I = voice({ root: "C", type: "M" }, null, { below: 72 });
    assert.deepEqual(I, [60, 64, 67]);
    assert.deepEqual(voice({ root: "F", type: "M" }, I, { below: 72 }), [60, 65, 69]);
    assert.deepEqual(voice({ root: "G", type: "7" }, I, { below: 72 }), [59, 62, 65, 67]);
  });

  it("gives alternatives the same register, so A and B differ only in harmony", () => {
    const below = lowestIn(odeSong, 4);
    const previous = voice(chord("I", D_MAJOR), null, { below });
    const tops = candidates(D_MAJOR, { extended: true }).map(
      (c) => /** @type {number} */ (voice(c, previous, { below }).at(-1)),
    );
    assert.ok(Math.max(...tops) - Math.min(...tops) < 12, `tops ${tops}`);
    assert.ok(tops.every((t) => t < below));
  });

  it("never goes below C2; under a melody that low, sits at the floor", () => {
    const C2 = 36;
    // D at the floor, under a melody note (E2) it overlaps.
    assert.deepEqual(voice(chord("I", D_MAJOR), null, { below: 40 }), [38, 42, 45]);
    for (let below = 24; below <= 47; below++) {
      let previous = null;
      for (const c of candidates(D_MAJOR, { extended: true })) {
        previous = voice(c, previous, { below });
        assert.ok(previous[0] >= C2, `under ${below}: ${previous}`);
        assert.ok(previous[0] < C2 + 12, `under ${below}, in the bottom octave: ${previous}`);
      }
    }
  });

  it("leaves chords above the floor alone", () => {
    // The lowest voicing that still fits wholly under the melody is untouched.
    assert.deepEqual(voice({ root: "C", type: "M" }, null, { below: 44 }), [36, 40, 43]);
  });

  it("never drifts down across a long passage", () => {
    /** @type {any} */
    const song = stJames;
    const below = Math.min(...song.notes.map((/** @type {any} */ n) => n.midi));
    let previous = null;
    for (const numeral of ["i", "iv", "i", "V", "i", "iv", "V", "i", "VI", "V", "i"]) {
      previous = voice(chord(numeral, song.key), previous, { below });
      assert.ok(
        previous.every((m) => m < below && m >= below - 24),
        `${numeral}: ${previous}`,
      );
    }
  });
});

describe("passageBelow", () => {
  const bar = 48;
  /** @type {any} */
  const song = {
    notes: [
      { id: "a", midi: 50, start: 0, dur: 60 }, // held into bar 2 from bar 1
      { id: "b", midi: 67, start: 48, dur: 12 },
      { id: "c", midi: 62, start: 84, dur: 12 },
      { id: "d", midi: 55, start: 96, dur: 12 }, // starts exactly where bar 2 ends
    ],
  };

  it("is the lowest melody note that starts in the range", () => {
    assert.equal(passageBelow(song, { fromTick: bar, toTick: 2 * bar }), 62);
    assert.equal(passageBelow(song, { fromTick: 0, toTick: 3 * bar }), 50);
  });

  it("matches Ode's bar 4", () => {
    const bar4 = /** @type {any} */ (rebar(odeSong, odeSong.meter).find((b) => b.index === 4));
    const range = { fromTick: bar4.startTick, toTick: bar4.startTick + bar };
    assert.equal(passageBelow(odeSong, range), lowestIn(odeSong, 4));
  });

  it("is middle C when no note starts in the range", () => {
    assert.equal(passageBelow(song, { fromTick: 12, toTick: 48 }), 60);
    assert.equal(passageBelow({ notes: [] }, { fromTick: 0, toTick: bar }), 60);
  });
});
