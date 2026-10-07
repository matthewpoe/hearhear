import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import {
  analyzeNoteOverChord,
  candidates,
  chordFromNumeral,
  chordTones,
  fit,
  numeralOf,
} from "../../src/theory/index.js";

/** @type {any} */
const odeSong = ode;
/** @type {any} */
const stJamesSong = stJames;
const D_MAJOR = odeSong.key;
const E_MINOR = stJamesSong.key;

/** @param {string} numeral @param {any} key */
const chord = (numeral, key) => /** @type {any} */ (chordFromNumeral(numeral, key));

/** The dropdown's numerals for a note, best fit first. @param {any} song @param {string} noteId */
const ranked = (song, noteId) =>
  candidates(song.key)
    .map((c) => ({ numeral: numeralOf(c, song.key), score: fit(song, noteId, c) }))
    .sort((a, b) => b.score - a.score);

describe("chordTones", () => {
  it("lists pitch classes root first", () => {
    assert.deepEqual(chordTones({ root: "A", type: "7" }), ["A", "C#", "E", "G"]);
    assert.deepEqual(chordTones({ root: "D#", type: "dim7" }), ["D#", "F#", "A", "C"]);
  });
});

describe("analyzeNoteOverChord", () => {
  const C = { root: "C", type: "M" };

  it("names chord tones by role and interval", () => {
    assert.deepEqual(analyzeNoteOverChord(60, C), { role: "root", interval: "1P" });
    assert.deepEqual(analyzeNoteOverChord(64, C), { role: "third", interval: "3M" });
    assert.deepEqual(analyzeNoteOverChord(79, C), { role: "fifth", interval: "5P" });
    assert.deepEqual(analyzeNoteOverChord(70, { root: "C", type: "7" }), {
      role: "seventh",
      interval: "7m",
    });
    assert.deepEqual(analyzeNoteOverChord(66, { root: "C", type: "dim" }), {
      role: "fifth",
      interval: "5d",
    });
    assert.equal(analyzeNoteOverChord(65, { root: "C", type: "sus4" }).role, "third");
    assert.equal(analyzeNoteOverChord(69, { root: "C", type: "6" }).role, "seventh");
  });

  it("calls a note a semitone above a chord tone a clash", () => {
    assert.equal(analyzeNoteOverChord(65, C).role, "clash", "4th over the major 3rd");
    assert.equal(analyzeNoteOverChord(61, C).role, "clash", "b9 over the root");
    assert.equal(analyzeNoteOverChord(68, C).role, "clash", "b6 over the 5th");
    assert.equal(analyzeNoteOverChord(64, { root: "C", type: "m" }).role, "clash");
    assert.equal(analyzeNoteOverChord(71, { root: "C", type: "7" }).role, "clash");
  });

  it("calls other non-chord tones tensions, including blue notes", () => {
    for (const midi of [62, 69, 71, 66]) {
      assert.equal(analyzeNoteOverChord(midi, C).role, "tension", `${midi} over C`);
    }
    assert.equal(analyzeNoteOverChord(63, C).role, "tension", "blue b3 over a major chord");
    assert.equal(analyzeNoteOverChord(66, { root: "C", type: "m" }).role, "tension", "blue b5");
  });

  it("lets a dominant seventh carry its altered b9 and b13", () => {
    const G7 = { root: "G", type: "7" };
    assert.equal(analyzeNoteOverChord(68, G7).role, "tension");
    assert.equal(analyzeNoteOverChord(63, G7).role, "tension");
    assert.equal(analyzeNoteOverChord(72, G7).role, "clash", "the 4th still clashes");
  });

  it("calls a compound chord tone outside the schema's types a tension", () => {
    // Tonal knows C9; its 9th has no role of its own, and fit must stay a number.
    assert.deepEqual(analyzeNoteOverChord(62, { root: "C", type: "9" }), {
      role: "tension",
      interval: "9M",
    });
    assert.ok(Number.isFinite(fit(odeSong, odeSong.notes[0].id, { root: "E", type: "9" })));
  });

  it("explains Ode's held E in bar 4 under V and IV", () => {
    assert.deepEqual(analyzeNoteOverChord(64, chord("V", D_MAJOR)), {
      role: "fifth",
      interval: "5P",
    });
    assert.equal(analyzeNoteOverChord(64, chord("IV", D_MAJOR)).role, "tension");
  });
});

