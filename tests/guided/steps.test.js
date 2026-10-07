import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "../../content/guided-path.json" with { type: "json" };
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { createSongStore } from "../../src/store/song.js";
import { chordFromNumeral } from "../../src/theory/index.js";
import {
  checkPath,
  clampStep,
  conditionMet,
  hintFor,
  loadProgress,
  noteAt,
  numeralAt,
  saveProgress,
  pushDegree,
  stepTarget,
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
const state = (song, tutorReplies = 0, played = false, loadedThisTour = true) => ({
  song,
  tutorReplies,
  played,
  loadedThisTour,
});

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

  it("has unique step ids, and a title, a one-line instruction and a target on each", () => {
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
    for (const step of steps) {
      assert.ok(step.title && step.line && step.target, step.id);
      assert.ok(!("action" in step), `${step.id}: the tour has no step buttons`);
    }
  });

  it("is completed, step by step, by playing the story through the song store", () => {
    const store = demo();
    /** @type {Record<string, () => void>} */
    const doIt = {
      load: () => {},
      home: () => store.rekey({ tonic: "D", mode: "major", provisional: false }),
      "half-cadence": () => place(store, 4, 3, "V"),
      land: () => place(store, 8, 3, "I"),
    };
    let replies = 0;
    let played = false;
    /** @type {Record<string, boolean>} */
    let facts = {};
    /** @type {number[]} */
    let recentDegrees = [];
    const at = () => ({ ...state(store.get(), replies, played), facts, recentDegrees });
    for (const step of steps) {
      assert.equal(conditionMet(step.done, at()), step.id === "load", step.id);
      if (step.id === "ask") replies = 1;
      else if (step.id === "listen") played = true;
      else if (step.done.type === "fact") facts = { ...facts, [step.done.fact]: true };
      else if (step.done.type === "degrees") {
        for (const degree of step.done.degrees) {
          recentDegrees = pushDegree(recentDegrees, { degree, accidental: 0 });
        }
      } else doIt[step.id]();
      assert.ok(conditionMet(step.done, at()), step.id);
    }
  });
});

describe("degrees", () => {
  const met = { type: /** @type {const} */ ("degrees"), degrees: [3, 3, 4, 5] };
  /** @param {number[]} played */
  const after = (played) =>
    played.reduce(
      (list, degree) => pushDegree(list, { degree, accidental: 0 }),
      /** @type {number[]} */ ([]),
    );
  it("wants the degrees in order, as the last notes played", () => {
    assert.ok(conditionMet(met, { ...state(tune), recentDegrees: after([1, 3, 3, 4, 5]) }));
    assert.ok(!conditionMet(met, { ...state(tune), recentDegrees: after([3, 4, 5]) }));
    assert.ok(!conditionMet(met, { ...state(tune), recentDegrees: after([3, 3, 4, 5, 6]) }));
    assert.ok(!conditionMet(met, state(tune)));
  });
  it("counts a note off the scale as no degree", () => {
    assert.deepEqual(pushDegree([3, 3, 4], { degree: 5, accidental: 1 }), [3, 3, 4, 0]);
  });
  it("keeps only the last few", () => {
    assert.equal(after([1, 2, 3, 4, 5, 6, 7, 1, 2, 3]).length, 8);
  });
});

describe("conditionMet", () => {
  it("reads a fact", () => {
    const met = { type: /** @type {const} */ ("fact"), fact: "notePlaying" };
    assert.ok(conditionMet(met, { ...state(tune), facts: { notePlaying: true } }));
    assert.ok(!conditionMet(met, { ...state(tune), facts: { notePlaying: false } }));
    assert.ok(!conditionMet(met, state(tune)));
  });

  it("wants the named song with notes", () => {
    const met = { type: /** @type {const} */ ("songLoaded"), song: "ode-to-joy" };
    assert.ok(conditionMet(met, state(tune)));
    assert.ok(!conditionMet(met, state({ ...tune, id: "st-james-infirmary" })));
    assert.ok(!conditionMet(met, state({ ...tune, notes: [] })));
  });

  it("wants the song loaded during this run, so a fresh tour starts at step 1", () => {
    const met = { type: /** @type {const} */ ("songLoaded"), song: "ode-to-joy" };
    assert.ok(!conditionMet(met, state(tune, 0, false, false)));
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

  it("wants Play pressed on a loaded song", () => {
    const played = /** @type {const} */ ({ type: "played" });
    assert.ok(!conditionMet(played, state(tune)));
    assert.ok(conditionMet(played, state(tune, 0, true)));
    assert.ok(!conditionMet(played, state({ ...tune, notes: [] }, 0, true)));
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

describe("stepTarget", () => {
  /** @param {string} id */
  const target = (id) =>
    stepTarget(/** @type {Step} */ (steps.find((s) => s.id === id)), demo().get());
  /** @param {number} bar @param {number} beat */
  const noteId = (bar, beat) => ({ noteId: noteAt(tune, bar, beat)?.id });

  it("points each step at the real control it asks the viewer to use", () => {
    assert.deepEqual(target("load"), { songId: "ode-to-joy" });
    assert.deepEqual(target("listen"), { selector: "#staff", button: "Play" });
    assert.deepEqual(target("home"), { selector: "#key-prompt" });
    assert.deepEqual(target("numbers"), { codes: ["Digit3", "Digit4", "Digit5"] });
    assert.deepEqual(target("half-cadence"), noteId(4, 3));
    assert.deepEqual(target("land"), noteId(8, 3));
    assert.deepEqual(target("ask"), { selector: "#tutor .ask" });
    assert.deepEqual(target("transpose"), { selector: "#toolbar > summary" });
    assert.deepEqual(target("your-turn"), { selector: "#record-button, #record-card" });
  });

  it("names nothing for a note the song lacks", () => {
    const off = /** @type {Step} */ ({
      ...steps[0],
      target: { type: "note", bar: 99, beat: 1 },
    });
    assert.equal(stepTarget(off, tune), null);
  });
});
