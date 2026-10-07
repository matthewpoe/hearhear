import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { degreeToMidi, keyEventToDegree, midiToDegree, spell } from "../../src/theory/index.js";

const C_MAJOR = { tonic: "C", mode: "major", provisional: true };
const D_MAJOR = { tonic: "D", mode: "major", provisional: false };
const E_MINOR = { tonic: "E", mode: "minor", provisional: false };
const GB_MAJOR = { tonic: "Gb", mode: "major", provisional: false };

/** @param {number} midi @param {object} key */
const degreeLabel = (midi, key) => {
  const { degree, accidental } = midiToDegree(midi, /** @type {any} */ (key));
  return `${{ "-1": "b", 0: "", 1: "#" }[accidental]}${degree}`;
};

describe("spell", () => {
  it("uses the key's own notes", () => {
    assert.equal(spell(66, D_MAJOR), "F#4");
    assert.equal(spell(73, D_MAJOR), "C#5");
    assert.equal(spell(70, { tonic: "F", mode: "major", provisional: false }), "Bb4");
    assert.equal(spell(71, GB_MAJOR), "Cb5");
    assert.equal(spell(59, GB_MAJOR), "Cb4");
  });

  it("spells chromatic notes the way the number row's modifiers name them", () => {
    assert.deepEqual(
      [61, 63, 66, 68, 70].map((m) => spell(m, C_MAJOR)),
      ["Db4", "Eb4", "F#4", "Ab4", "Bb4"],
    );
    // Minor: the raised 3rd, 6th, and 7th are sharps; the leading tone is D#, not Eb.
    assert.deepEqual(
      [65, 68, 70, 73, 75].map((m) => spell(m, E_MINOR)),
      ["F4", "G#4", "A#4", "C#5", "D#5"],
    );
  });

  it("avoids double accidentals", () => {
    assert.equal(spell(55, GB_MAJOR), "G3");
    const dbMajor = { tonic: "Db", mode: "major", provisional: false };
    assert.equal(spell(64, dbMajor), "Fb4", "b3 needs only one flat");
    assert.equal(spell(69, dbMajor), "A4", "b6 would be Bbb");
  });

  it("writes minor's raised degrees as harmonic minor does, double sharps included", () => {
    const minor = (/** @type {string} */ tonic) => ({ tonic, mode: "minor", provisional: false });
    assert.equal(spell(67, minor("G#")), "F##4", "G# minor's leading tone");
    assert.equal(spell(62, minor("D#")), "C##4", "D# minor's leading tone");
    assert.equal(spell(67, minor("D#")), "F##4", "D# minor's raised 3rd");
    assert.equal(spell(67, minor("C#")), "F##4", "C# minor's raised 4th");
  });

  it("spells every note of the real songs in their keys", () => {
    assert.deepEqual(
      ode.notes.slice(0, 9).map((n) => spell(n.midi, D_MAJOR)),
      ["F#4", "F#4", "G4", "A4", "A4", "G4", "F#4", "E4", "D4"],
    );
    assert.deepEqual(
      stJames.notes.slice(10, 16).map((n) => spell(n.midi, E_MINOR)),
      ["B4", "B4", "E5", "C5", "B4", "B4"],
    );
  });
});

