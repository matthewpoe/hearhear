import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import {
  COPY,
  feedbackText,
  finderText,
  guessFeedback,
  knownHome,
} from "../../src/finding/guessFeedback.js";
import { transposeSong } from "../../src/theory/index.js";

/** @typedef {import("../../src/types.js").Song} Song */

const D_MAJOR = { tonic: "D", mode: "major" };
const C_MAJOR = { tonic: "C", mode: "major" };

describe("knownHome", () => {
  it("is the demo's key from its content file", () => {
    assert.deepEqual(knownHome(ode, ode), D_MAJOR);
    assert.deepEqual(knownHome(stJames, stJames), { tonic: "E", mode: "minor" });
  });

  it("follows the tune through a transpose", () => {
    const up = transposeSong(/** @type {Song} */ (ode), 2);
    assert.deepEqual(knownHome(up, ode), { tonic: "E", mode: "major" });
    const down = transposeSong(/** @type {Song} */ (ode), -2);
    assert.deepEqual(knownHome(down, ode), C_MAJOR);
  });

  it("is null for another tune, or one with none of the demo's notes left", () => {
    assert.equal(knownHome(stJames, ode), null);
    assert.equal(knownHome({ id: ode.id, notes: [] }, ode), null);
  });
});

describe("guessFeedback", () => {
  it("stays neutral when the tune's home isn't known", () => {
    assert.equal(guessFeedback(C_MAJOR, null, false), "neutral");
  });

  it("confirms a guess most ears share", () => {
    assert.equal(guessFeedback(D_MAJOR, D_MAJOR, false), "match");
    assert.equal(
      guessFeedback({ tonic: "Db", mode: "minor" }, { tonic: "C#", mode: "minor" }, false),
      "match",
    );
  });

  it("invites a check on a different home", () => {
    assert.equal(guessFeedback(C_MAJOR, D_MAJOR, false), "mismatch");
    assert.equal(guessFeedback({ tonic: "B", mode: "minor" }, D_MAJOR, false), "mismatch");
  });

  it("tells the right home note in the other mode apart", () => {
    assert.equal(guessFeedback({ tonic: "D", mode: "minor" }, D_MAJOR, false), "otherMode");
  });

  it("doesn't ask again once the user keeps a mismatched choice", () => {
    assert.equal(guessFeedback(C_MAJOR, D_MAJOR, true), "neutral");
    assert.equal(guessFeedback({ tonic: "D", mode: "minor" }, D_MAJOR, true), "neutral");
  });

  it("still confirms a match after a kept choice", () => {
    assert.equal(guessFeedback(D_MAJOR, D_MAJOR, true), "match");
  });
});

describe("feedbackText", () => {
  it("says the user chose, never that home is", () => {
    assert.equal(feedbackText(C_MAJOR, "neutral"), "You chose C major as home.");
    assert.ok(!/Home is/.test(feedbackText(C_MAJOR, "mismatch")));
  });

  it("adds the match or the invitation", () => {
    assert.equal(feedbackText(D_MAJOR, "match"), `You chose D major as home. ${COPY.match}`);
    assert.equal(feedbackText(C_MAJOR, "mismatch"), `You chose C major as home. ${COPY.mismatch}`);
  });

  it("never names the tune's home or calls a guess wrong", () => {
    for (const line of [COPY.mismatch, COPY.otherMode]) {
      assert.ok(!/\b[A-G][b#]? (major|minor)\b/.test(line), line);
      assert.ok(!/wrong|incorrect/i.test(line), line);
    }
  });
});

describe("finderText", () => {
  it("compares the finder's pick with the earlier choice", () => {
    assert.equal(finderText("same"), "Same as your choice.");
    assert.equal(
      finderText("different"),
      "Different from your earlier choice; your pick is now home.",
    );
    assert.equal(finderText("first"), "Your pick is now home.");
  });
});
