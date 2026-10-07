import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditionChordCues,
  chordCues,
  clickCues,
  melodyCues,
  placeChords,
  withCandidate,
} from "../../src/audio/passage.js";
import { passageBelow, voice } from "../../src/theory/index.js";

/** @typedef {import("../../src/types.js").Song} Song */

/** @param {Partial<import("../../src/types.js").Meter>} [overrides] */
const meter = (overrides) => ({
  beatsPerBar: 4,
  beatUnit: /** @type {4 | 8} */ (4),
  pickupTicks: 0,
  provisional: false,
  ...overrides,
});

/**
 * Two 4/4 bars of quarter notes, E4 D4 C4 D4 | E4 E4 E4 G3, with C at n0, G at
 * n2, F at n4, and C at n6 (tick 72).
 * @returns {Song}
 */
function tune() {
  const midis = [64, 62, 60, 62, 64, 64, 64, 55];
  const notes = midis.map((midi, i) => ({ id: `n${i}`, midi, start: i * 12, dur: 12 }));
  const chord = (id, root, noteId) => ({ id, root, type: "maj", noteId });
  return /** @type {Song} */ ({
    schemaVersion: 1,
    id: "test",
    title: "Test",
    key: { tonic: "C", mode: "major", provisional: false },
    meter: meter(),
    tempo: 100,
    notes,
    chords: [
      chord("c0", "C", "n0"),
      chord("c1", "G", "n2"),
      chord("c2", "F", "n4"),
      chord("c3", "C", "n6"),
    ],
  });
}

const songPlacements = (/** @type {Song} */ s) =>
  placeChords(
    s,
    s.chords.map((chord) => ({ chord })),
  );
const ticksOf = (/** @type {{ tick: number }[]} */ cues) => cues.map((c) => c.tick);

describe("clickCues", () => {
  it("accents the first downbeat after a one-beat pickup, not tick 0", () => {
    const cues = clickCues(meter({ pickupTicks: 12 }), { fromTick: 0, toTick: 72 });
    assert.deepEqual(ticksOf(cues), [0, 12, 24, 36, 48, 60]);
    assert.deepEqual(
      cues.filter((c) => c.kind === "click" && c.accent).map((c) => c.tick),
      [12, 60],
    );
  });

  it("clicks each dotted quarter in 6/8 and accents each bar's first", () => {
    const cues = clickCues(meter({ beatsPerBar: 6, beatUnit: 8 }), { fromTick: 0, toTick: 72 });
    assert.deepEqual(ticksOf(cues), [0, 18, 36, 54]);
    assert.deepEqual(
      cues.filter((c) => c.kind === "click" && c.accent).map((c) => c.tick),
      [0, 36],
    );
  });

  it("clicks after an eighth pickup in 6/8 on the dotted quarters of the bar", () => {
    const cues = clickCues(meter({ beatsPerBar: 6, beatUnit: 8, pickupTicks: 6 }), {
      fromTick: 0,
      toTick: 78,
    });
    assert.deepEqual(ticksOf(cues), [6, 24, 42, 60]);
  });
});

describe("melodyCues", () => {
  it("brings in a note held into the range, clipped to it", () => {
    const s = tune();
    s.notes[1] = { ...s.notes[1], dur: 36 }; // n1 at 12 holds to 48, over n2 and n3
    s.notes.splice(2, 2);
    const cues = melodyCues(s, { fromTick: 24, toTick: 60 });
    assert.deepEqual(
      cues.map((c) => [c.kind === "note" && c.noteId, c.tick, c.dur]),
      [
        ["n1", 24, 24],
        ["n4", 48, 12],
      ],
    );
  });
});

