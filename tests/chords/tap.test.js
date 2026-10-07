import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_TAP, activate, pointerTypeOf } from "../../src/chords/tap.js";

describe("activate", () => {
  it("previews on the first tap", () => {
    assert.deepEqual(activate(NO_TAP, "C", "touch"), { state: { previewed: "C" }, choose: false });
  });

  it("chooses on a second tap on the same option", () => {
    const first = activate(NO_TAP, "C", "touch");
    assert.deepEqual(activate(first.state, "C", "touch"), { state: NO_TAP, choose: true });
  });

  it("re-previews when a different option is tapped", () => {
    const first = activate(NO_TAP, "C", "touch");
    const second = activate(first.state, "G", "touch");
    assert.deepEqual(second, { state: { previewed: "G" }, choose: false });
    // And the earlier option needs its own second tap again.
    assert.equal(activate(second.state, "C", "touch").choose, false);
  });

  it("chooses at once on a mouse click, with or without a pending tap", () => {
    assert.deepEqual(activate(NO_TAP, "C", "mouse"), { state: NO_TAP, choose: true });
    const tapped = activate(NO_TAP, "C", "touch").state;
    assert.deepEqual(activate(tapped, "G", "mouse"), { state: NO_TAP, choose: true });
  });

  it("chooses at once from the keyboard and from a pen", () => {
    assert.deepEqual(activate(NO_TAP, "C", ""), { state: NO_TAP, choose: true });
    assert.deepEqual(activate(NO_TAP, "C", "pen"), { state: NO_TAP, choose: true });
  });
});

describe("pointerTypeOf", () => {
  it("reads Enter and Space (detail 0) as keyboard, even after a tap", () => {
    assert.equal(pointerTypeOf({ detail: 0, pointerType: "" }, "touch"), "");
    assert.equal(pointerTypeOf({ detail: 0 }, "touch"), "");
  });

  it("prefers the click's own pointerType", () => {
    assert.equal(pointerTypeOf({ detail: 1, pointerType: "mouse" }, "touch"), "mouse");
    assert.equal(pointerTypeOf({ detail: 1, pointerType: "touch" }, ""), "touch");
  });

  it("falls back to the last pointerdown where click carries no pointerType", () => {
    assert.equal(pointerTypeOf({ detail: 1 }, "touch"), "touch");
    assert.equal(pointerTypeOf({ detail: 1, pointerType: "" }, "mouse"), "mouse");
    assert.equal(pointerTypeOf({ detail: 1 }, ""), "");
  });
});
