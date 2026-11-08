import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  nextCallout,
  isDue,
  actedOn,
  countAction,
  isActivatingKey,
  isOnScreen,
  dismiss,
  placeCallout,
  coverage,
  scrollForTip,
} from "../../src/callouts/tour.js";

/** @import { Callout, TourFacts } from "../../src/callouts/tour.js" */

const callouts = [
  { id: "a", anchor: "landing", text: "A" },
  { id: "b", anchor: "piano", text: "B", needsKeyLabels: true },
  { id: "c", anchor: "toolbar", text: "C" },
  { id: "d", anchor: "chords", text: "D" },
];
const onPage = new Set(["landing", "piano", "chords"]);

/** @type {TourFacts} */
const START = {
  songLoaded: false,
  keyChosen: false,
  playing: false,
  finderOpen: false,
  dropdownOpen: false,
  chordPlaced: false,
};

const context = (overrides = {}) => ({
  dismissed: new Set(),
  hasAnchor: (/** @type {Callout} */ c) => onPage.has(c.anchor),
  labelsHidden: false,
  facts: START,
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

  it("skips a callout whose moment hasn't come, even with its anchor on the page", () => {
    const gated = [{ ...callouts[0], when: { songLoaded: true } }, callouts[3]];
    assert.equal(nextCallout(gated, context())?.id, "d");
    const loaded = { ...START, songLoaded: true };
    assert.equal(nextCallout(gated, context({ facts: loaded }))?.id, "a");
  });
});

describe("isDue", () => {
  const tip = { id: "t", anchor: "x", text: "T" };
  it("is always due with no conditions", () => {
    assert.equal(isDue(tip, START), true);
  });
  it("needs every listed fact to match, true or false", () => {
    const when = { songLoaded: true, keyChosen: false };
    assert.equal(isDue({ ...tip, when }, { ...START, songLoaded: true }), true);
    assert.equal(isDue({ ...tip, when }, START), false);
    assert.equal(isDue({ ...tip, when }, { ...START, songLoaded: true, keyChosen: true }), false);
  });
});

describe("actedOn", () => {
  const tips = [
    { id: "welcome", anchor: "x", text: "W", doneWhen: /** @type {const} */ ("songLoaded") },
    { id: "key", anchor: "x", text: "K", doneWhen: /** @type {const} */ ("keyChosen") },
    { id: "plain", anchor: "x", text: "P" },
  ];
  it("lists the tips whose action has happened", () => {
    assert.deepEqual(actedOn(tips, START), []);
    assert.deepEqual(actedOn(tips, { ...START, songLoaded: true }), ["welcome"]);
    assert.deepEqual(actedOn(tips, { ...START, songLoaded: true, keyChosen: true }), [
      "welcome",
      "key",
    ]);
  });
});

describe("actedOn with a moment", () => {
  const audition = {
    id: "audition",
    anchor: "staff",
    text: "A",
    when: { keyChosen: true, dropdownOpen: false },
    doneWhen: /** @type {const} */ ("dropdownOpen"),
  };
  it("doesn't count opening the dropdown before a key is chosen", () => {
    const early = { ...START, songLoaded: true, dropdownOpen: true };
    assert.deepEqual(actedOn([audition], early), []);
    assert.deepEqual(actedOn([audition], { ...early, keyChosen: true }), ["audition"]);
  });
});

describe("countAction", () => {
  it("lets actions on the tip's subject pass freely", () => {
    assert.deepEqual(countAction(0, true), { elsewhere: 0, fold: false });
  });
  it("tolerates one action elsewhere and folds the tip on the second", () => {
    const first = countAction(0, false);
    assert.deepEqual(first, { elsewhere: 1, fold: false });
    assert.deepEqual(countAction(first.elsewhere, true), { elsewhere: 1, fold: false });
    assert.deepEqual(countAction(first.elsewhere, false), { elsewhere: 2, fold: true });
  });
});

