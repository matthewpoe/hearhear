import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "../../content/guided-path.json" with { type: "json" };
import plan from "../../content/lessons/plan.json" with { type: "json" };
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { createSongStore } from "../../src/store/song.js";
import { chordFromNumeral } from "../../src/theory/index.js";
import {
  checkPath,
  clampStep,
  conditionMet,
  hintFor,
  lessonExchange,
  loadProgress,
  noteAt,
  numeralAt,
  placePanel,
  saveProgress,
  shouldAdvance,
} from "../../src/guided/steps.js";

/** @import { Song } from "../../src/types.js" */
/** @import { Step } from "../../src/guided/steps.js" */

const tune = /** @type {Song} */ (ode);
const steps = /** @type {Step[]} */ (path.steps);

/** Ode as a demo opens it: on the provisional C, no chords. */
function demo() {
  const store = createSongStore();
  store.load({ ...tune, key: { tonic: "C", mode: "major", provisional: true }, chords: [] });
  return store;
}

/**
 * @param {ReturnType<typeof createSongStore>} store
 * @param {number} bar
 * @param {number} beat
 * @param {string} numeral
 */
function place(store, bar, beat, numeral) {
  const note = noteAt(store.get(), bar, beat);
  const chord = chordFromNumeral(numeral, store.get().key);
  assert.ok(note && chord);
  store.setChord(note.id, chord);
}

/** @param {Song} song */
const state = (song, tutorReplies = 0) => ({ song, tutorReplies });

