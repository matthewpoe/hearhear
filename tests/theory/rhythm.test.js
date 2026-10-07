import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { guessRhythm } from "../../src/theory/index.js";

const WOBBLE_MS = [0, 14, -11, 7, -16, 9, -5, 12];

/**
 * Key events for notes starting at `onsets` and held for `held` (both in
 * beats), with a little human wobble so no two gaps are exactly equal.
 * @param {number[]} onsets
 * @param {number[]} held
 * @param {number} beatMs
 */
function play(onsets, held, beatMs) {
  return onsets.map((onset, i) => {
    const downMs = 1000 + onset * beatMs + WOBBLE_MS[i % WOBBLE_MS.length];
    return { downMs, upMs: downMs + held[i] * beatMs - 20 };
  });
}

/** Legato: each note held until the next starts, the last for one beat. @param {number[]} onsets */
const legato = (onsets) => onsets.map((t, i) => (onsets[i + 1] ?? t + 1) - t);

describe("guessRhythm", () => {
  it("takes the most common gap as the beat", () => {
    const { notes, beatMs } = guessRhythm(play([0, 1, 2, 3], [1, 1, 1, 1], 500));
    assert.ok(Math.abs(beatMs - 500) < 20, `${beatMs}`);
    assert.deepEqual(
      notes,
      [0, 12, 24, 36].map((start) => ({ start, dur: 12 })),
    );
  });

  it("snaps other gaps to ½, 1½, 2, 3, and 4 beats", () => {
    const onsets = [0, 1, 2, 2.5, 3, 4.5, 5, 7, 8, 9, 12, 13, 17];
    const { notes } = guessRhythm(play(onsets, legato(onsets), 600));
    assert.deepEqual(
      notes.map((n) => n.start),
      onsets.map((t) => t * 12),
    );
  });

  it("caps a long gap at four beats", () => {
    const onsets = [0, 1, 2, 3, 10];
    const { notes } = guessRhythm(play(onsets, legato(onsets), 500));
    assert.equal(notes[4].start - notes[3].start, 48);
  });

  it("turns a pause over half a beat after a release into a rest", () => {
    // Staccato: the first note held under half a beat, then silence until beat 2.
    const { notes } = guessRhythm(play([0, 1, 2, 3], [0.4, 1, 1, 1], 500));
    assert.deepEqual(notes[0], { start: 0, dur: 6 });
    assert.equal(notes[1].start, 12);
  });

  it("keeps a short lift between legato notes as a full note", () => {
    const { notes } = guessRhythm(play([0, 1, 2, 3], [0.8, 0.8, 0.8, 1], 500));
    assert.deepEqual(
      notes.map((n) => n.dur),
      [12, 12, 12, 12],
    );
  });

  it("takes the last note's length from its release", () => {
    const { notes } = guessRhythm(play([0, 1, 2, 3], [1, 1, 1, 3], 500));
    assert.equal(notes[3].dur, 36);
  });

  it("recovers Ode to Joy's rhythm played at its tempo", () => {
    const beatMs = 60000 / ode.tempo;
    const events = play(
      ode.notes.map((n) => n.start / 12),
      ode.notes.map((n) => n.dur / 12),
      beatMs,
    );
    const { notes, beatMs: detected } = guessRhythm(events);
    assert.ok(Math.abs(detected - beatMs) < 20, `${detected} vs ${beatMs}`);
    assert.deepEqual(
      notes,
      ode.notes.map(({ start, dur }) => ({ start, dur })),
    );
  });

  it("handles a single note and an empty take", () => {
    const one = guessRhythm([{ downMs: 0, upMs: 625 }]);
    assert.deepEqual(one.notes, [{ start: 0, dur: 12 }]);
    assert.ok(one.beatMs > 0);
    assert.deepEqual(guessRhythm([]).notes, []);
  });
});
