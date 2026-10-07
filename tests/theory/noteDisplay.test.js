import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayNote, spokenNote } from "../../src/theory/noteDisplay.js";

describe("displayNote", () => {
  it("writes a note or key name's accidentals as music symbols", () => {
    assert.equal(displayNote("Db"), "D♭");
    assert.equal(displayNote("F#"), "F♯");
    assert.equal(displayNote("Eb major"), "E♭ major");
    assert.equal(displayNote("C# minor"), "C♯ minor");
    assert.equal(displayNote("F#m7"), "F♯m7");
    assert.equal(displayNote("Bbmaj7"), "B♭maj7");
    assert.equal(displayNote("F##"), "F𝄪");
    assert.equal(displayNote("Bbb"), "B𝄫");
    assert.equal(displayNote("E♭"), "E♭");
  });

  it("leaves naturals, numerals and Nashville numbers alone", () => {
    assert.equal(displayNote("D major"), "D major");
    assert.equal(displayNote("bVII"), "bVII");
    assert.equal(displayNote("bVII · Bb"), "bVII · B♭");
    assert.equal(displayNote("b7"), "b7");
    assert.equal(displayNote("Bm7b5"), "Bm7b5");
    assert.equal(displayNote("Ab"), "A♭");
  });

  it("changes only letters that stand alone", () => {
    assert.equal(displayNote("Chord 1: Ab major"), "Chord 1: A♭ major");
    assert.equal(displayNote("Cab"), "Cab");
  });
});

describe("spokenNote", () => {
  it("spells accidentals out for screen readers", () => {
    assert.equal(spokenNote("Db"), "D flat");
    assert.equal(spokenNote("F# minor"), "F sharp minor");
    assert.equal(spokenNote("F#m7"), "F sharp m7");
    assert.equal(spokenNote("Bbb"), "B double flat");
    assert.equal(spokenNote("D"), "D");
    assert.equal(spokenNote("bVII"), "bVII");
    assert.equal(spokenNote("E♭ major"), "E flat major");
    assert.equal(spokenNote(displayNote("F#m7")), "F sharp m7");
    assert.equal(spokenNote("F𝄪"), "F double sharp");
  });
});
