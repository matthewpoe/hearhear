// The accidental menu's pure parts: a letter and accidental to MIDI, which
// accidental a note has now, the range limits, and the "shows as" hint.

import { test } from "node:test";
import assert from "node:assert/strict";
import { accidentalChoices, letterToMidi, pretty } from "../../src/staff/accidentals.js";

const C_MAJOR = { tonic: "C", mode: /** @type {const} */ ("major"), provisional: false };
const E_MAJOR = { tonic: "E", mode: /** @type {const} */ ("major"), provisional: false };
const BB_MAJOR = { tonic: "Bb", mode: /** @type {const} */ ("major"), provisional: false };
const GB_MAJOR = { tonic: "Gb", mode: /** @type {const} */ ("major"), provisional: false };

/** @param {ReturnType<typeof accidentalChoices>} menu */
const byLabel = (menu) => Object.fromEntries(menu.choices.map((c) => [c.label, c]));

test("letterToMidi counts from the letter's own octave", () => {
  assert.equal(letterToMidi("C", 4, 0), 60);
  assert.equal(letterToMidi("D", 4, 1), 63);
  assert.equal(letterToMidi("D", 4, -2), 60);
  assert.equal(letterToMidi("F", 4, 2), 67);
  assert.equal(letterToMidi("C", 5, -1), 71); // Cb5 is B4
  assert.equal(letterToMidi("B", 3, 1), 60); // B#3 is C4
});

test("pretty writes theory's spellings with music symbols", () => {
  assert.equal(pretty("Eb4"), "E♭4");
  assert.equal(pretty("F##"), "F𝄪");
  assert.equal(pretty("Bbb3"), "B𝄫3");
  assert.equal(pretty("C4"), "C4");
});

test("the menu offers the note's letter with every accidental, current marked", () => {
  const menu = accidentalChoices(62, C_MAJOR); // D4
  assert.equal(menu.letter, "D");
  assert.deepEqual(
    menu.choices.map((c) => c.label),
    ["D♯", "D♭", "D♮", "D𝄪", "D𝄫"],
  );
  assert.deepEqual(
    menu.choices.map((c) => c.midi),
    [63, 61, 62, 64, 60],
  );
  assert.deepEqual(
    menu.choices.filter((c) => c.current).map((c) => c.label),
    ["D♮"],
  );
});

test("the current accidental follows the key's spelling", () => {
  // 63 is Eb in C major, D# in E major.
  assert.equal(accidentalChoices(63, C_MAJOR).choices.find((c) => c.current)?.label, "E♭");
  assert.equal(accidentalChoices(63, E_MAJOR).choices.find((c) => c.current)?.label, "D♯");
  // Cb in Gb major sits in the octave above its MIDI octave.
  const cb = accidentalChoices(71, GB_MAJOR);
  assert.equal(cb.octave, 5);
  assert.equal(byLabel(cb)["C♭"].current, true);
  assert.equal(byLabel(cb)["C♮"].midi, 72);
});

test("a choice the key spells differently says how it will show", () => {
  const menu = byLabel(accidentalChoices(62, BB_MAJOR)); // D4 in Bb major
  assert.equal(menu["D♯"].shownAs, "E♭");
  assert.equal(menu["D♭"].shownAs, null);
  assert.equal(menu["D♮"].shownAs, null);
  assert.equal(menu["D𝄪"].shownAs, "E");
  assert.equal(byLabel(accidentalChoices(62, E_MAJOR))["D♯"].shownAs, null);
});

test("choices off the piano are marked, not offered as pitches", () => {
  const low = byLabel(accidentalChoices(21, C_MAJOR)); // A0
  assert.equal(low["A♭"].onPiano, false);
  assert.equal(low["A𝄫"].onPiano, false);
  assert.equal(low["A♯"].onPiano, true);
  const high = byLabel(accidentalChoices(108, C_MAJOR)); // C8
  assert.equal(high["C♯"].onPiano, false);
  assert.equal(high["C♭"].onPiano, true);
});
