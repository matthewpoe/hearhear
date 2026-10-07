// Every bundled song: it validates, its bars add up in its own meter, the key
// finder ranks its encoded key in the top two, and it is registered as a demo
// tune. Runs over the whole content/songs directory, so a new tune is covered
// the moment its file lands.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validateSong } from "../../src/store/song.js";
import { rankKeys, rebar, ticksPerBar } from "../../src/theory/index.js";
import { sameHome } from "../../src/finding/keys.js";

const dir = new URL("../../content/songs/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
/** @type {import("../../src/types.js").Song[]} */
const songs = files.map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const demoSource = readFileSync(new URL("../../src/finding/demoTunes.js", import.meta.url), "utf8");

describe("bundled songs", () => {
  it("are the demo tunes", () => {
    assert.deepEqual(songs.map((s) => s.id).sort(), [
      "amazing-grace",
      "greensleeves",
      "ode-to-joy",
      "st-james-infirmary",
      "when-the-saints",
    ]);
  });

  for (const [i, song] of songs.entries()) {
    describe(song.title, () => {
      it("passes the store's invariants", () => {
        assert.doesNotThrow(() => validateSong(song));
      });

      it("has a file name matching its id", () => {
        assert.equal(files[i], `${song.id}.json`);
      });

      it("has a pickup shorter than a bar, and bars on the meter grid", () => {
        const barTicks = ticksPerBar(song.meter);
        assert.ok(song.meter.pickupTicks < barTicks);
        const end = Math.max(...song.notes.map((n) => n.start + n.dur));
        const bars = rebar(song, song.meter);
        // Every bar but the last starts on the grid and is followed by another.
        for (const bar of bars.slice(1, -1)) {
          assert.equal((bar.startTick - song.meter.pickupTicks) % barTicks, 0);
        }
        assert.ok(end > song.meter.pickupTicks);
      });

      it("ranks its encoded key in the key finder's top two", () => {
        const top = rankKeys(song.notes)
          .slice(0, 2)
          .map((r) => r.key);
        assert.ok(
          top.some((key) => sameHome(key, song.key)),
          `${song.key.tonic} ${song.key.mode} not in ${top.map((k) => `${k.tonic} ${k.mode}`)}`,
        );
      });

      it("is registered as a demo tune", () => {
        assert.match(demoSource, new RegExp(`content/songs/${song.id}\\.json`));
      });
    });
  }
});
