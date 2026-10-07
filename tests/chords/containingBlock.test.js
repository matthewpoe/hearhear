import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containingBlockReason } from "../../src/chords/containingBlock.js";

/** Computed values of an element that creates no containing block. */
const PLAIN = {
  position: "static",
  transform: "none",
  translate: "none",
  rotate: "none",
  scale: "none",
  perspective: "none",
  filter: "none",
  "backdrop-filter": "none",
  contain: "none",
  "will-change": "auto",
  "container-type": "normal",
  "content-visibility": "visible",
};

describe("containingBlockReason", () => {
  it("is null for a plain element, and for missing or empty values", () => {
    assert.equal(containingBlockReason(PLAIN), null);
    assert.equal(containingBlockReason({}), null);
    assert.equal(containingBlockReason({ position: "", transform: "" }), null);
  });

  for (const [prop, value] of [
    ["position", "relative"],
    ["position", "sticky"],
    ["transform", "matrix(1, 0, 0, 1, 0, 0)"],
    ["translate", "0px 4px"],
    ["perspective", "100px"],
    ["filter", "blur(2px)"],
    ["backdrop-filter", "blur(2px)"],
    ["contain", "paint"],
    ["contain", "layout style"],
    ["contain", "strict"],
    ["contain", "content"],
    ["will-change", "opacity, transform"],
    ["will-change", "filter"],
    ["container-type", "inline-size"],
    ["content-visibility", "auto"],
  ]) {
    it(`names ${prop}: ${value}`, () => {
      assert.equal(containingBlockReason({ ...PLAIN, [prop]: value }), `${prop}: ${value}`);
    });
  }

  it("ignores values that make no containing block", () => {
    for (const [prop, value] of [
      ["contain", "style"],
      ["contain", "size"],
      ["will-change", "opacity"],
      ["container-type", "normal"],
    ]) {
      assert.equal(containingBlockReason({ ...PLAIN, [prop]: value }), null, `${prop}: ${value}`);
    }
  });
});
