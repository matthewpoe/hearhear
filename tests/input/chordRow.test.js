import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHORD_CODES,
  chordForCode,
  chordKeyLabel,
  chordRowAction,
  chordRowNumeral,
  clearsChord,
  liveVoicing,
} from "../../src/input/chordRow.js";
import { chordRowKeys, keyBindings } from "../../src/input/keyBindings.js";

const C_MAJOR = { tonic: "C", mode: /** @type {const} */ ("major"), provisional: false };
const E_MINOR = { tonic: "E", mode: /** @type {const} */ ("minor"), provisional: false };

/** @param {import("../../src/types.js").Key} key */
const chordsIn = (key) =>
  CHORD_CODES.map((code) => {
    const { chord, fn } = /** @type {NonNullable<ReturnType<typeof chordForCode>>} */ (
      chordForCode(code, key)
    );
    return `${chord.root}${chord.type} ${fn}`;
  });

describe("chord row: degree to chord", () => {
  it("plays the diatonic triads in major, A to J = I to vii°", () => {
    assert.deepEqual(
      CHORD_CODES.map((code) => chordRowNumeral(code, "major")),
      ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    );
    assert.deepEqual(chordsIn(C_MAJOR), [
      "CM tonic",
      "Dm subdominant",
      "Em tonic",
      "FM subdominant",
      "GM dominant",
      "Am tonic",
      "Bdim dominant",
    ]);
  });

  it("plays natural minor with a major V in minor, like the dropdown's suspects", () => {
    assert.deepEqual(
      CHORD_CODES.map((code) => chordRowNumeral(code, "minor")),
      ["i", "ii°", "III", "iv", "V", "VI", "VII"],
    );
    assert.deepEqual(chordsIn(E_MINOR), [
      "Em tonic",
      "F#dim subdominant",
      "GM tonic",
      "Am subdominant",
      "BM dominant",
      "CM subdominant",
      "DM subdominant",
    ]);
  });

  it("is not a chord-row key outside A to J", () => {
    assert.equal(chordForCode("KeyK", C_MAJOR), null);
    assert.equal(chordForCode("Digit1", C_MAJOR), null);
  });

  it("voices live chords below home, never below C2", () => {
    for (const code of CHORD_CODES) {
      const { chord } = /** @type {NonNullable<ReturnType<typeof chordForCode>>} */ (
        chordForCode(code, C_MAJOR)
      );
      for (const window of [-1, 0, 1]) {
        const voicing = liveVoicing(chord, C_MAJOR, window);
        assert.ok(
          voicing.every((m) => m >= 36),
          `${code} window ${window}`,
        );
      }
      assert.ok(
        liveVoicing(chord, C_MAJOR, 0).every((m) => m < 60),
        code,
      );
    }
  });

  it("labels chords in the user's style", () => {
    const g = { root: "G", type: "M" };
    assert.equal(chordKeyLabel(g, C_MAJOR, "roman"), "V");
    assert.equal(chordKeyLabel(g, C_MAJOR, "roman+letters"), "V");
    assert.equal(chordKeyLabel(g, C_MAJOR, "nashville"), "5");
    assert.equal(chordKeyLabel(g, C_MAJOR, "letters"), "G");
  });
});

describe("chord row: assign or play", () => {
  const MODES = /** @type {const} */ (["hidden", "tentative", "confirmed"]);

  it("assigns only with a note selected and the key confirmed", () => {
    for (const mode of MODES) {
      assert.equal(
        chordRowAction({ bottomRow: "chords", mode, selectedNoteId: "n1" }),
        mode === "confirmed" ? "assign" : "play",
        mode,
      );
      assert.equal(chordRowAction({ bottomRow: "chords", mode, selectedNoteId: null }), "play");
    }
  });

  it("plays single notes whenever the switch is on Notes", () => {
    for (const mode of MODES) {
      assert.equal(chordRowAction({ bottomRow: "notes", mode, selectedNoteId: "n1" }), "notes");
    }
  });

  it("clears a chord under the same conditions it assigns one", () => {
    for (const mode of MODES) {
      assert.equal(clearsChord({ mode, selectedNoteId: "n1" }), mode === "confirmed");
      assert.equal(clearsChord({ mode, selectedNoteId: null }), false);
    }
  });
});

describe("chord row: the switch and the piano's labels", () => {
  it("takes A to J off single notes while the bottom row plays chords", () => {
    /** @param {"chords" | "notes"} row */
    const codes = (row) => new Set([...keyBindings(C_MAJOR, 0, row).values()].map((b) => b.code));
    for (const code of CHORD_CODES) {
      assert.equal(codes("notes").has(code), true, code);
      assert.equal(codes("chords").has(code), false, code);
    }
    assert.equal(codes("chords").has("KeyQ"), true);
  });

  it("labels each chord's root two octaves under the number row", () => {
    assert.deepEqual(
      [...chordRowKeys(C_MAJOR, 0)],
      [
        [36, "KeyA"],
        [38, "KeyS"],
        [40, "KeyD"],
        [41, "KeyF"],
        [43, "KeyG"],
        [45, "KeyH"],
        [47, "KeyJ"],
      ],
    );
  });
});
