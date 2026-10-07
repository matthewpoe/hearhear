import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptySong } from "../../src/store/song.js";
import { passageAround, voicingIn } from "../../src/chords/passage.js";
import { whereOf } from "../../src/chords/where.js";

const Q = 12; // ticks per quarter
const BAR = 4 * Q;

/** A 4/4 song with a one-beat pickup. */
function pickupSong() {
  const song = emptySong();
  song.meter = { beatsPerBar: 4, beatUnit: 4, pickupTicks: Q, provisional: false };
  song.notes = [
    { id: "p", midi: 67, start: 0, dur: Q }, // pickup, G4
    { id: "a", midi: 72, start: Q, dur: Q }, // bar 1 beat 1, C5
    { id: "b", midi: 64, start: Q + Q, dur: Q }, // bar 1 beat 2, E4
    // bar 1 beat 4, held two beats across the bar line into bar 2
    { id: "held", midi: 62, start: Q + 3 * Q, dur: 2 * Q },
    { id: "c", midi: 60, start: Q + BAR + Q, dur: Q }, // bar 2 beat 2, C4
  ];
  return song;
}

describe("passageAround", () => {
  it("returns null for a note that isn't in the song", () => {
    assert.equal(passageAround(pickupSong(), "nope"), null);
  });

  it("uses the pickup bar, 0 to pickupTicks, for a pickup note", () => {
    const passage = passageAround(pickupSong(), "p");
    assert.deepEqual(passage?.range, { fromTick: 0, toTick: Q });
    assert.equal(passage?.below, 67);
  });

  it("uses the whole bar for a note inside it", () => {
    const passage = passageAround(pickupSong(), "a");
    assert.deepEqual(passage?.range, { fromTick: Q, toTick: Q + BAR });
  });

  it("stretches the range to the end of a note held across the bar line", () => {
    const passage = passageAround(pickupSong(), "held");
    assert.deepEqual(passage?.range, { fromTick: Q, toTick: Q + 3 * Q + 2 * Q });
  });

  it("takes `below` from notes that start in the range, as the audio stream does", () => {
    // Bar 2 holds only "c" by onset; "held" sounds into it but starts in bar 1.
    const passage = passageAround(pickupSong(), "c");
    assert.deepEqual(passage?.range, { fromTick: Q + BAR, toTick: Q + 2 * BAR });
    assert.equal(passage?.below, 60);
    // Bar 1's lowest onset is the held D4.
    assert.equal(passageAround(pickupSong(), "a")?.below, 62);
  });

  it("voices the previous placed chord, and every candidate, under the passage", () => {
    const song = pickupSong();
    song.chords = [{ id: "c1", noteId: "a", root: "C", type: "M" }];
    const passage = passageAround(song, "b");
    assert.ok(passage?.previous);
    const voicing = voicingIn(passage, { root: "G", type: "M" });
    assert.ok(voicing.every((m) => m < passage.below));
    assert.equal(passageAround(song, "a")?.previous, null);
  });
});

describe("whereOf", () => {
  it("names the bar and beat, with bar 0 as the pickup", () => {
    const song = pickupSong();
    const byId = (/** @type {string} */ id) => song.notes.find((n) => n.id === id);
    assert.equal(whereOf(/** @type {any} */ (byId("p")), song.meter), "pickup, beat 4");
    assert.equal(whereOf(/** @type {any} */ (byId("c")), song.meter), "bar 2, beat 2");
  });
});