describe("candidates", () => {
  const numerals = (/** @type {any} */ key, extended = false) =>
    candidates(key, { extended }).map((c) => numeralOf(c, key));

  it("offers the PRD's likely suspects for each mode", () => {
    assert.deepEqual(numerals(D_MAJOR), ["I", "IV", "V", "vi", "ii", "iii"]);
    assert.deepEqual(numerals(E_MINOR), ["i", "iv", "V", "III", "VI"]);
    assert.deepEqual(
      candidates(E_MINOR).map((c) => c.root),
      ["E", "A", "B", "G", "C"],
    );
  });

  it("extends with secondary dominants, borrowed chords, and passing diminished chords", () => {
    assert.deepEqual(numerals(D_MAJOR, true).slice(6), [
      ...["V7/ii", "V7/iii", "V7/IV", "V7/V", "V7/vi"],
      ...["iv", "bIII", "bVI", "bVII"],
      ...["#i°7", "#ii°7", "#iv°7", "#v°7"],
    ]);
    assert.deepEqual(numerals(E_MINOR, true).slice(5), [
      ...["V7/iv", "V7/V", "V7/VI"],
      ...["I", "IV"],
      ...["#iv°7", "#vii°7"],
    ]);
  });
});

describe("fit", () => {
  it("ranks V above IV under the held E in Ode's bar 4", () => {
    const held = "nf";
    assert.ok(fit(odeSong, held, chord("V", D_MAJOR)) > fit(odeSong, held, chord("IV", D_MAJOR)));
  });

  it("puts I first under Ode's opening bar, where the melody outlines the tonic", () => {
    // iii ties on the notes alone (F# and A are its root and third); the dropdown's
    // stable sort keeps the more common chord ahead.
    const order = ranked(odeSong, "n1");
    assert.equal(order[0].numeral, "I");
    for (const numeral of ["IV", "V", "vi", "ii"]) {
      assert.ok(
        order[0].score > /** @type {any} */ (order.find((r) => r.numeral === numeral)).score,
      );
    }
  });

  it("weights long and strong notes over passing ones", () => {
    // Bar 4: F# for a beat and a half on the downbeat, a passing E, then E held for two beats.
    const order = ranked(odeSong, "nd").map((r) => r.numeral);
    assert.ok(order.indexOf("I") < order.indexOf("IV"));
    assert.ok(order.indexOf("V") < order.indexOf("IV"));
  });

  it("stops the span at the next placed chord", () => {
    const withV = { ...odeSong, chords: [{ id: "c1", noteId: "nf", root: "A", type: "M" }] };
    // With V placed on the held E, I on bar 4's downbeat no longer has to sit under that E.
    const I = chord("I", D_MAJOR);
    assert.ok(fit(withV, "nd", I) > fit(odeSong, "nd", I));
  });

  it("hears St. James's long B as home or dominant, not iv", () => {
    const order = ranked(stJamesSong, "ne").map((r) => r.numeral);
    assert.ok(order.indexOf("iv") > order.indexOf("i"));
    assert.ok(order.indexOf("iv") > order.indexOf("V"));
  });

  it("is 0 for a note that isn't in the song, and stays within 0..1", () => {
    assert.equal(fit(odeSong, "missing", chord("I", D_MAJOR)), 0);
    for (const note of odeSong.notes) {
      for (const c of candidates(D_MAJOR, { extended: true })) {
        const score = fit(odeSong, note.id, c);
        assert.ok(score >= 0 && score <= 1);
      }
    }
  });
});
