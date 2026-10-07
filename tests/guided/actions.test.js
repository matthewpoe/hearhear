import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionParts, pageFacts, plainText } from "../../src/guided/actions.js";

describe("actionParts", () => {
  it("splits the marked action from the text around it", () => {
    assert.deepEqual(actionParts("[[Press Play]] and watch."), [
      { text: "Press Play", act: true },
      { text: " and watch.", act: false },
    ]);
    assert.deepEqual(actionParts("Not sure? [[Press it]]"), [
      { text: "Not sure? ", act: false },
      { text: "Press it", act: true },
    ]);
    assert.deepEqual(actionParts("No marker."), [{ text: "No marker.", act: false }]);
  });

  it("gives plain text", () => {
    assert.equal(plainText("[[Press Play]] and watch."), "Press Play and watch.");
  });
});

describe("pageFacts", () => {
  it("makes each named selector a fact, true while it matches", () => {
    const present = (/** @type {string} */ selector) => selector === "#key-finder";
    assert.deepEqual(pageFacts({ finderOpen: "#key-finder", recording: "#rec[open]" }, present), {
      finderOpen: true,
      recording: false,
    });
  });
});