describe("the guided path's content", () => {
  it("is marked as a placeholder until Matthew's ear check", () => {
    assert.match(path.status, /^placeholder: pending Matthew's ear check/);
  });

  it("names only bars and beats where Ode to Joy has a note", () => {
    assert.equal(path.song, tune.id);
    assert.deepEqual(checkPath(path, tune), []);
  });

  it("hits the notes the story is about (12 ticks per quarter, 4/4)", () => {
    // The long E ending phrase 1, the 2 of the final "3 2 1", and the last D.
    assert.deepEqual(
      [noteAt(tune, 4, 3), noteAt(tune, 8, 1), noteAt(tune, 8, 3)].map(
        (n) => n && [n.midi, n.start],
      ),
      [
        [64, 168],
        [64, 336],
        [62, 360],
      ],
    );
  });

  it("has unique step ids, a title and text on each, and a label on each action", () => {
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
    for (const step of steps) {
      assert.ok(step.title && step.text, step.id);
      if (step.action) assert.ok(step.action.label, step.id);
    }
  });

  it("asks the tutor with a question from the lesson plan", () => {
    const asks = steps.flatMap((s) => (s.action?.type === "askTutor" ? [s.action.lesson] : []));
    assert.notEqual(asks.length, 0);
    for (const lesson of asks) assert.ok(lessonExchange(plan, lesson), lesson);
  });

  it("is completed, step by step, by playing the story through the song store", () => {
    const store = demo();
    /** @type {Record<string, () => void>} */
    const doIt = {
      load: () => {},
      home: () => store.rekey({ tonic: "D", mode: "major", provisional: false }),
      "half-cadence": () => place(store, 4, 3, "V"),
      "set-up-ending": () => place(store, 8, 1, "V"),
      "wrong-ish": () => place(store, 8, 3, "vi"),
      land: () => place(store, 8, 3, "I"),
    };
    let replies = 0;
    for (const step of steps) {
      assert.equal(conditionMet(step.done, state(store.get(), replies)), step.id === "load");
      if (step.id === "ask") replies = 1;
      else doIt[step.id]();
      assert.ok(conditionMet(step.done, state(store.get(), replies)), step.id);
    }
  });
});

describe("conditionMet", () => {
  it("wants the named song with notes", () => {
    const met = { type: /** @type {const} */ ("songLoaded"), song: "ode-to-joy" };
    assert.ok(conditionMet(met, state(tune)));
    assert.ok(!conditionMet(met, state({ ...tune, id: "st-james-infirmary" })));
    assert.ok(!conditionMet(met, state({ ...tune, notes: [] })));
  });

  it("counts a committed key only, and the right one for keyChosen", () => {
    const store = demo();
    const d = /** @type {const} */ ({ type: "keyChosen", tonic: "D", mode: "major" });
    const any = /** @type {const} */ ({ type: "keyCommitted" });
    assert.ok(!conditionMet(d, state(store.get())));
    assert.ok(!conditionMet(any, state(store.get())));
    store.rekey({ tonic: "G", mode: "major", provisional: false });
    assert.ok(!conditionMet(d, state(store.get())));
    assert.ok(conditionMet(any, state(store.get())));
    store.rekey({ tonic: "D", mode: "major", provisional: true });
    assert.ok(!conditionMet(d, state(store.get())), "provisional D isn't chosen");
  });

  it("reads a chord's numeral in the song's key", () => {
    const store = demo();
    store.rekey({ tonic: "D", mode: "major", provisional: false });
    assert.equal(numeralAt(store.get(), 8, 3), null);
    place(store, 8, 3, "vi");
    assert.equal(numeralAt(store.get(), 8, 3), "vi");
    const at = /** @type {const} */ ({ type: "chordAt", bar: 8, beat: 3, numeral: "I" });
    assert.ok(!conditionMet(at, state(store.get())));
    place(store, 8, 3, "I");
    assert.ok(conditionMet(at, state(store.get())));
    assert.equal(noteAt(store.get(), 8, 2), null, "no note starts on beat 2 of bar 8");
  });

  it("wants a tutor reply", () => {
    const replied = /** @type {const} */ ({ type: "tutorReplied" });
    assert.ok(!conditionMet(replied, state(tune, 0)));
    assert.ok(conditionMet(replied, state(tune, 2)));
  });
});

describe("hintFor", () => {
  const home = /** @type {Step} */ (steps.find((s) => s.id === "home"));

  it("points a wrong home to the drone test, and says nothing before a guess or after D", () => {
    const store = demo();
    assert.equal(hintFor(home, state(store.get())), null);
    store.rekey({ tonic: "A", mode: "major", provisional: false });
    assert.match(hintFor(home, state(store.get())) ?? "", /Check it by ear/);
    store.rekey({ tonic: "D", mode: "major", provisional: false });
    assert.equal(hintFor(home, state(store.get())), null);
  });
});

describe("shouldAdvance", () => {
  it("advances only when a condition becomes true", () => {
    assert.equal(shouldAdvance(false, true), true);
    assert.equal(shouldAdvance(true, true), false, "already done on arrival: wait for Next");
    assert.equal(shouldAdvance(false, false), false);
    assert.equal(shouldAdvance(true, false), false);
  });
});

describe("progress", () => {
  function fakeStorage() {
    /** @type {Map<string, string>} */
    const items = new Map();
    return {
      getItem: (/** @type {string} */ key) => items.get(key) ?? null,
      setItem: (/** @type {string} */ key, /** @type {string} */ value) =>
        void items.set(key, value),
    };
  }
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  it("remembers the step left on, kept inside the path", () => {
    const storage = fakeStorage();
    assert.equal(loadProgress(7, storage), 0);
    saveProgress(4, storage);
    assert.equal(loadProgress(7, storage), 4);
    assert.equal(loadProgress(3, storage), 2);
    storage.setItem("hearhear.guided.step", "nonsense");
    assert.equal(loadProgress(7, storage), 0);
  });

  it("starts over when storage is blocked", () => {
    assert.doesNotThrow(() => saveProgress(3, blocked));
    assert.equal(loadProgress(7, blocked), 0);
  });

  it("clamps any index", () => {
    assert.equal(clampStep(-1, 5), 0);
    assert.equal(clampStep(9, 5), 4);
    assert.equal(clampStep(1.5, 5), 0);
    assert.equal(clampStep(2, 0), 0);
  });
});

describe("lessonExchange", () => {
  it("gives the plan's question and hint level", () => {
    const ending = plan.exchanges.find((e) => e.id === "ode-ending");
    assert.deepEqual(lessonExchange(plan, "ode-ending"), {
      question: ending?.question,
      level: "answer",
    });
    assert.equal(lessonExchange(plan, "nope"), null);
  });
});

describe("placePanel", () => {
  const size = { width: 300, height: 150 };
  const area = { left: 80, right: 1360, bottom: 750 };
  const right = { top: 588, left: 1060 };

  it("sits above the dock at the workspace's right edge when that's clear", () => {
    assert.deepEqual(placePanel(size, area, []), right);
  });

  it("lifts above the tutor's question box when it would cover it", () => {
    const ask = { top: 640, left: 900, bottom: 740, right: 1340 };
    assert.deepEqual(placePanel(size, area, [ask], ask), { top: 478, left: 1060 });
  });

  it("moves to the left edge when the right is covered twice over", () => {
    const ask = { top: 640, left: 900, bottom: 740, right: 1340 };
    const log = { top: 300, left: 900, bottom: 630, right: 1340 };
    assert.deepEqual(placePanel(size, area, [ask, log], ask), { top: 588, left: 80 });
  });

  it("takes the spot that covers least when none is clear", () => {
    const everywhere = { top: 0, left: 0, bottom: 900, right: 1440 };
    const corner = { top: 700, left: 1300, bottom: 750, right: 1360 };
    assert.deepEqual(placePanel(size, area, [everywhere, corner]), { top: 588, left: 80 });
  });
});
