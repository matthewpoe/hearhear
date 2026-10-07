import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  afterFinderPick,
  afterHomeClick,
  afterModeChange,
  chosenTonic,
  finderComparison,
} from "../../src/finding/keyChoice.js";
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
    assert.deepEqual(afterHomeClick(PROVISIONAL_C, { tonic: "D", mode: "major" }), D_MAJOR);
  });

  it("commits the provisional C itself when C is clicked", () => {
    assert.deepEqual(afterHomeClick(PROVISIONAL_C, { tonic: "C", mode: "major" }), {
      tonic: "C",
      mode: "major",
      provisional: false,
    });
  });

  it("takes the guess back when the chosen home is clicked again, keeping the key", () => {
    assert.deepEqual(afterHomeClick(D_MAJOR, { tonic: "D", mode: "major" }), {
      tonic: "D",
      mode: "major",
      provisional: true,
    });
  });

  it("after a transpose, takes the guess back in the tune's new key, not the demo's C", () => {
    /** @type {Key} */
    const transposed = { tonic: "E", mode: "minor", provisional: false };
    assert.deepEqual(afterHomeClick(transposed, { tonic: "E", mode: "minor" }), {
      tonic: "E",
      mode: "minor",
      provisional: true,
    });
  });

  it("moves to another home without passing through unguessed", () => {
    assert.deepEqual(afterHomeClick(D_MAJOR, { tonic: "A", mode: "major" }), {
      tonic: "A",
      mode: "major",
      provisional: false,
    });
  });

  it("treats the same home in the other mode as a different key", () => {
    assert.deepEqual(afterHomeClick(D_MAJOR, { tonic: "D", mode: "minor" }), {
      tonic: "D",
      mode: "minor",
      provisional: false,
    });
  });
});

describe("afterFinderPick", () => {
  it("commits a chord's home when nothing or another home is chosen", () => {
    assert.deepEqual(afterFinderPick(PROVISIONAL_C, { tonic: "D", mode: "major" }), D_MAJOR);
    assert.deepEqual(afterFinderPick(D_MAJOR, { tonic: "A", mode: "major" }), {
      tonic: "A",
      mode: "major",
      provisional: false,
    });
  });

  it("confirms, never takes back, the home already chosen", () => {
    assert.equal(afterFinderPick(D_MAJOR, { tonic: "D", mode: "major" }), null);
  });
});

describe("finderComparison", () => {
  it("is the first choice when nothing was chosen yet", () => {
    assert.equal(finderComparison(PROVISIONAL_C, { tonic: "D", mode: "major" }), "first");
  });

  it("matches the earlier choice, enharmonics included", () => {
    assert.equal(finderComparison(D_MAJOR, { tonic: "D", mode: "major" }), "same");
    assert.equal(
      finderComparison(
        { tonic: "C#", mode: "minor", provisional: false },
        {
          tonic: "Db",
          mode: "minor",
        },
      ),
      "same",
    );
  });

  it("differs from another home, or the same home in the other mode", () => {
    assert.equal(finderComparison(D_MAJOR, { tonic: "A", mode: "major" }), "different");
    assert.equal(finderComparison(D_MAJOR, { tonic: "D", mode: "minor" }), "different");
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
