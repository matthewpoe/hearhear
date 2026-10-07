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

  it("reads a tapped note as its full gap, however short the press", () => {
    // Computer keys are tapped: held 0.4 beat, then silence until the next note.
    const { notes } = guessRhythm(play([0, 1, 2, 4], [0.4, 0.3, 0.2, 0.2], 500));
    assert.deepEqual(notes.slice(0, 3), [
      { start: 0, dur: 12 },
      { start: 12, dur: 12 },
      { start: 24, dur: 24 },
    ]);
  });

  it("leaves a rest only after a held note and a full beat of silence", () => {
    // Held a full beat, then a beat of silence before beat 3: a quarter and a rest.
    const { notes } = guessRhythm(play([0, 2, 3, 4], [1, 1, 1, 1], 500));
    assert.deepEqual(notes[0], { start: 0, dur: 12 });
    assert.equal(notes[1].start, 24);
  });

  it("keeps a held note's full gap when the silence after it is under a beat", () => {
    // Held 0.6 of a beat, then 0.4 of silence: was a rest before Matthew's rule.
    const { notes } = guessRhythm(play([0, 1, 2, 3], [0.6, 1, 1, 1], 500));
    assert.deepEqual(notes[0], { start: 0, dur: 12 });
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

  it("recovers Ode to Joy's exact rhythm tapped at its tempo, 80–150 ms per press", () => {
    const beatMs = 60000 / ode.tempo;
    const onsets = ode.notes.map((n) => n.start / 12);
    const events = onsets.map((onset, i) => {
      const downMs = 1000 + onset * beatMs + WOBBLE_MS[i % WOBBLE_MS.length];
      // Every press between 80 and 150 ms, spread across the range.
      return { downMs, upMs: downMs + 80 + ((i * 37) % 71) };
    });
    const holds = events.map((e) => e.upMs - e.downMs);
    assert.equal(Math.min(...holds), 80);
    assert.equal(Math.max(...holds), 150);
    const last = ode.notes.at(-1);
    // Stop is pressed when the last note's time is up.
    const endMs = 1000 + ((last.start + last.dur) / 12) * beatMs;
    const { notes, beatMs: detected, dropped } = guessRhythm(events, { endMs });
    assert.ok(Math.abs(detected - beatMs) < 20, `${detected} vs ${beatMs}`);
    assert.deepEqual(dropped, []);
    assert.deepEqual(
      notes,
      ode.notes.map(({ start, dur }) => ({ start, dur })),
    );
  });

  it("gives a tapped last note one beat when the take's end is unknown", () => {
    const { notes } = guessRhythm(play([0, 1, 2, 3], [0.2, 0.2, 0.2, 0.2], 500));
    assert.equal(notes[3].dur, 12);
  });

  it("hears two keys pressed together as one note, not an eighth", () => {
    for (const apartMs of [0, 15, 90]) {
      const events = play([0, 1, 2, 3], [1, 1, 1, 1], 500);
      const slip = { downMs: events[1].downMs - apartMs, upMs: events[1].downMs + 40 };
      const { notes, dropped } = guessRhythm([events[0], slip, ...events.slice(1)]);
      assert.deepEqual(dropped, [1], `${apartMs} ms apart`);
      assert.deepEqual(
        notes,
        [0, 12, 24, 36].map((start) => ({ start, dur: 12 })),
        `${apartMs} ms apart`,
      );
    }
  });

  it("keeps a real eighth note, which is not a slip", () => {
    const onsets = [0, 1, 1.5, 2, 3];
    const { notes, dropped } = guessRhythm(play(onsets, legato(onsets), 500));
    assert.deepEqual(dropped, []);
    assert.deepEqual(
      notes.map((n) => n.start),
      [0, 12, 18, 24, 36],
    );
  });

  it("treats a missing or invalid release as legato", () => {
    const events = /** @type {any[]} */ (play([0, 1, 2, 3], [0.4, 0.4, 0.4, 2], 500));
    events[0].upMs = undefined;
    events[1].upMs = Number.NaN;
    events[2].upMs = events[2].downMs - 100;
    delete events[3].upMs;
    const { notes } = guessRhythm(events);
    assert.deepEqual(
      notes,
      [0, 12, 24, 36].map((start) => ({ start, dur: 12 })),
    );
  });

  it("handles a single note and an empty take", () => {
    const one = guessRhythm([{ downMs: 0, upMs: 625 }]);
    assert.deepEqual(one.notes, [{ start: 0, dur: 12 }]);
    assert.ok(one.beatMs > 0);
    assert.deepEqual(guessRhythm([]).notes, []);
  });
});
