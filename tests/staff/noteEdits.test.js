// The note menu's pitch and length steps, and their limits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { LENGTH_STEP, movePitch, spokenLength, stepLength } from "../../src/staff/noteEdits.js";
import { MAX_MIDI, MIN_MIDI, createSongStore, emptySong } from "../../src/store/song.js";
import { MAX_NOTE_TICKS } from "../../src/store/songLimits.js";
import { TICKS_PER_QUARTER } from "../../src/theory/index.js";

test("a length step is an eighth", () => {
  assert.equal(LENGTH_STEP, TICKS_PER_QUARTER / 2);
  assert.equal(LENGTH_STEP, 6);
});

test("movePitch steps by half steps and octaves, inside A0 to C8", () => {
  assert.equal(movePitch(60, 1), 61);
  assert.equal(movePitch(60, -1), 59);
  assert.equal(movePitch(60, 12), 72);
  assert.equal(movePitch(60, -12), 48);
  assert.equal(movePitch(MAX_MIDI, 1), null);
  assert.equal(movePitch(MAX_MIDI - 11, 12), null);
  assert.equal(movePitch(MAX_MIDI - 12, 12), MAX_MIDI);
  assert.equal(movePitch(MIN_MIDI, -1), null);
  assert.equal(movePitch(MIN_MIDI + 11, -12), null);
});

test("stepLength goes by eighths, never under one nor past the longest note", () => {
  assert.equal(stepLength(12, 1), 18);
  assert.equal(stepLength(12, -1), 6);
  assert.equal(stepLength(6, -1), null);
  // A sixteenth can grow, but not shrink.
  assert.equal(stepLength(3, 1), 9);
  assert.equal(stepLength(3, -1), null);
  assert.equal(stepLength(9, -1), null);
  assert.equal(stepLength(MAX_NOTE_TICKS, 1), null);
  assert.equal(stepLength(MAX_NOTE_TICKS - LENGTH_STEP, 1), MAX_NOTE_TICKS);
});

test("deleting from the menu keeps the time: later notes stay put, the chord goes, one undo", () => {
  const store = createSongStore({
    ...emptySong(),
    notes: [
      { id: "n1", midi: 60, start: 0, dur: 12 },
      { id: "n2", midi: 62, start: 12, dur: 12 },
      { id: "n3", midi: 64, start: 24, dur: 12 },
    ],
    chords: [{ id: "c1", noteId: "n2", root: "G", type: "maj" }],
  });
  store.makeRest("n2");
  assert.deepEqual(
    store.get().notes.map((n) => [n.id, n.start]),
    [
      ["n1", 0],
      ["n3", 24],
    ],
  );
  assert.deepEqual(store.get().chords, []);
  store.undo();
  assert.equal(store.get().notes.length, 3);
  assert.equal(store.get().chords.length, 1);
});

test("a longer note ripples the notes after it", () => {
  const store = createSongStore({
    ...emptySong(),
    notes: [
      { id: "n1", midi: 60, start: 0, dur: 12 },
      { id: "n2", midi: 62, start: 12, dur: 12 },
    ],
  });
  store.setDuration("n1", /** @type {number} */ (stepLength(12, 1)));
  assert.deepEqual(
    store.get().notes.map((n) => [n.start, n.dur]),
    [
      [0, 18],
      [18, 12],
    ],
  );
});

test("spokenLength names note values, else counts quarter notes", () => {
  assert.equal(spokenLength(6), "an eighth note");
  assert.equal(spokenLength(18), "a dotted quarter note");
  assert.equal(spokenLength(30), "2.5 quarter notes");
  assert.equal(spokenLength(4), "0.33 quarter notes");
});