describe("degreeToMidi and midiToDegree", () => {
  it("puts 1 at the tonic at or above middle C", () => {
    assert.equal(degreeToMidi({ degree: 1, accidental: 0, octave: 0 }, C_MAJOR), 60);
    assert.equal(degreeToMidi({ degree: 1, accidental: 0, octave: 0 }, D_MAJOR), 62);
    assert.equal(degreeToMidi({ degree: 1, accidental: 0, octave: 0 }, E_MINOR), 64);
    assert.equal(degreeToMidi({ degree: 1, accidental: 0, octave: 0 }, GB_MAJOR), 66);
  });

  it("uses natural minor, with the raised seventh on a modifier", () => {
    const sevenths = [0, 1].map((accidental) =>
      degreeToMidi(
        { degree: 7, accidental: /** @type {0 | 1} */ (accidental), octave: 0 },
        E_MINOR,
      ),
    );
    assert.deepEqual(
      sevenths.map((m) => spell(m, E_MINOR)),
      ["D5", "D#5"],
    );
  });

  it("applies octave dots and the arrow keys' window shift", () => {
    const low7 = { degree: /** @type {7} */ (7), accidental: /** @type {0} */ (0), octave: -1 };
    assert.equal(degreeToMidi(low7, D_MAJOR), 61);
    assert.equal(degreeToMidi(low7, D_MAJOR, 1), 73);
    assert.deepEqual(midiToDegree(61, D_MAJOR), low7);
  });

  it("round-trips every pitch on the keyboard in every key", () => {
    for (const tonic of ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"]) {
      for (const mode of ["major", "minor"]) {
        const key = /** @type {any} */ ({ tonic, mode, provisional: false });
        for (let midi = 36; midi <= 84; midi++) {
          assert.equal(
            degreeToMidi(midiToDegree(midi, key), key),
            midi,
            `${midi} in ${tonic} ${mode}`,
          );
        }
      }
    }
  });

  it("reads every conventional keystroke back as itself, in every key", () => {
    // The modifier each chromatic pitch class is conventionally played with.
    const chromatic = {
      major: ["b2", "b3", "#4", "b6", "b7"],
      minor: ["b2", "#3", "#4", "#6", "#7"],
    };
    const tonics = {
      major: ["C", "Db", "C#", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B", "Cb"],
      minor: ["C", "C#", "D", "D#", "Eb", "E", "F", "F#", "G", "G#", "Ab", "A", "A#", "Bb", "B"],
    };
    for (const mode of /** @type {const} */ (["major", "minor"])) {
      const labels = [..."1234567", ...chromatic[mode]];
      for (const tonic of tonics[mode]) {
        const key = { tonic, mode, provisional: false };
        for (const label of labels) {
          const accidental = label.startsWith("b") ? -1 : label.startsWith("#") ? 1 : 0;
          const degree = Number(label.at(-1));
          for (const octave of [-2, -1, 0, 1]) {
            const d = /** @type {any} */ ({ degree, accidental, octave });
            assert.deepEqual(
              midiToDegree(degreeToMidi(d, key), key),
              d,
              `${label} in ${tonic} ${mode}`,
            );
          }
        }
      }
    }
  });

  it("labels the keystroke even where the spelling avoids a double flat", () => {
    assert.equal(spell(69, GB_MAJOR), "A4");
    assert.equal(degreeLabel(69, GB_MAJOR), "b3");
    assert.equal(degreeLabel(67, { tonic: "G#", mode: "minor", provisional: false }), "#7");
  });

  it("reads the real songs as scale degrees", () => {
    assert.deepEqual(
      ode.notes.slice(0, 9).map((n) => degreeLabel(n.midi, D_MAJOR)),
      ["3", "3", "4", "5", "5", "4", "3", "2", "1"],
    );
    // St. James's high E is 1 an octave up, which the number row plays on 8.
    assert.deepEqual(midiToDegree(76, E_MINOR), { degree: 1, accidental: 0, octave: 1 });
    assert.deepEqual(
      stJames.notes.slice(0, 9).map((n) => degreeLabel(n.midi, E_MINOR)),
      ["5", "5", "5", "5", "4", "5", "5", "3", "1"],
    );
  });

  it("names chromatic notes by the key's spelling", () => {
    assert.equal(degreeLabel(63, C_MAJOR), "b3");
    assert.equal(degreeLabel(66, C_MAJOR), "#4");
    assert.equal(degreeLabel(75, E_MINOR), "#7");
    assert.equal(degreeLabel(65, D_MAJOR), "b3");
  });
});

describe("keyEventToDegree", () => {
  const plain = { shift: false, alt: false };

  it("lines each column up as one degree across the three rows", () => {
    for (const [codes, degree] of [
      [["Digit1", "KeyQ", "KeyA"], 1],
      [["Digit7", "KeyU", "KeyJ"], 7],
    ]) {
      assert.deepEqual(
        codes.map((c) => keyEventToDegree(c, plain)),
        [0, -1, -2].map((octave) => ({ degree, accidental: 0, octave })),
      );
    }
  });

  it("continues 8, 9, 0 to 1, 2, 3 above home", () => {
    assert.deepEqual(
      ["Digit8", "Digit9", "Digit0"].map((c) => keyEventToDegree(c, plain)),
      [1, 2, 3].map((degree) => ({ degree, accidental: 0, octave: 1 })),
    );
  });

  it("raises with Shift and lowers with Alt, on every row", () => {
    assert.equal(keyEventToDegree("Digit7", { shift: true, alt: false })?.accidental, 1);
    assert.equal(keyEventToDegree("KeyE", { shift: false, alt: true })?.accidental, -1);
    assert.equal(keyEventToDegree("KeyE", { shift: true, alt: true })?.accidental, 0);
  });

  it("reads the numeric keypad's digits as the number row's", () => {
    for (const d of ["1", "5", "7", "8", "0"]) {
      assert.deepEqual(keyEventToDegree(`Numpad${d}`, plain), keyEventToDegree(`Digit${d}`, plain));
    }
    assert.equal(keyEventToDegree("Numpad7", { shift: true, alt: false })?.accidental, 1);
    for (const code of ["NumpadAdd", "NumpadEnter", "NumpadDecimal"]) {
      assert.equal(keyEventToDegree(code, plain), null, code);
    }
  });

  it("ignores keys that aren't note keys", () => {
    for (const code of ["KeyI", "KeyO", "KeyP", "KeyK", "KeyL", "Minus", "BracketLeft", "Space"]) {
      assert.equal(keyEventToDegree(code, plain), null, code);
    }
  });

  it("plays the same note for the same key, whatever came before", () => {
    const shiftSeven = keyEventToDegree("Digit7", { shift: true, alt: false });
    assert.ok(shiftSeven);
    assert.equal(spell(degreeToMidi(shiftSeven, E_MINOR), E_MINOR), "D#5");
    const lowFive = keyEventToDegree("KeyT", plain);
    assert.ok(lowFive);
    assert.equal(degreeToMidi(lowFive, D_MAJOR), 57);
  });
});
