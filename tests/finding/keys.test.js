import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { LOWEST_MIDI, droneChord, sameHome, tonicIn } from "../../src/finding/keys.js";

/** @param {{ notes: { midi: number }[] }} song */
const lowestOf = (song) => Math.min(...song.notes.map((n) => n.midi));

describe("droneChord", () => {
  for (const tune of [ode, stJames]) {
    it(`sits wholly below the lowest note of ${tune.title}, within an octave`, () => {
      const lowest = lowestOf(tune);
      for (const key of [tune.key, { tonic: "C", mode: "major" }, { tonic: "B", mode: "minor" }]) {
        const chord = droneChord(key, tune.notes);
        const top = Math.max(...chord);
        assert.ok(top < lowest, `${key.tonic}: top ${top} not below ${lowest}`);
        assert.ok(top >= lowest - 12, `${key.tonic}: top ${top} more than an octave below`);
      }
    });
  }

  it("is the root-position tonic triad of the key's mode", () => {
    const [root, third, fifth] = droneChord(ode.key, ode.notes);
    assert.equal(root % 12, 2); // D
    assert.deepEqual([third - root, fifth - root], [4, 7]);
    const minor = droneChord(stJames.key, stJames.notes);
    assert.equal(minor[0] % 12, 4); // E
    assert.deepEqual([minor[1] - minor[0], minor[2] - minor[0]], [3, 7]);
  });

  it("never puts the root below C2, sharing the register when the melody reaches it", () => {
    assert.equal(LOWEST_MIDI, 36);
    assert.deepEqual(droneChord({ tonic: "C", mode: "major" }, [{ midi: 36 }]), [36, 40, 43]);
    assert.deepEqual(droneChord({ tonic: "D", mode: "major" }, [{ midi: 40 }]), [38, 42, 45]);
    assert.deepEqual(droneChord({ tonic: "A", mode: "minor" }, [{ midi: 60 }]), [45, 48, 52]);
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

describe("tonicIn", () => {
  it("spells a home as that mode's chips do", () => {
    assert.equal(tonicIn("minor", { tonic: "Db", mode: "major" }), "C#");
    assert.equal(tonicIn("major", { tonic: "C#", mode: "minor" }), "Db");
    assert.equal(tonicIn("minor", { tonic: "D#", mode: "minor" }), "Eb");
  });
});
