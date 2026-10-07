import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  nextCallout,
  dismiss,
  placeCallout,
  coverage,
  scrollForTip,
} from "../../src/callouts/tour.js";

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

  it("goes below a wide anchor at its right edge when its left side is busy", () => {
    const wide = { top: 50, bottom: 300, left: 20, right: 980 };
    const music = { top: 60, bottom: 290, left: 100, right: 900 };
    const busyLeft = [music, { top: 310, bottom: 420, left: 20, right: 500 }];
    assert.deepEqual(placeCallout(wide, size, viewport, { avoid: busyLeft }), {
      top: 312,
      left: 680,
    });
  });

  it("puts a dock anchor's tip just above the dock, on the right when that's clear", () => {
    const docked = { ...viewport, bottom: 600 };
    const key = rect(610, 700, 20);
    assert.deepEqual(placeCallout(key, size, docked, { inDock: true }), { top: 492, left: 692 });
    // Something to keep clear on the right: above the dock at the anchor's left.
    const onRight = [{ top: 480, bottom: 590, left: 650, right: 990 }];
    assert.deepEqual(placeCallout(key, size, docked, { inDock: true, avoid: onRight }), {
      top: 492,
      left: 20,
    });
  });

  it("stays inside the viewport horizontally", () => {
    assert.equal(placeCallout(rect(100, 200, 900), size, viewport).left, 692);
    assert.equal(placeCallout(rect(100, 200, -50), size, viewport).left, 8);
  });

  it("waits at the nearest edge when the anchor is scrolled away", () => {
    assert.equal(placeCallout(rect(-400, -300), size, viewport).top, 8);
    assert.equal(placeCallout(rect(900, 1000), size, viewport).top, 692);
  });

  it("moves beside the anchor rather than cover a control", () => {
    // Below the anchor would cover the Play button; the right side is free.
    const play = rect(220, 260, 100);
    const place = placeCallout(rect(100, 200), size, viewport, { avoid: [play] });
    assert.deepEqual(place, { top: 100, left: 312 });
  });

  it("tries the left side when the right is off screen", () => {
    const control = rect(220, 260, 600);
    const place = placeCallout(rect(100, 200, 600), size, viewport, { avoid: [control] });
    assert.deepEqual(place, { top: 100, left: 288 });
  });

  it("keeps the first choice when it covers nothing", () => {
    const far = rect(700, 750, 800);
    assert.deepEqual(placeCallout(rect(100, 200), size, viewport, { avoid: [far] }), {
      top: 212,
      left: 100,
    });
  });

  it("covers as little as it can when no spot is clear", () => {
    // A phone: the key question fills the screen, and its controls are
    // everywhere a tip could go. The tip lands where it hides the least.
    const phone = { width: 390, height: 844, bottom: 644 };
    const tip = { width: 320, height: 170 };
    const controls = [
      { top: 0, bottom: 200, left: 0, right: 390 },
      { top: 300, bottom: 320, left: 0, right: 390 },
      { top: 500, bottom: 640, left: 0, right: 390 },
    ];
    const place = placeCallout(rect(-50, 900, 16), tip, phone, { avoid: controls });
    const covered = coverage(place, tip, controls);
    assert.ok(covered <= 20 * 320, `covers ${covered} px²`);
  });

  it("keeps its start on screen when it's bigger than the viewport", () => {
    const small = { width: 200, height: 80 };
    assert.deepEqual(placeCallout(rect(10, 20, 50), size, small), { top: 8, left: 8 });
  });
});

describe("coverage", () => {
  const size = { width: 10, height: 10 };
  it("is the area of the controls a tip covers, 0 when it only touches or misses", () => {
    const at = { top: 0, left: 0 };
    assert.equal(coverage(at, size, [{ top: 5, bottom: 15, left: 5, right: 15 }]), 25);
    assert.equal(coverage(at, size, [{ top: 10, bottom: 20, left: 0, right: 10 }]), 0);
    assert.equal(
      coverage(at, size, [
        { top: 5, bottom: 15, left: 5, right: 15 },
        { top: 0, bottom: 1, left: 0, right: 10 },
      ]),
      35,
    );
  });
});

describe("scrollForTip", () => {
  const viewport = { width: 390, height: 844, bottom: 644 };
  const size = { width: 320, height: 200 };
  const room = { up: -2000, down: 2000 };
  /** @param {number} top @param {number} bottom */
  const band = (top, bottom) => ({ top, bottom, left: 16, right: 374 });

  it("doesn't scroll when the anchor is in view and the tip has room", () => {
    assert.equal(scrollForTip(band(100, 200), size, viewport, { room }), 0);
  });

  it("scrolls the least that brings the anchor into view, like block: nearest", () => {
    assert.equal(scrollForTip(band(700, 800), size, viewport, { room }), 800 - 636);
    assert.equal(scrollForTip(band(-300, -200), size, viewport, { room }), -308);
  });

  it("scrolls the anchor to the top when nearest would leave the tip on a control", () => {
    // Measured at 390x844: the chords sit just under the key question, whose
    // controls fill the screen above them.
    const chords = band(700, 836);
    const controls = [band(-150, 470), band(560, 690)];
    assert.equal(scrollForTip(chords, size, viewport, { avoid: controls, room }), 692);
  });

  it("never asks for more scroll than the page has", () => {
    const chords = band(700, 836);
    const controls = [band(-150, 470), band(560, 690)];
    const short = { up: 0, down: 250 };
    assert.equal(scrollForTip(chords, size, viewport, { avoid: controls, room: short }), 200);
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
