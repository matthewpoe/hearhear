import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import saints from "../../content/songs/when-the-saints.json" with { type: "json" };
import { HINT_COUNT, keyHints } from "../../src/steps/keyHints.js";
import { describePlacement, placedChord, startingNote } from "../../src/steps/chordFeedback.js";
import { positionOf } from "../../src/theory/index.js";

/** @type {import("../../src/types.js").Song} */
const song = /** @type {any} */ ({ ...ode, chords: [] });
const asDemo = { ...song, key: { tonic: "C", mode: "major", provisional: true } };

describe("keyHints", () => {
  it("gives nothing before a press, then one clue per press, up to HINT_COUNT", () => {
    assert.equal(keyHints(asDemo, 0).length, 0);
    assert.deepEqual(
      keyHints(asDemo, 1).map((h) => h.id),
      ["rest"],
    );
    assert.deepEqual(
      keyHints(asDemo, 5).map((h) => h.id),
      ["rest", "accidentals"],
    );
    assert.equal(HINT_COUNT, 2);
  });

  it("points at the last bar first", () => {
    const [rest] = keyHints(asDemo, 1);
    const last = song.notes.at(-1);
    assert.ok(last && rest.noteIds.includes(last.id));
    const bars = new Set(
      rest.noteIds.map(
        (id) => positionOf(song.notes.find((n) => n.id === id)?.start ?? 0, song.meter).bar,
      ),
    );
    assert.equal(bars.size, 1);
  });

  it("marks the notes written with sharps or flats, and never names a key", () => {
    const [, marked] = keyHints(asDemo, 2);
    // Ode to Joy in D, written on C: every F sharp is marked.
    const sharps = song.notes.filter((n) => n.midi % 12 === 6).map((n) => n.id);
    assert.deepEqual(marked.noteIds, sharps);
    for (const hint of keyHints(asDemo, 2)) assert.doesNotMatch(hint.text, /\b[A-G] (major|minor)/);
  });
});

describe("startingNote", () => {
  it("suggests bar 1's first note, past a pickup", () => {
    const tune = /** @type {any} */ ({ ...saints, chords: [] });
    const note = startingNote(tune);
    assert.ok(note);
    assert.deepEqual(positionOf(note.start, tune.meter), { bar: 1, beat: 1 });
  });

  it("moves on to the next downbeat without a chord", () => {
    const first = /** @type {any} */ (startingNote(song));
    const next = startingNote({
      ...song,
      chords: [{ id: "c1", noteId: first.id, root: "D", type: "M" }],
    });
    assert.ok(next);
    assert.equal(positionOf(next.start, song.meter).beat, 1);
    assert.ok(next.start > first.start);
  });
});

describe("placedChord", () => {
  const first = song.notes[0];
  const withChord = { ...song, chords: [{ id: "c1", noteId: first.id, root: "D", type: "M" }] };

  it("finds the one chord set", () => {
    assert.deepEqual(placedChord(song, withChord), {
      noteId: first.id,
      chord: { root: "D", type: "M" },
    });
  });

  it("ignores removals, loads and melody edits", () => {
    assert.equal(placedChord(withChord, song), null);
    assert.equal(placedChord(song, { ...withChord, id: "other" }), null);
    assert.equal(placedChord(song, { ...withChord, notes: [...song.notes] }), null);
  });
});

describe("describePlacement", () => {
  const first = song.notes[0]; // F sharp, the 3 of D

  it("names the note's place in the chord and what the chord does", () => {
    const said = describePlacement(song, first.id, { root: "D", type: "M" });
    assert.ok(said);
    assert.match(said.relation, /The melody note \(F♯\) is this chord's 3rd\./);
    assert.match(said.does, /^I: home/);
  });

  it("describes a dominant as tension, with no verdict", () => {
    const said = describePlacement(song, first.id, { root: "A", type: "M" });
    assert.ok(said);
    assert.match(said.does, /^V: tension that wants to come home/);
    assert.doesNotMatch(`${said.relation} ${said.does}`, /right|wrong|correct|✓|✗/i);
  });

  it("names the chord in the user's label style", () => {
    const A7 = { root: "A", type: "7" };
    assert.match(describePlacement(song, first.id, A7, "letters")?.does ?? "", /^A7: tension/);
    assert.match(describePlacement(song, first.id, A7, "nashville")?.does ?? "", /^5⁷: tension/);
    assert.match(describePlacement(song, first.id, A7, "roman+letters")?.does ?? "", /^V7 · A7: /);
    assert.match(describePlacement(song, first.id, A7)?.does ?? "", /^V7: tension/);
  });

  it("describes a rub without flagging it", () => {
    const said = describePlacement(song, first.id, { root: "F", type: "M" });
    assert.ok(said);
    assert.equal(said.kind, "rub");
    assert.match(said.relation, /rub/);
    assert.doesNotMatch(said.relation, /wrong|error|bad/i);
  });
});
