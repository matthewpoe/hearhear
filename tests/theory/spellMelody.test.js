import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { melodyDegree, spell, spellMelody } from "../../src/theory/index.js";

const G = { tonic: "G", mode: /** @type {const} */ ("major"), provisional: false };
const C = { tonic: "C", mode: /** @type {const} */ ("major"), provisional: false };
const E_MINOR = { tonic: "E", mode: /** @type {const} */ ("minor"), provisional: false };
/** @param {number[]} midis */
const melody = (midis) => midis.map((midi) => ({ midi }));

describe("spellMelody", () => {
  it("spells diatonic notes as spell does", () => {
    const notes = melody([67, 69, 71, 72, 74]);
    assert.deepEqual(
      spellMelody(notes, G),
      notes.map((n) => spell(n.midi, G)),
    );
  });

  it("names a chromatic note that rises a half step as a sharp", () => {
    // In C, spell alone writes 68 as Ab; rising to A it is G#.
    assert.equal(spell(68, C), "Ab4");
    assert.deepEqual(spellMelody(melody([67, 68, 69]), C), ["G4", "G#4", "A4"]);
  });

  it("names a chromatic note that falls a half step as a flat", () => {
    assert.deepEqual(spellMelody(melody([69, 68, 67]), C), ["A4", "Ab4", "G4"]);
  });

  it("writes the G sharp of an E7 bar in G major among E, F sharp and B", () => {
    // Sweet Georgia Brown, bar 1 and 2: E F# G# E | B G# C# B.
    assert.deepEqual(spellMelody(melody([64, 66, 68, 64, 71, 68, 73, 71]), G), [
      "E4",
      "F#4",
      "G#4",
      "E4",
      "B4",
      "G#4",
      "C#5",
      "B4",
    ]);
  });

  it("spells a chromatic run consistently, not one note at a time", () => {
    // E F# G# in C: a first pass alone would write Gb before G#.
    assert.deepEqual(spellMelody(melody([64, 66, 68, 64]), C), ["E4", "F#4", "G#4", "E4"]);
  });

  it("keeps spell's name on a tie", () => {
    // Bb between two Cs: Bb and A# make no augmented or diminished step.
    assert.deepEqual(spellMelody(melody([72, 70, 72]), C), ["C5", "Bb4", "C5"]);
  });

  it("doesn't count a tritone against a name", () => {
    // F# then C: both F# to C (d5) and Gb to C (A4) are tritones; keep F#.
    assert.deepEqual(spellMelody(melody([66, 72]), C), ["F#4", "C5"]);
  });

  it("keeps minor's leading tone and raised sixth as sharps", () => {
    // Greensleeves, bar 7: D# C# D# E in E minor.
    assert.deepEqual(spellMelody(melody([63, 61, 63, 64]), E_MINOR), ["D#4", "C#4", "D#4", "E4"]);
  });
});

describe("melodyDegree", () => {
  it("reads a context-chosen sharp by its letter", () => {
    assert.deepEqual(melodyDegree(68, "G#4", G), { degree: 1, accidental: 1, octave: 0 });
  });

  it("matches midiToDegree when the spelling is spell's", () => {
    assert.deepEqual(melodyDegree(68, "Ab4", G), { degree: 2, accidental: -1, octave: 0 });
  });
});
