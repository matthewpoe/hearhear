import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keyLabelMode } from "../../src/store/ui.js";

const key = (provisional) => ({ key: { provisional } });

describe("keyLabelMode", () => {
  it("hides key labels in a demo until the user guesses", () => {
    assert.equal(keyLabelMode(key(true), { demoAwaitingGuess: true }), "hidden");
  });

  it("shows free play's provisional C as tentative", () => {
    assert.equal(keyLabelMode(key(true), { demoAwaitingGuess: false }), "tentative");
  });

  it("confirms once a key is committed, whatever the demo flag says", () => {
    assert.equal(keyLabelMode(key(false), { demoAwaitingGuess: true }), "confirmed");
    assert.equal(keyLabelMode(key(false), { demoAwaitingGuess: false }), "confirmed");
  });
});
