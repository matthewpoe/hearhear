import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { transposeSong } from "../../src/theory/index.js";
import { emptySong } from "../../src/store/song.js";
import {
  HIGHEST_MIDI,
  KEY_CHOICES,
  LOWEST_MIDI,
  melodyFits,
  preferFor,
  semitonesTo,
} from "../../src/toolbar/keys.js";

/** @type {import("../../src/types.js").Song} */
const song = /** @type {any} */ (ode);

/**
 * A song in C with one quarter note per pitch.
 * @param {number[]} midis
 * @param {"major" | "minor"} [mode]
 */
const melody = (midis, mode = "major") => ({
  ...emptySong(),
  key: { tonic: "C", mode, provisional: false },
  notes: midis.map((midi, i) => ({ id: `n${i + 1}`, midi, start: i * 12, dur: 12 })),
});

describe("KEY_CHOICES", () => {
  for (const mode of /** @type {const} */ (["major", "minor"])) {
    it(`every ${mode} choice transposes to the key it names`, () => {
      const start = melody([60], mode);
      for (const tonic of KEY_CHOICES[mode].filter((t) => t !== "C")) {
        const moved = transposeSong(start, semitonesTo(start, tonic), {
          prefer: preferFor(tonic),
        });
        assert.equal(moved.key.tonic, tonic);
      }
    });
  }
});

describe("semitonesTo", () => {
  it("takes the nearest octave, up or down", () => {
    assert.equal(semitonesTo(melody([60, 64]), "D"), 2);
    assert.equal(semitonesTo(melody([60, 64]), "Bb"), -2);
    assert.equal(semitonesTo(song, "C"), -2);
  });

  it("goes the other way when the nearest would leave the keyboard", () => {
    assert.equal(semitonesTo(melody([HIGHEST_MIDI - 1]), "D"), -10);
    assert.equal(semitonesTo(melody([LOWEST_MIDI + 1]), "Bb"), 10);
  });

  it("is 0 for an enharmonic twin", () => {
    const fSharp = { ...melody([66]), key: { tonic: "F#", mode: "major", provisional: false } };
    assert.equal(semitonesTo(fSharp, "Gb"), 0);
  });
});

describe("melodyFits", () => {
  it("allows a move only while every note stays in C2 to C6", () => {
    assert.ok(melodyFits(melody([LOWEST_MIDI + 12, HIGHEST_MIDI - 12]), 12));
    assert.ok(!melodyFits(melody([LOWEST_MIDI + 11, 70]), -12));
    assert.ok(!melodyFits(melody([HIGHEST_MIDI - 11]), 12));
  });

  it("never moves an empty melody", () => {
    assert.ok(!melodyFits(emptySong(), 12));
  });
});
