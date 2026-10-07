import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

// A stand-in for the DOM's HTMLElement, so the form-field check runs in Node.
class FakeElement {
  /**
   * @param {string | null} [field] the form-field tag this element sits inside
   * @param {string} [type] the input's type, for an "input" field
   */
  constructor(field = null, type = "text") {
    this.field = field;
    this.type = type;
    this.tagName = field?.toUpperCase() ?? "DIV";
    this.isContentEditable = false;
  }
  /** @param {string} selector */
  closest(selector) {
    return this.field && selector.includes(this.field) ? this : null;
  }
}
globalThis.HTMLElement = /** @type {any} */ (FakeElement);

const { flatArmed, listenToNumberRow } = await import("../../src/input/NumberRow.js");
const { heldNotes, press, release } = await import("../../src/input/liveNotes.js");
const { song } = await import("../../src/store/song.js");
const { ui } = await import("../../src/store/ui.js");

/** A window-like target that records listeners and dispatches keyboard-shaped events. */
function fakeWindow() {
  /** @type {Map<string, Set<(event: any) => void>>} */
  const listeners = new Map();
  return {
    /** @param {string} type @param {(event: any) => void} fn */
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(fn);
    },
    /** @param {string} type @param {(event: any) => void} fn */
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    /** @param {string} type @param {Record<string, unknown>} [init] */
    dispatch(type, init = {}) {
      const event = {
        code: "",
        shiftKey: false,
        altKey: false,
        metaKey: false,
        ctrlKey: false,
        repeat: false,
        target: null,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...init,
      };
      for (const fn of listeners.get(type) ?? []) fn(event);
      return event;
    },
  };
}

/** @returns {number[]} */
function held() {
  let value = /** @type {ReadonlySet<number>} */ (new Set());
  heldNotes.subscribe((v) => (value = v))();
  return [...value].sort((a, b) => a - b);
}

/** @param {string} code @param {Record<string, unknown>} [init] */
const down = (code, init = {}) => target.dispatch("keydown", { code, ...init });
/** @param {string} code */
const up = (code) => target.dispatch("keyup", { code });

/** @type {ReturnType<typeof fakeWindow>} */
let target;
/** @type {() => void} */
let stop;
const quiet = console.debug;

beforeEach(() => {
  console.debug = () => {}; // the audio stubs log every note
  song.load({ ...song.get(), key: { tonic: "C", mode: "major", provisional: true } });
  ui.update({
    windowOctave: 0,
    bottomRow: "notes",
    selectedNoteId: null,
    demoAwaitingGuess: false,
  });
  target = fakeWindow();
  stop = listenToNumberRow(/** @type {any} */ (target));
});

afterEach(() => {
  stop();
  console.debug = quiet;
});

describe("number row", () => {
  it("plays degrees in the three rows, Shift raising", () => {
    down("Digit1");
    down("KeyQ");
    down("KeyA");
    down("Digit4", { shiftKey: true });
    assert.deepEqual(held(), [36, 48, 60, 66]);
    for (const code of ["Digit1", "KeyQ", "KeyA", "Digit4"]) up(code);
    assert.deepEqual(held(), []);
  });

  it("Alt lowers and claims the key from the browser", () => {
    const event = down("Digit3", { altKey: true });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(held(), [63]);
    up("Digit3");
  });

  it("plays the numeric keypad as the number row, with the same modifiers", () => {
    down("Numpad1");
    const event = down("Numpad3", { altKey: true });
    assert.equal(event.defaultPrevented, true);
    down("Numpad4", { shiftKey: true });
    // Num Lock off: the key is "ArrowUp", the code still Numpad8.
    down("Numpad8", { key: "ArrowUp" });
    assert.deepEqual(held(), [60, 63, 66, 72]);
    for (const code of ["Numpad1", "Numpad3", "Numpad4", "Numpad8"]) up(code);
    assert.deepEqual(held(), []);
    assert.equal(ui.get().windowOctave, 0);
  });

  it("ignores auto-repeat", () => {
    down("Digit5");
    down("Digit5", { repeat: true });
    up("Digit5");
    assert.deepEqual(held(), []);
  });

  it("leaves form fields, Cmd/Ctrl chords, and claimed keys alone", () => {
    down("Digit1", { target: new FakeElement("textarea") });
    down("Digit2", { metaKey: true });
    down("Digit3", { ctrlKey: true });
    down("Digit4", { defaultPrevented: true });
    assert.deepEqual(held(), []);
    const arrow = down("ArrowUp", { target: new FakeElement("select") });
    assert.equal(arrow.defaultPrevented, false);
  });

  it("still plays with a radio or checkbox focused, which keeps only its arrows", () => {
    // Clicking Bright/Dark or a label style focuses a radio input.
    const radio = new FakeElement("input", "radio");
    down("Digit1", { target: radio });
    assert.equal(held().length, 1);
    up("Digit1");
    down("Digit2", { target: new FakeElement("input", "checkbox") });
    assert.equal(held().length, 1);
    up("Digit2");
    const arrow = down("ArrowUp", { target: radio });
    assert.equal(arrow.defaultPrevented, false);
    down("Digit3", { target: new FakeElement("input", "text") });
    assert.deepEqual(held(), []);
  });

  it("releases the pitch a key started, even if the key changed meanwhile", () => {
    down("Digit1");
    song.load({ ...song.get(), key: { tonic: "D", mode: "major", provisional: false } });
    up("Digit1");
    assert.deepEqual(held(), []);
  });

  it("arrows never scroll and keep the window inside the key's bounds", () => {
    const event = down("ArrowUp");
    assert.equal(event.defaultPrevented, true);
    // In C major the three rows already span C2 to E5, so the window stays home.
    assert.equal(ui.get().windowOctave, 0);
    down("ArrowDown");
    assert.equal(ui.get().windowOctave, 0);
  });

  it("never plays a key that would fall off the piano", () => {
    down("KeyA", { altKey: true }); // B1, below C2
    assert.deepEqual(held(), []);
    up("KeyA");
  });

  it("`-` arms a flat for exactly one note", () => {
    let armed = false;
    const unsubscribe = flatArmed.subscribe((v) => (armed = v));
    down("Minus");
    assert.equal(armed, true);
    down("Digit3");
    assert.deepEqual(held(), [63]);
    assert.equal(armed, false);
    up("Digit3");
    down("Digit3");
    assert.deepEqual(held(), [64]);
    up("Digit3");
    unsubscribe();
  });

  it("a second `-` or Escape disarms", () => {
    let armed = false;
    const unsubscribe = flatArmed.subscribe((v) => (armed = v));
    down("Minus");
    down("Minus");
    assert.equal(armed, false);
    down("Minus");
    down("Escape");
    assert.equal(armed, false);
    unsubscribe();
  });

  it("releases everything when the window loses focus", () => {
    down("Digit1");
    down("Digit5");
    target.dispatch("blur");
    assert.deepEqual(held(), []);
  });
});

