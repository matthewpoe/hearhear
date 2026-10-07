import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

// A stand-in for the DOM's HTMLElement, so the form-field check runs in Node.
class FakeElement {
  /** @param {string | null} [field] the form-field tag this element sits inside */
  constructor(field = null) {
    this.field = field;
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
  ui.update({ windowOctave: 0 });
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
