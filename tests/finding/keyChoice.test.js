import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { afterHomeClick, afterModeChange, chosenTonic } from "../../src/finding/keyChoice.js";
import { PROVISIONAL_C } from "../../src/finding/keys.js";

/** @typedef {import("../../src/types.js").Key} Key */

/** @type {Key} */
const D_MAJOR = { tonic: "D", mode: "major", provisional: false };

describe("chosenTonic", () => {
  it("shows no chip as chosen while the key is unguessed", () => {
    assert.equal(chosenTonic(PROVISIONAL_C), null);
  });

  it("shows the committed home in its mode's chip spelling", () => {
    assert.equal(chosenTonic(D_MAJOR), "D");
    assert.equal(chosenTonic({ tonic: "D#", mode: "minor", provisional: false }), "Eb");
  });
});

describe("afterHomeClick", () => {
  it("commits the clicked home in one click", () => {
    assert.deepEqual(
      afterHomeClick(PROVISIONAL_C, { tonic: "D", mode: "major" }, PROVISIONAL_C),
      D_MAJOR,
    );
  });

  it("commits the provisional C itself when C is clicked", () => {
    assert.deepEqual(afterHomeClick(PROVISIONAL_C, { tonic: "C", mode: "major" }, PROVISIONAL_C), {
      tonic: "C",
      mode: "major",
      provisional: false,
    });
  });

  it("takes the guess back when the chosen home is clicked again", () => {
    assert.equal(
      afterHomeClick(D_MAJOR, { tonic: "D", mode: "major" }, PROVISIONAL_C),
      PROVISIONAL_C,
    );
  });

  it("moves to another home without passing through unguessed", () => {
    assert.deepEqual(afterHomeClick(D_MAJOR, { tonic: "A", mode: "major" }, PROVISIONAL_C), {
      tonic: "A",
      mode: "major",
      provisional: false,
    });
  });

  it("treats the same home in the other mode as a different key", () => {
    assert.deepEqual(afterHomeClick(D_MAJOR, { tonic: "D", mode: "minor" }, PROVISIONAL_C), {
      tonic: "D",
      mode: "minor",
      provisional: false,
    });
  });
});

describe("afterModeChange", () => {
  it("re-commits the chosen home in the new mode, respelled for it", () => {
    assert.deepEqual(afterModeChange(D_MAJOR, "minor"), {
      tonic: "D",
      mode: "minor",
      provisional: false,
    });
    assert.deepEqual(afterModeChange({ tonic: "Db", mode: "major", provisional: false }, "minor"), {
      tonic: "C#",
      mode: "minor",
      provisional: false,
    });
  });

  it("changes nothing before a guess or when the mode is unchanged", () => {
    assert.equal(afterModeChange(PROVISIONAL_C, "minor"), null);
    assert.equal(afterModeChange(D_MAJOR, "major"), null);
  });
});