describe("chordCues", () => {
  it("brings in the chord already sounding at fromTick", () => {
    const s = tune();
    const range = { fromTick: 12, toTick: 48 };
    const cues = chordCues(songPlacements(s), range, passageBelow(s, range));
    assert.deepEqual(
      cues.map((c) => [c.kind === "chord" && c.chordId, c.tick, c.dur]),
      [
        ["c0", 12, 12],
        ["c1", 24, 24],
      ],
    );
  });

  it("voices every chord under passageBelow's register", () => {
    const s = tune();
    const range = { fromTick: 48, toTick: 96 };
    const below = passageBelow(s, range);
    assert.equal(below, 55); // G3, the lowest note starting in bar 2
    const cues = chordCues(songPlacements(s), range, below);
    for (const cue of cues) assert.ok(Math.max(...cue.tones) < 55, `${cue.tones} under G3`);
  });

  it("uses middle C as the register when no note starts in the range", () => {
    const s = tune();
    s.notes[0] = { ...s.notes[0], dur: 48 };
    s.notes.splice(1, 3);
    assert.equal(passageBelow(s, { fromTick: 12, toTick: 48 }), 60);
  });
});

describe("withCandidate", () => {
  it("replaces the chord at atTick", () => {
    const placed = withCandidate(songPlacements(tune()), [50, 53, 57], 24);
    assert.deepEqual(ticksOf(placed), [0, 24, 48, 72]);
    assert.deepEqual(placed[1], { tick: 24, voicing: [50, 53, 57] });
  });

  it("adds the candidate when no chord sits at atTick", () => {
    const placed = withCandidate(songPlacements(tune()), [50, 53, 57], 36);
    assert.deepEqual(ticksOf(placed), [0, 24, 36, 48, 72]);
  });
});

describe("auditionChordCues", () => {
  const range = { fromTick: 0, toTick: 96 };
  const DM = [50, 53, 57];
  const AM = [45, 48, 52];

  it("as-song: every other chord sounds exactly as playback voices it", () => {
    const s = tune();
    const below = passageBelow(s, range);
    const playback = chordCues(songPlacements(s), range, below);
    for (const candidate of [DM, AM]) {
      const cues = auditionChordCues(songPlacements(s), candidate, range, { atTick: 24 }, below);
      assert.deepEqual(cues[1].tones, candidate);
      assert.equal(cues[1].kind === "chord" && cues[1].chordId, undefined);
      assert.deepEqual(
        cues.filter((_, i) => i !== 1),
        playback.filter((_, i) => i !== 1),
      );
    }
  });

  it("as-song is the default", () => {
    const s = tune();
    const below = passageBelow(s, range);
    assert.deepEqual(
      auditionChordCues(songPlacements(s), DM, range, { atTick: 24 }, below),
      auditionChordCues(songPlacements(s), DM, range, { atTick: 24, neighbors: "as-song" }, below),
    );
  });

  it("as-song: a candidate between chords cuts the one before short", () => {
    const s = tune();
    const below = passageBelow(s, range);
    const cues = auditionChordCues(songPlacements(s), DM, range, { atTick: 36 }, below);
    assert.deepEqual(
      cues.map((c) => [c.tick, c.dur]),
      [
        [0, 24],
        [24, 12],
        [36, 12],
        [48, 24],
        [72, 24],
      ],
    );
  });

  it("from-candidate: the chord after voice-leads from the candidate", () => {
    const s = tune();
    const below = passageBelow(s, range);
    const cues = auditionChordCues(
      songPlacements(s),
      AM,
      range,
      { atTick: 24, neighbors: "from-candidate" },
      below,
    );
    assert.deepEqual(cues[1].tones, AM);
    assert.deepEqual(cues[2].tones, voice(s.chords[2], AM, { below }));
  });

  it("plays the song's chords when the candidate falls outside the range", () => {
    const s = tune();
    const inner = { fromTick: 0, toTick: 48 };
    const below = passageBelow(s, inner);
    assert.deepEqual(
      auditionChordCues(songPlacements(s), DM, inner, { atTick: 60 }, below),
      chordCues(songPlacements(s), inner, below),
    );
  });
});
