import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { FINDER_SIZE, finderHomes, shuffled } from "../../src/finding/finderHomes.js";
import { sameHome } from "../../src/finding/keys.js";
import { rankKeys, transposeSong } from "../../src/theory/index.js";

/** @param {{ tonic: string, mode: string }} key */
const name = (key) => `${key.tonic} ${key.mode}`;

describe("finderHomes", () => {
  for (const tune of [ode, stJames]) {
    const ranked = rankKeys(tune.notes);

    it(`offers ${tune.title}'s top three ranked keys, true key among them`, () => {
      const homes = finderHomes(ranked, tune.id, 0);
      assert.equal(homes.length, FINDER_SIZE);
      assert.deepEqual(
        homes.map(name).sort(),
        ranked
          .slice(0, 3)
          .map((r) => name(r.key))
          .sort(),
      );
      assert.ok(homes.some((home) => sameHome(home, tune.key)));
    });

    it(`leaves out the provisional C for ${tune.title}, which doesn't rank it top three`, () => {
      const homes = finderHomes(ranked, tune.id, 0);
      assert.ok(!homes.some((home) => sameHome(home, { tonic: "C", mode: "major" })));
    });

    it(`doesn't make ${tune.title}'s true key chord 1, though it ranks first`, () => {
      assert.ok(sameHome(ranked[0].key, tune.key));
      assert.ok(!sameHome(finderHomes(ranked, tune.id, 0)[0], tune.key));
    });

    it(`gives "three more" as the next three, all distinct, for ${tune.title}`, () => {
      const seen = new Set();
      for (let set = 0; set < ranked.length / FINDER_SIZE; set++) {
        for (const home of finderHomes(ranked, tune.id, set)) seen.add(name(home));
      }
      assert.equal(seen.size, ranked.length);
    });
  }

  it("offers C when the ranking puts it in the top three", () => {
    const scale = [60, 62, 64, 65, 67, 69, 71, 72, 60, 67, 60];
    const notes = scale.map((midi, i) => ({ id: `n${i}`, midi, start: i * 12, dur: 12 }));
    const homes = finderHomes(rankKeys(notes), "c-tune", 0);
    assert.ok(homes.some((home) => sameHome(home, { tonic: "C", mode: "major" })));
  });

  describe("with a demo's known home", () => {
    for (const tune of [ode, stJames]) {
      const ranked = rankKeys(tune.notes);
      const homes = finderHomes(ranked, tune.id, 0, tune.key);

      it(`keeps ${tune.title}'s home in the first three, not first`, () => {
        assert.equal(homes.length, FINDER_SIZE);
        assert.ok(homes.some((home) => sameHome(home, tune.key)));
        assert.ok(!sameHome(homes[0], tune.key));
      });

      it(`doesn't lead ${tune.title}'s lineup with the dominant`, () => {
        const dominant = transposeSong(/** @type {any} */ (tune), 7).key;
        assert.notEqual(homes[0].tonic, dominant.tonic);
      });

      it(`still offers every key once across the sets for ${tune.title}`, () => {
        const seen = new Set();
        for (let set = 0; set < ranked.length / FINDER_SIZE; set++) {
          for (const home of finderHomes(ranked, tune.id, set, tune.key)) seen.add(name(home));
        }
        assert.equal(seen.size, ranked.length);
      });
    }

    it("moves a known home that ranks low into the first three", () => {
      const ranked = rankKeys(ode.notes);
      const low = ranked[10].key;
      const homes = finderHomes(ranked, ode.id, 0, low);
      assert.ok(homes.some((home) => sameHome(home, low)));
      assert.equal(new Set(homes.map(name)).size, FINDER_SIZE);
    });

    it("is the same lineup every visit", () => {
      const ranked = rankKeys(ode.notes);
      assert.deepEqual(
        finderHomes(ranked, ode.id, 0, ode.key),
        finderHomes(ranked, ode.id, 0, ode.key),
      );
    });
  });

  it("wraps around after the last set", () => {
    const ranked = rankKeys(ode.notes);
    assert.deepEqual(finderHomes(ranked, ode.id, 8), finderHomes(ranked, ode.id, 0));
  });
});

describe("shuffled", () => {
  const items = ["a", "b", "c"];

  it("is the same order for the same seed", () => {
    assert.deepEqual(shuffled(items, "ode-to-joy:0"), shuffled(items, "ode-to-joy:0"));
  });

  it("is a permutation and leaves its input alone", () => {
    assert.deepEqual([...shuffled(items, "x")].sort(), items);
    assert.deepEqual(items, ["a", "b", "c"]);
  });

  it("doesn't always put the first item first", () => {
    const firsts = new Set();
    for (let i = 0; i < 20; i++) firsts.add(shuffled(items, `song-${i}:0`)[0]);
    assert.equal(firsts.size, 3);
  });
});