describe("isActivatingKey", () => {
  it("counts keys that activate or change a control", () => {
    for (const key of [" ", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      assert.equal(isActivatingKey(key), true, key);
    }
  });
  it("doesn't count keys that only move focus or modify", () => {
    for (const key of ["Tab", "Shift", "Escape", "Home", "a"]) {
      assert.equal(isActivatingKey(key), false, key);
    }
  });
  it("so a Tab walk folds nothing, while two presses elsewhere fold the tip", () => {
    let count = { elsewhere: 0, fold: false };
    for (const key of ["Tab", "Tab", "Tab", "Tab"]) {
      if (isActivatingKey(key)) count = countAction(count.elsewhere, false);
    }
    assert.deepEqual(count, { elsewhere: 0, fold: false });
    for (const key of ["Enter", " "]) {
      if (isActivatingKey(key)) count = countAction(count.elsewhere, false);
    }
    assert.deepEqual(count, { elsewhere: 2, fold: true });
  });
});

describe("dismiss", () => {
  it("adds ids without changing the original set", () => {
    const before = new Set(["a"]);
    const after = dismiss(before, "b", "c");
    assert.deepEqual([...after], ["a", "b", "c"]);
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

  it("slides sideways past a button rather than cover it", () => {
    const wide = { top: 50, bottom: 300, left: 20, right: 980 };
    const music = { top: 60, bottom: 290, left: 100, right: 900 };
    const button = { top: 310, bottom: 340, left: 20, right: 480 };
    const tutorHeading = { top: 310, bottom: 340, left: 800, right: 980 };
    const avoid = [music, button, tutorHeading];
    const place = placeCallout(wide, size, viewport, { avoid });
    assert.deepEqual(place, { top: 312, left: 488 });
  });

  // Measured at 1440x900 with a key chosen: the toolbar's toggle sits at the
  // top right, the music fills the width under it, and the tutor's heading is
  // below the music on the right.
  const laptop = { width: 1440, height: 900, bottom: 755 };
  const toolbar = { top: 60, bottom: 92, left: 1042, right: 1221 };
  const music = { top: 93, bottom: 368, left: 272, right: 1168 };
  const masthead = { top: 8, bottom: 42, left: 1136, right: 1416 };
  const tutorHeading = { top: 418, bottom: 448, left: 875, right: 1311 };
  const tutorAsk = { top: 528, bottom: 668, left: 875, right: 1311 };

  it("slides twice when a spot is hemmed in on two sides", () => {
    const tip = { width: 352, height: 167 };
    const avoid = [masthead, music, tutorHeading, tutorAsk];
    const place = placeCallout(toolbar, tip, laptop, { avoid });
    assert.equal(coverage(place, tip, avoid), 0);
    assert.ok(place.top >= music.bottom, "under the music");
  });

  it("keeps a key-question tip off the tutor's heading and question box", () => {
    const keyPrompt = { top: 360, bottom: 640, left: 105, right: 835 };
    const tip = { width: 352, height: 188 };
    // Before the key is chosen the music has no degree numbers, so it's shorter.
    const avoid = [
      { ...music, bottom: 335 },
      { top: 467, bottom: 500, left: 349, right: 485 }, // Help me find it
      { top: 510, bottom: 544, left: 204, right: 457 }, // Bright / Dark
      { top: 550, bottom: 585, left: 219, right: 771 }, // home notes
      { ...tutorHeading, top: 385, bottom: 415 },
      { ...tutorAsk, top: 500, bottom: 635 },
    ];
    const place = placeCallout(keyPrompt, tip, laptop, { avoid });
    assert.equal(coverage(place, tip, avoid), 0);
  });
});

describe("isOnScreen", () => {
  const viewport = { width: 1000, height: 800, bottom: 650 };
  /** @param {number} top @param {number} bottom */
  const band = (top, bottom) => ({ top, bottom, left: 0, right: 500 });
  it("is true when any of the element shows above the dock", () => {
    assert.equal(isOnScreen(band(600, 900), viewport), true);
    assert.equal(isOnScreen(band(-100, 10), viewport), true);
  });
  it("is false when the element is under the dock, scrolled away, or empty", () => {
    assert.equal(isOnScreen(band(660, 700), viewport), false);
    assert.equal(isOnScreen(band(-200, -10), viewport), false);
    assert.equal(isOnScreen(band(100, 100), viewport), false);
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

const contentUrl = new URL("../../content/callouts.json", import.meta.url);
/** @type {Callout[]} */
const content = JSON.parse(await readFile(contentUrl, "utf8")).callouts;

describe("content/callouts.json", () => {
  it("has unique ids and the fields every callout needs", () => {
    assert.ok(content.length >= 6);
    assert.equal(new Set(content.map((c) => c.id)).size, content.length);
    for (const c of content) {
      assert.equal(typeof c.anchor, "string", c.id);
      assert.ok(c.text.length > 0, c.id);
    }
  });

  it("gates only on facts the tour knows, and waits only for a real action", () => {
    const known = Object.keys(START);
    for (const c of content) {
      for (const fact of Object.keys(c.when ?? {})) assert.ok(known.includes(fact), c.id);
      if (c.doneWhen) assert.ok(known.includes(c.doneWhen), c.id);
      if (c.noNext) assert.ok(c.doneWhen, `${c.id} has no Next, so it needs a doneWhen`);
    }
  });

  it("ends the welcome with the first thing to do", () => {
    const welcome = content.find((c) => c.id === "welcome");
    assert.match(welcome?.text ?? "", /Pick a tune to begin\.$/);
    assert.equal(welcome?.noNext, true);
  });
});

/** Anchors that exist only once a tune is loaded. */
const AFTER_LOADING = new Set(["key-prompt", "toolbar", "piano"]);

/**
 * Whether a callout's target is on the page in a given state of the app.
 * @param {TourFacts} facts
 * @param {Callout} callout
 */
function onPageIn(facts, callout) {
  if (callout.anchor === "song-chooser") return !facts.songLoaded;
  return AFTER_LOADING.has(callout.anchor) ? facts.songLoaded : true;
}

/**
 * Walk the real tour the way the component does: the user's actions count
 * their tips as seen, then the first due tip shows.
 * @param {TourFacts} facts
 * @param {Set<string>} seen
 */
function step(facts, seen) {
  for (const id of actedOn(content, facts)) seen.add(id);
  return nextCallout(content, {
    dismissed: seen,
    facts,
    labelsHidden: facts.songLoaded && !facts.keyChosen,
    hasAnchor: (c) => onPageIn(facts, c),
  })?.id;
}

describe("the beginner tour, walked as a first-timer", () => {
  it("shows each tip with its subject and lets actions move it on", () => {
    const seen = new Set();
    let facts = START;
    assert.equal(step(facts, seen), "welcome");
    facts = { ...facts, songLoaded: true };
    assert.equal(step(facts, seen), "staff", "loading a tune moves past the welcome");
    facts = { ...facts, playing: true };
    assert.equal(step(facts, seen), "key-prompt", "pressing Play finishes the staff tip");
    facts = { ...facts, playing: false };
    seen.add("key-prompt"); // Next
    assert.equal(step(facts, seen), "key-finder");
    facts = { ...facts, keyChosen: true };
    assert.equal(step(facts, seen), "number-keys", "choosing a key opens the labelled tips");
    seen.add("number-keys");
    assert.equal(step(facts, seen), "audition");
    facts = { ...facts, dropdownOpen: true };
    assert.equal(step(facts, seen), undefined, "opening the dropdown does what it asks");
    assert.ok(seen.has("audition"));
    facts = { ...facts, dropdownOpen: false, chordPlaced: true };
    assert.equal(step(facts, seen), "function-shapes", "the shapes tip waits for a chord");
    seen.add("function-shapes");
    assert.equal(step(facts, seen), "toolbar", "transpose shows only once a key is chosen");
    seen.add("toolbar");
    assert.equal(step(facts, seen), "tutor");
    seen.add("tutor");
    assert.equal(step(facts, seen), undefined);
  });

  it("never offers transpose, number keys, or the tutor before a key is chosen", () => {
    const seen = new Set(["welcome", "staff", "key-prompt", "key-finder"]);
    assert.equal(step({ ...START, songLoaded: true }, seen), undefined);
  });

  it("counts opening the ear finder as acting on its tip", () => {
    const seen = new Set(["welcome", "staff"]);
    const facts = { ...START, songLoaded: true, finderOpen: true };
    assert.equal(step(facts, seen), "key-prompt");
    assert.ok(seen.has("key-finder"));
  });

  it("skips the staff and key tips for someone who chooses a key straight away", () => {
    const seen = new Set();
    assert.equal(step({ ...START, songLoaded: true, keyChosen: true }, seen), "number-keys");
    assert.ok(seen.has("key-prompt"), "choosing the key counts its tip as seen");
  });

  it("shows nothing over the open dropdown, then returns to the tour", () => {
    const seen = new Set(["welcome", "staff", "key-prompt", "key-finder"]);
    const open = { ...START, songLoaded: true, keyChosen: true, dropdownOpen: true };
    assert.equal(step(open, seen), undefined, "nothing covers the dropdown's work");
    assert.equal(step({ ...open, dropdownOpen: false }, seen), "number-keys");
  });

  it("explains the shapes beside the chords someone placed without the tour", () => {
    const seen = new Set(["welcome", "staff", "key-prompt", "key-finder", "number-keys"]);
    const facts = { ...START, songLoaded: true, keyChosen: true, chordPlaced: true };
    assert.equal(step(facts, seen), "audition");
    seen.add("audition");
    assert.equal(step(facts, seen), "function-shapes");
  });

  it("puts the tutor last", () => {
    assert.equal(content.at(-1)?.id, "tutor");
  });
});
