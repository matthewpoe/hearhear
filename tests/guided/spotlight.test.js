import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SPOTLIGHT_NOTE, spotlightNote } from "../../src/guided/spotlight.js";
import { registerNoteElements } from "../../src/staff/staffEvents.js";

/** A stand-in for a drawn note's SVG element: just its class list. */
function fakeElement() {
  const classes = new Set();
  return {
    classList: {
      add: (/** @type {string} */ c) => void classes.add(c),
      remove: (/** @type {string} */ c) => void classes.delete(c),
    },
    lit: () => classes.has(SPOTLIGHT_NOTE),
  };
}

/** @param {string[]} ids */
function draw(ids) {
  const els = new Map(ids.map((id) => [id, fakeElement()]));
  registerNoteElements(
    /** @type {Map<string, Element[]>} */ (
      /** @type {unknown} */ (new Map([...els].map(([id, el]) => [id, [el]])))
    ),
  );
  return els;
}

describe("spotlightNote", () => {
  it("rings a note drawn after it was asked for, and again after every redraw", () => {
    draw([]);
    const undo = spotlightNote("nf");
    // abcjs arrives after the lesson's frame: the first draw still rings it.
    let els = draw(["n1", "nf"]);
    assert.equal(els.get("nf")?.lit(), true);
    assert.equal(els.get("n1")?.lit(), false);
    // A font load redraws with no song change.
    els = draw(["n1", "nf"]);
    assert.equal(els.get("nf")?.lit(), true);
    undo();
    assert.equal(els.get("nf")?.lit(), false);
    els = draw(["n1", "nf"]);
    assert.equal(els.get("nf")?.lit(), false, "undone, a redraw doesn't bring it back");
  });
});
