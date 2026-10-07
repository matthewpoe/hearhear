import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
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

  /**
   * Tapped presses (80–150 ms) at onsets given in beats, with wobble.
   * @param {number[]} onsets
   * @param {number} beatMs
   */
  const tapAt = (onsets, beatMs) =>
    onsets.map((onset, i) => {
      const downMs = 1000 + onset * beatMs + WOBBLE_MS[i % WOBBLE_MS.length];
      return { downMs, upMs: downMs + 80 + ((i * 37) % 71) };
    });

  /**
   * Onsets for swung eighth pairs, long then short at `ratio`, one pair per beat.
   * @param {number} beats
   * @param {number} ratio long:short
   */
  const swungLine = (beats, ratio) =>
    Array.from({ length: beats }, (_, b) => [b, b + ratio / (ratio + 1)]).flat();

  it("writes a tapped swung eighth line (2:1) as straight eighths", () => {
    const beatMs = 60000 / 120;
    const onsets = swungLine(4, 2);
    const endMs = 1000 + 4 * beatMs;
    const { notes, beatMs: detected, swing } = guessRhythm(tapAt(onsets, beatMs), { endMs });
    assert.ok(Math.abs(detected - beatMs) < 25, `${detected} vs ${beatMs}`);
    assert.deepEqual(
      notes,
      Array.from({ length: 8 }, (_, i) => ({ start: i * 6, dur: 6 })),
    );
    assert.equal(swing, true);
  });

  it("hears swing at a slow tempo, where the long note is the most common gap", () => {
    // At 900 ms, the 600 ms long notes are the most common gap and a plausible beat.
    const onsets = [0, 1, 1 + 2 / 3, 2, 2 + 2 / 3, 3, 3 + 2 / 3, 4];
    for (const feel of /** @type {const} */ (["auto", "straight"])) {
      const { notes, beatMs, swing } = guessRhythm(tapAt(onsets, 900), {
        endMs: 1000 + 5 * 900,
        feel,
      });
      assert.ok(Math.abs(beatMs - 900) < 25, `${feel}: ${beatMs}`);
      assert.equal(swing, feel === "auto", feel);
      assert.deepEqual(
        notes.map((n) => n.dur),
        feel === "auto" ? [12, 6, 6, 6, 6, 6, 6, 12] : [12, 9, 3, 9, 3, 9, 3, 12],
        feel,
      );
    }
  });

  it("reads one swung take straight or swung, as the player says", () => {
    const beatMs = 600;
    // Quarter, then three 2:1 pairs, then a quarter.
    const onsets = [0, 1, 1 + 2 / 3, 2, 2 + 2 / 3, 3, 3 + 2 / 3, 4];
    const events = tapAt(onsets, beatMs);
    const endMs = 1000 + 5 * beatMs;

    const swung = guessRhythm(events, { endMs, feel: "swing" });
    assert.equal(swung.swing, true);
    assert.deepEqual(
      swung.notes.map((n) => n.dur),
      [12, 6, 6, 6, 6, 6, 6, 12],
    );

    const straight = guessRhythm(events, { endMs, feel: "straight" });
    assert.equal(straight.swing, false);
    assert.deepEqual(
      straight.notes.map((n) => n.dur),
      [12, 9, 3, 9, 3, 9, 3, 12],
    );
    assert.deepEqual(
      straight.notes.map((n) => n.start),
      [0, 12, 21, 24, 33, 36, 45, 48],
    );
    // The same tempo either way: the feel changes the values, not the beat.
    assert.equal(straight.beatMs, swung.beatMs);
  });

  it("evens dotted-looking pairs when the player says it swings", () => {
    const onsets = [0, 1.5, 2, 3.5, 4, 5.5, 6, 7, 8];
    const events = tapAt(onsets, 600);
    const endMs = 1000 + 9 * 600;
    // Left to the guess, these are dotted quarters and eighths, not swing.
    assert.equal(guessRhythm(events, { endMs }).swing, false);
    const swung = guessRhythm(events, { endMs, feel: "swing" });
    assert.equal(swung.swing, true);
    assert.deepEqual(
      swung.notes.slice(0, 6).map((n) => n.dur),
      Array(6).fill(6),
    );
  });

  it("a gentle 3:2 pair read straight is two eighths", () => {
    const onsets = [0, 1, 1.6, 2, 3];
    const { notes } = guessRhythm(tapAt(onsets, 600), { endMs: 1000 + 4 * 600, feel: "straight" });
    assert.deepEqual(
      notes.map((n) => n.dur),
      [12, 6, 6, 12, 12],
    );
  });

  it("reads swung pairs from 3:2 to 3:1 among quarter notes as straight eighths", () => {
    for (const ratio of [1.5, 2, 3]) {
      // Quarter, swung pair, quarter, swung pair, quarter, quarter.
      const onsets = [0, 1, 1 + ratio / (ratio + 1), 2, 3, 3 + ratio / (ratio + 1), 4, 5];
      const { notes, swing } = guessRhythm(tapAt(onsets, 600), { endMs: 1000 + 6 * 600 });
      assert.deepEqual(
        notes.map((n) => n.start),
        [0, 12, 18, 24, 36, 42, 48, 60],
        `${ratio}:1`,
      );
      assert.equal(swing, true, `${ratio}:1`);
    }
  });

  it("keeps dotted quarter and eighth figures dotted, even when they fill most of the take", () => {
    // Three dotted-quarter + eighth pairs (3:1, two beats each), then two quarters.
    const onsets = [0, 1.5, 2, 3.5, 4, 5.5, 6, 7, 8];
    const { notes, beatMs, swing } = guessRhythm(tapAt(onsets, 600), { endMs: 1000 + 9 * 600 });
    assert.equal(swing, false);
    assert.ok(Math.abs(beatMs - 600) < 25, `${beatMs}`);
    assert.deepEqual(
      notes.map((n) => n.start),
      onsets.map((t) => t * 12),
    );
  });

  it("leaves straight eighths and a dotted quarter alone, and calls them unswung", () => {
    const onsets = [0, 1, 1.5, 2, 3, 4.5, 5, 6];
    const { notes, swing } = guessRhythm(tapAt(onsets, 500), { endMs: 1000 + 7 * 500 });
    assert.deepEqual(
      notes.map((n) => n.start),
      onsets.map((t) => t * 12),
    );
    assert.equal(swing, false);
  });

  it("recovers St. James tapped straight at quarter = 76, reading its eighths as eighths", () => {
    // Mostly eighths: the most common gap implies about 152 BPM, so it's an eighth.
    const beatMs = 60000 / stJames.tempo;
    const first = stJames.notes[0].start;
    const onsets = stJames.notes.map((n) => (n.start - first) / 12);
    const last = stJames.notes.at(-1);
    const endMs = 1000 + ((last.start + last.dur - first) / 12) * beatMs;
    const { notes, beatMs: detected, swing } = guessRhythm(tapAt(onsets, beatMs), { endMs });
    assert.ok(Math.abs(60000 / detected - stJames.tempo) < 3, `${60000 / detected} BPM`);
    assert.deepEqual(
      notes,
      stJames.notes.map(({ start, dur }) => ({ start: start - first, dur })),
    );
    assert.equal(swing, false);
  });

  it("reads the beat in a plausible tempo: a very fast gap is an eighth, a very slow one a half", () => {
    // Quarters tapped every 300 ms (200 BPM) read as eighths at 100.
    const fast = guessRhythm(tapAt([0, 1, 2, 3], 300));
    assert.ok(Math.abs(60000 / fast.beatMs - 100) < 5, `${60000 / fast.beatMs}`);
    assert.deepEqual(
      fast.notes.slice(0, 3).map((n) => n.start),
      [0, 6, 12],
    );
    // Quarters every 1.6 s (37.5 BPM) read as half notes at 75.
    const slow = guessRhythm(tapAt([0, 1, 2, 3], 1600));
    assert.ok(Math.abs(60000 / slow.beatMs - 75) < 3, `${60000 / slow.beatMs}`);
    assert.deepEqual(
      slow.notes.slice(0, 3).map((n) => n.start),
      [0, 24, 48],
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