describe("liveNotes", () => {
  it("keeps a note sounding until the last source lets go", () => {
    press(60, "key:Digit1");
    press(60, "pointer:1");
    release(60, "pointer:1");
    assert.deepEqual(held(), [60]);
    release(60, "key:Digit1");
    assert.deepEqual(held(), []);
  });

  it("ignores a release from a source that never pressed", () => {
    press(62, "focus");
    release(62, "pointer:7");
    assert.deepEqual(held(), [62]);
    release(62, "focus");
  });

  it("a number-row key and the piano share a note without cutting each other off", () => {
    down("Digit1");
    press(60, "pointer:2");
    release(60, "pointer:2");
    assert.deepEqual(held(), [60]);
    up("Digit1");
    assert.deepEqual(held(), []);
  });
});

describe("chord row", () => {
  const NOTE = { id: "n1", midi: 64, start: 0, dur: 12 };

  /** @param {boolean} provisional */
  function loadSong(provisional) {
    song.load({
      ...song.get(),
      key: { tonic: "C", mode: "major", provisional },
      notes: [NOTE],
      chords: [],
    });
  }

  beforeEach(() => ui.update({ bottomRow: "chords" }));

  it("plays the chord on each degree, held while the key is held", () => {
    loadSong(true);
    down("KeyG");
    assert.deepEqual(held(), [43, 47, 50]); // G B D, all under home (C4)
    up("KeyG");
    assert.deepEqual(held(), []);
  });

  it("the Notes switch restores single low notes", () => {
    ui.update({ bottomRow: "notes" });
    down("KeyA");
    assert.deepEqual(held(), [36]);
    up("KeyA");
  });

  it("assigns the chord to the selected note once the key is confirmed, as one undoable action", () => {
    loadSong(false);
    ui.update({ selectedNoteId: "n1" });
    const before = song.get().version;
    down("KeyF");
    assert.deepEqual(
      song.get().chords.map(({ noteId, root, type }) => ({ noteId, root, type })),
      [{ noteId: "n1", root: "F", type: "M" }],
    );
    assert.equal(song.get().version, before + 1);
    // F A C under the note, with the note on top.
    assert.deepEqual(held(), [53, 57, 60, 64]);
    up("KeyF");
  });

  it("only plays, never assigns, while the key is tentative or hidden", () => {
    for (const demoAwaitingGuess of [false, true]) {
      loadSong(true);
      ui.update({ selectedNoteId: "n1", demoAwaitingGuess });
      down("KeyG");
      up("KeyG");
      assert.deepEqual(song.get().chords, []);
    }
  });

  it("Backspace and Delete clear the selected note's chord", () => {
    loadSong(false);
    ui.update({ selectedNoteId: "n1" });
    for (const code of ["Backspace", "Delete"]) {
      down("KeyA");
      up("KeyA");
      assert.equal(song.get().chords.length, 1);
      const event = down(code);
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(song.get().chords, []);
    }
  });

  it("leaves Shift+Backspace to the staff: the chord and the note stay", () => {
    loadSong(false);
    ui.update({ selectedNoteId: "n1" });
    down("KeyA");
    up("KeyA");
    for (const code of ["Backspace", "Delete"]) {
      assert.equal(down(code, { shiftKey: true }).defaultPrevented, false);
      assert.equal(song.get().chords.length, 1);
      assert.ok(song.get().notes.some((n) => n.id === "n1"));
    }
  });

  it("leaves Backspace alone with nothing to clear, and ignores text fields", () => {
    loadSong(false);
    ui.update({ selectedNoteId: "n1" });
    assert.equal(down("Backspace").defaultPrevented, false);
    down("KeyA", { target: new FakeElement("input") });
    assert.deepEqual(song.get().chords, []);
    assert.deepEqual(held(), []);
  });
});
