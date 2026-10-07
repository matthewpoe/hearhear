import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HIGHEST,
  LOWEST,
  NOTE_CODES,
  bindingLabel,
  bindingSpoken,
  clampWindow,
  keyBindings,
  windowBounds,
} from "../../src/input/keyBindings.js";
import { degreeToMidi, keyEventToDegree } from "../../src/theory/index.js";

const TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const KEYS = TONICS.flatMap((tonic) =>
  /** @type {const} */ (["major", "minor"]).map((mode) => ({ tonic, mode, provisional: false })),
);
const C_MAJOR = { tonic: "C", mode: "major", provisional: false };
const BLACK = new Set([1, 3, 6, 8, 10]);

describe("keyBindings", () => {
  it("gives every white key from C2 to C6 a plain key in C major", () => {
    const bindings = keyBindings(C_MAJOR, 0);
    for (let midi = LOWEST; midi <= HIGHEST; midi++) {
      if (BLACK.has(midi % 12) || midi > 76) continue; // the top plain key, 0, is E5
      assert.equal(bindings.get(midi)?.modifier, null, `midi ${midi}`);
    }
  });

  it("gives every black key in reach a Shift binding in C major", () => {
    const bindings = keyBindings(C_MAJOR, 0);
    for (const [midi, binding] of bindings) {
      if (BLACK.has(midi % 12)) assert.equal(binding.modifier, "shift", `midi ${midi}`);
    }
    assert.deepEqual(bindings.get(61), { code: "Digit1", modifier: "shift" });
  });

  it("never binds a key off the C2–C6 piano, in any key or window", () => {
    for (const key of KEYS) {
      for (const w of [-1, 0, 1]) {
        for (const midi of keyBindings(key, w).keys()) {
          assert.ok(midi >= LOWEST && midi <= HIGHEST, `${key.tonic} ${key.mode} w${w}: ${midi}`);
        }
      }
    }
  });

  it("labels follow the window, but only as far as the window may go", () => {
    const key = C_MAJOR;
    const { min, max } = windowBounds(key);
    for (let w = min; w <= max; w++) {
      assert.deepEqual(keyBindings(key, w).get(60 + 12 * w), { code: "Digit1", modifier: null });
    }
    // A stored window past the bounds reads as the nearest allowed one.
    assert.deepEqual(keyBindings(key, max + 1), keyBindings(key, max));
    assert.deepEqual(keyBindings(key, min - 1), keyBindings(key, min));
  });

  it("labels and speaks Shift, with no Alt branch", () => {
    assert.equal(bindingLabel({ code: "KeyQ", modifier: null }), "Q");
    assert.equal(bindingLabel({ code: "Digit4", modifier: "shift" }), "⇧4");
    assert.equal(bindingSpoken({ code: "Digit4", modifier: "shift" }), "Shift 4");
    assert.equal(bindingSpoken({ code: "KeyA", modifier: null }), "A");
  });
});

describe("windowBounds", () => {
  const plainMidis = (key, w) =>
    NOTE_CODES.map((code) =>
      degreeToMidi(
        /** @type {import("../../src/types.js").ScaleDegree} */ (
          keyEventToDegree(code, { shift: false, alt: false })
        ),
        key,
        w,
      ),
    );

  it("allows only windows where every plain key lands on the piano", () => {
    for (const key of KEYS) {
      const { min, max } = windowBounds(key);
      assert.ok(min <= 0 && 0 <= max, `${key.tonic} ${key.mode} keeps home reachable`);
      for (let w = min; w <= max; w++) {
        const midis = plainMidis(key, w);
        const fits = midis.every((m) => m >= LOWEST && m <= HIGHEST);
        // Either the window fits, or no window does and it stays home.
        assert.ok(fits || (min === 0 && max === 0), `${key.tonic} ${key.mode} w${w}`);
      }
    }
  });

  it("keeps C major home, where the three rows already span C2 to E5", () => {
    assert.deepEqual(windowBounds(C_MAJOR), { min: 0, max: 0 });
    assert.equal(clampWindow(C_MAJOR, 1), 0);
    assert.equal(clampWindow(C_MAJOR, -1), 0);
  });
});
