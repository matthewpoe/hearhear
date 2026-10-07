// "Drone on home": when it may sound, what it holds, and that one player
// ending never cuts it from under another.

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { droneChord } from "../../src/finding/keys.js";
import { song } from "../../src/store/song.js";
import { ui } from "../../src/store/ui.js";
import {
  droneBlocked,
  holdHome,
  homeChord,
  homeDrone,
  releaseHome,
} from "../../src/staff/homeDrone.js";

/** @type {import("../../src/types.js").Song} */
const confirmed = /** @type {any} */ (ode);
const provisional = { ...confirmed, key: { tonic: "C", mode: "major", provisional: true } };
const D_MAJOR = droneChord(confirmed.key, confirmed.notes);

describe("homeChord", () => {
  it("is the finder's D-major triad under Ode to Joy once the key is chosen", () => {
    const chord = homeChord(confirmed, { droneOn: true, demoAwaitingGuess: false });
    assert.deepEqual(chord, D_MAJOR);
    assert.deepEqual(
      chord?.map((m) => m % 12),
      [2, 6, 9],
    ); // D F# A
  });

  it("is null while the switch is off", () => {
    assert.equal(homeChord(confirmed, { droneOn: false, demoAwaitingGuess: false }), null);
  });

  it("is null, with a reason, before the key is chosen or while it is hidden", () => {
    const tentative = { droneOn: true, demoAwaitingGuess: false };
    const hidden = { droneOn: true, demoAwaitingGuess: true };
    assert.equal(homeChord(provisional, tentative), null);
    assert.equal(homeChord(provisional, hidden), null);
    assert.equal(droneBlocked(provisional, tentative), "Choose the key first.");
    assert.equal(droneBlocked(provisional, hidden), "Find home first.");
    assert.equal(droneBlocked(confirmed, tentative), null);
  });
});

describe("holdHome", () => {
  const first = {};
  const second = {};
  afterEach(() => {
    releaseHome(first);
    releaseHome(second);
    ui.update({ droneOn: false });
  });

  it("sounds while any holder remains and the switch is on", () => {
    song.open(confirmed);
    ui.update({ droneOn: true, demoAwaitingGuess: false });
    assert.deepEqual(homeDrone.get(), []);
    holdHome(first);
    holdHome(second);
    assert.deepEqual(homeDrone.get(), D_MAJOR);
    releaseHome(first);
    assert.deepEqual(homeDrone.get(), D_MAJOR);
    releaseHome(second);
    assert.deepEqual(homeDrone.get(), []);
  });

  it("follows the switch at once while held", () => {
    song.open(confirmed);
    ui.update({ droneOn: false, demoAwaitingGuess: false });
    holdHome(first);
    assert.deepEqual(homeDrone.get(), []);
    ui.update({ droneOn: true });
    assert.deepEqual(homeDrone.get(), D_MAJOR);
    ui.update({ droneOn: false });
    assert.deepEqual(homeDrone.get(), []);
  });
});
