import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeOn, sideFor } from "../../src/chords/placement.js";

/** A 1000px viewport scrolled to 248, a 200px dock, 16px gutters. */
const base = {
  viewTop: 248 + 16,
  viewBottom: 248 + 1000 - 200 - 16,
  gap: 8,
  cap: 700,
};

/** @param {Partial<import("../../src/chords/placement.js").PlacementInput>} over */
const at = (over) => ({ ...base, anchorTop: 500, anchorBottom: 540, height: 300, ...over });

/** @param {ReturnType<typeof at>} input */
function place(input) {
  return placeOn(input, sideFor(input));
}

describe("dropdown placement", () => {
  it("sits below the anchor when it fits, capped to the room there", () => {
    const input = at({ height: 200 });
    assert.equal(sideFor(input), "below");
    assert.deepEqual(place(input), { top: 548, maxHeight: base.viewBottom - 548 });
  });

  it("flips above the anchor when only that side fits", () => {
    const input = at({ anchorTop: 900, anchorBottom: 940, height: 400 });
    assert.equal(sideFor(input), "above");
    const { top, maxHeight } = place(input);
    assert.equal(top + 400, 900 - 8);
    // Room to grow down to the dock; the dropdown refits upward as it grows.
    assert.equal(maxHeight, base.viewBottom - top);
  });

  it("takes the roomier side and scrolls inside when neither fits", () => {
    const input = at({ anchorTop: 700, anchorBottom: 740, height: 565 });
    assert.equal(sideFor(input), "above");
    assert.deepEqual(place(input), { top: base.viewTop, maxHeight: 700 - 8 - base.viewTop });
  });

  it("keeps the measured clipping case inside the view (565px tall, held note mid-screen)", () => {
    // The reviewer's case: scrolled 248px, the dropdown flipped above and
    // started at -227 in the viewport.
    const input = at({ anchorTop: 248 + 346, anchorBottom: 248 + 432, height: 565 });
    const { top, maxHeight } = place(input);
    assert.ok(top >= base.viewTop);
    assert.ok(top + Math.min(565, maxHeight) <= base.viewBottom);
  });

  it("keeps the side when the content grows, scrolling inside instead of flipping", () => {
    const opened = at({ height: 200 });
    const side = sideFor(opened);
    const grown = placeOn({ ...opened, height: 900 }, side);
    assert.equal(grown.top, 548);
    assert.equal(grown.maxHeight, base.viewBottom - 548);
  });

  it("moves an above-placed dropdown up as it grows, never past the top", () => {
    const opened = at({ anchorTop: 900, anchorBottom: 940, height: 300 });
    const side = sideFor(opened);
    assert.equal(side, "above");
    assert.equal(placeOn({ ...opened, height: 400 }, side).top, 900 - 8 - 400);
    assert.equal(placeOn({ ...opened, height: 2000 }, side).top, base.viewTop);
  });

  it("honours the height cap", () => {
    const input = at({ anchorTop: 270, anchorBottom: 280, height: 2000, cap: 300 });
    assert.deepEqual(place(input), { top: 288, maxHeight: 300 });
  });

  it("never leaves the visible area, wherever the anchor is", () => {
    for (let anchorTop = -400; anchorTop <= 1600; anchorTop += 37) {
      for (const height of [0, 50, 200, 500, 900, 3000]) {
        for (const anchorHeight of [10, 90, 800]) {
          const input = at({ anchorTop, anchorBottom: anchorTop + anchorHeight, height });
          const { top, maxHeight } = place(input);
          const shown = Math.min(height, maxHeight);
          const label = JSON.stringify({ anchorTop, anchorHeight, height, top, maxHeight });
          assert.ok(top >= base.viewTop, label);
          assert.ok(top + shown <= base.viewBottom + 1e-9, label);
          assert.ok(maxHeight >= 0 && maxHeight <= base.viewBottom - base.viewTop, label);
        }
      }
    }
  });
});
