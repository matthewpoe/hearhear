import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { LOWEST_MIDI, droneMidi, easyModeHomes, sameHome } from "../../src/finding/keys.js";

/** @param {{ notes: { midi: number }[] }} song */
const lowestOf = (song) => Math.min(...song.notes.map((n) => n.midi));

describe("droneMidi", () => {
  for (const tune of [ode, stJames]) {
    it(`sits within an octave below the lowest note of ${tune.title}`, () => {
      const lowest = lowestOf(tune);
      for (const key of [tune.key, { tonic: "C", mode: "major" }]) {
        const midi = droneMidi(key, tune.notes);
        assert.ok(midi < lowest, `${key.tonic}: ${midi} not below ${lowest}`);
        assert.ok(midi >= lowest - 12, `${key.tonic}: ${midi} more than an octave below`);
      }
    });
  }

  it("puts the true key's tonic on its own pitch class", () => {
    assert.equal(droneMidi(ode.key, ode.notes) % 12, 2); // D
    assert.equal(droneMidi(stJames.key, stJames.notes) % 12, 4); // E
  });

  it("never goes below C2, sharing the register when the melody reaches it", () => {
    assert.equal(LOWEST_MIDI, 36);
    assert.equal(droneMidi({ tonic: "C", mode: "major" }, [{ midi: 36 }]), 36);
    assert.equal(droneMidi({ tonic: "D", mode: "major" }, [{ midi: 37 }]), 38);
    assert.equal(droneMidi({ tonic: "B", mode: "minor" }, [{ midi: 40 }]), 47);
  });
});

describe("sameHome", () => {
  it("treats enharmonic tonics as one home", () => {
    assert.ok(sameHome({ tonic: "C#", mode: "minor" }, { tonic: "Db", mode: "minor" }));
    assert.ok(sameHome({ tonic: "F#", mode: "major" }, { tonic: "Gb", mode: "major" }));
  });

  it("tells modes and different homes apart", () => {
    assert.ok(!sameHome({ tonic: "C#", mode: "minor" }, { tonic: "Db", mode: "major" }));
    assert.ok(!sameHome({ tonic: "C", mode: "major" }, { tonic: "D", mode: "major" }));
  });
});

describe("easyModeHomes", () => {
  const C = { tonic: "C", mode: "major" };
  /** @param {string} tonic @param {"major" | "minor"} mode */
  const ranked = (tonic, mode) => ({ key: { tonic, mode, provisional: false }, score: 0 });

  it("puts the current home first, then the top candidates", () => {
    const homes = easyModeHomes(C, [ranked("D", "major"), ranked("A", "major")], 3);
    assert.deepEqual(homes, [C, { tonic: "D", mode: "major" }, { tonic: "A", mode: "major" }]);
  });

  it("skips a candidate that is the current home, so the first comparison differs", () => {
    const homes = easyModeHomes(C, [ranked("C", "major"), ranked("G", "major")], 1);
    assert.deepEqual(homes, [C, { tonic: "G", mode: "major" }]);
  });
});
