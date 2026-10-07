import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { nextCallout, dismiss, placeCallout } from "../../src/callouts/tour.js";

const callouts = [
  { id: "a", anchor: "landing", text: "A" },
  { id: "b", anchor: "piano", text: "B", needsKeyLabels: true },
  { id: "c", anchor: "toolbar", text: "C" },
  { id: "d", anchor: "chords", text: "D" },
];
const onPage = new Set(["landing", "piano", "chords"]);
const context = (overrides = {}) => ({
  dismissed: new Set(),
  hasAnchor: (/** @type {string} */ id) => onPage.has(id),
  labelsHidden: false,
  ...overrides,
});

describe("nextCallout", () => {
  it("starts with the first callout in content order", () => {
    assert.equal(nextCallout(callouts, context())?.id, "a");
  });

  it("skips dismissed callouts", () => {
    assert.equal(nextCallout(callouts, context({ dismissed: new Set(["a"]) }))?.id, "b");
  });

  it("skips a callout whose anchor isn't on the page", () => {
    assert.equal(nextCallout(callouts, context({ dismissed: new Set(["a", "b"]) }))?.id, "d");
  });

  it("skips key-label callouts while a demo hides the labels", () => {
    const ctx = context({ dismissed: new Set(["a"]), labelsHidden: true });
    assert.equal(nextCallout(callouts, ctx)?.id, "d");
  });

  it("returns null when every callout is dismissed or unanchored", () => {
    assert.equal(nextCallout(callouts, context({ dismissed: new Set(["a", "b", "d"]) })), null);
  });
});

describe("dismiss", () => {
  it("adds an id without changing the original set", () => {
    const before = new Set(["a"]);
    const after = dismiss(before, "b");
    assert.deepEqual([...after], ["a", "b"]);
    assert.deepEqual([...before], ["a"]);
  });
});

describe("placeCallout", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 300, height: 100 };
  /** @param {number} top @param {number} bottom @param {number} [left] */
  const rect = (top, bottom, left = 100) => ({ top, bottom, left, right: left + 200 });

  it("sits below the anchor when there's room", () => {
    assert.deepEqual(placeCallout(rect(100, 200), size, viewport), { top: 212, left: 100 });
  });

  it("sits above the anchor when there's no room below", () => {
    assert.deepEqual(placeCallout(rect(600, 750), size, viewport), { top: 488, left: 100 });
  });

  it("sits at the bottom of the screen when neither side of a tall anchor has room", () => {
    assert.deepEqual(placeCallout(rect(-100, 900), size, viewport), { top: 692, left: 100 });
  });

  it("keeps a tip that fits on neither side off the anchor's controls", () => {
    // Measured at 1280x800: the key prompt spans 219..497, the dock starts at 599.
    const laptop = { width: 1280, height: 800, bottom: 599 };
    const place = placeCallout(rect(219, 497), { width: 300, height: 209 }, laptop);
    assert.ok(place.top + 209 <= 219, `tip bottom ${place.top + 209} overlaps the prompt`);
  });

  it("treats the keyboard dock as the bottom of the screen", () => {
    const docked = { ...viewport, bottom: 600 };
    // Room below the anchor in the viewport, but not above the dock: flips above.
    assert.equal(placeCallout(rect(400, 500), size, docked).top, 288);
    // No room on either side: waits just above the dock, never under it.
    assert.equal(placeCallout(rect(-200, 700), size, docked).top, 492);
    assert.equal(placeCallout(rect(900, 1000), size, docked).top, 492);
  });

  it("stays inside the viewport horizontally", () => {
    assert.equal(placeCallout(rect(100, 200, 900), size, viewport).left, 692);
    assert.equal(placeCallout(rect(100, 200, -50), size, viewport).left, 8);
  });

  it("waits at the nearest edge when the anchor is scrolled away", () => {
    assert.equal(placeCallout(rect(-400, -300), size, viewport).top, 8);
    assert.equal(placeCallout(rect(900, 1000), size, viewport).top, 692);
  });

  it("keeps its start on screen when it's bigger than the viewport", () => {
    const small = { width: 200, height: 80 };
    assert.deepEqual(placeCallout(rect(10, 20, 50), size, small), { top: 8, left: 8 });
  });
});

describe("content/callouts.json", () => {
  it("has unique ids and the fields every callout needs", async () => {
    const url = new URL("../../content/callouts.json", import.meta.url);
    const { callouts: content } = JSON.parse(await readFile(url, "utf8"));
    assert.ok(content.length >= 6);
    assert.equal(
      new Set(content.map((/** @type {{ id: string }} */ c) => c.id)).size,
      content.length,
    );
    for (const c of content) {
      assert.equal(typeof c.anchor, "string", c.id);
      assert.ok(c.text.length > 0, c.id);
    }
  });
});
