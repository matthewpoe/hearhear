// Run by playbackDrone.test.js under --experimental-test-module-mocks, so the
// audio module can be replaced by a recorder (npm test runs without the flag).

import assert from "node:assert/strict";
import { mock, test } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };

/** Every drone() call, in order. */
const drones = /** @type {(number | number[] | null)[]} */ ([]);
/** Ends the phrase now playing, as audio's stop() does. */
let endPhrase = () => {};

mock.module(import.meta.resolve("../../src/audio/index.js"), {
  namedExports: {
    drone: (/** @type {number | number[] | null} */ tones) => drones.push(tones),
    playPhrase: () => new Promise((resolve) => (endPhrase = () => resolve(undefined))),
    stop: () => {
      endPhrase();
      drones.push(null);
    },
  },
});

const { song } = await import("../../src/store/song.js");
const { ui } = await import("../../src/store/ui.js");
const { droneChord } = await import("../../src/finding/keys.js");
const { playWithVisuals } = await import("../../src/staff/playback.js");
const { stop } = await import("../../src/audio/index.js");

test("the finder's drone outlasts the home drone of the play it replaces", async () => {
  song.open(/** @type {any} */ (ode));
  ui.update({ droneOn: true, demoAwaitingGuess: false });
  const range = { fromTick: 0, toTick: 48 };
  const home = droneChord(ode.key, ode.notes);
  const finder = [57, 61, 64]; // a candidate home, A major

  const first = playWithVisuals(range);
  assert.deepEqual(drones.at(-1), home);
  const second = playWithVisuals(range, { chords: [], drone: finder });
  await first; // its finally runs after the finder's drone started
  assert.deepEqual(drones.at(-1), finder);

  stop();
  await second;
  assert.equal(drones.at(-1), null);
});
