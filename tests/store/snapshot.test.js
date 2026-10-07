import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import requestSchema from "../../contracts/tutor-request.schema.json" with { type: "json" };
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { toTutorSnapshot } from "../../src/store/snapshot.js";

/** @type {any} */
const song = { ...ode, chords: [{ id: "c1", noteId: "n1e", root: "D", type: "M" }] };

describe("toTutorSnapshot", () => {
  const snap = toTutorSnapshot(song, { labelStyle: "nashville" });

  it("is deterministic", () => {
    assert.deepEqual(toTutorSnapshot(song, { labelStyle: "nashville" }), snap);
  });

  it("never sends MIDI numbers", () => {
    assert.doesNotMatch(JSON.stringify(snap), /"midi"/);
  });

  it("lays out bars with spelled pitches and degrees", () => {
    assert.equal(snap.bars.length, 8);
    assert.deepEqual(snap.bars[0].notes[0], { beat: 1, pitch: "F#4", degree: "3", beats: 1 });
    assert.deepEqual(
      snap.bars[3].notes.map((n) => [n.beat, n.beats]),
      [
        [1, 1.5],
        [2.5, 0.5],
        [3, 2],
      ],
    );
  });

  it("puts chords at their note's position with every label style", () => {
    assert.deepEqual(snap.bars[7].chords, [{ beat: 3, numeral: "I", nashville: "1", letter: "D" }]);
  });

  it("uses the wire format's snake_case meter", () => {
    assert.deepEqual(snap.meter, {
      beats_per_bar: 4,
      beat_unit: 4,
      pickup_beats: 0,
      provisional: false,
    });
    assert.equal(snap.label_style, "nashville");
  });

  it("sends key_hidden, false unless the view says the key is hidden", () => {
    assert.equal(snap.key_hidden, false);
    const hidden = toTutorSnapshot(song, { labelStyle: "nashville", keyHidden: true });
    assert.equal(hidden.key_hidden, true);
    assert.deepEqual({ ...hidden, key_hidden: false }, snap, "nothing else changes");
  });

  it("sends the song's title for context, bounded, and leaves out a blank one", () => {
    assert.equal(snap.title, "Ode to Joy");
    const long = toTutorSnapshot(
      { ...song, title: `  ${"x".repeat(200)}  ` },
      {
        labelStyle: "nashville",
      },
    );
    assert.equal(long.title, "x".repeat(120));
    const blank = toTutorSnapshot({ ...song, title: "   " }, { labelStyle: "nashville" });
    assert.equal("title" in blank, false);
  });

  it("validates against the request contract generated from the Pydantic models", () => {
    const validate = new Ajv2020({ strict: false }).compile(requestSchema);
    for (const s of [
      snap,
      toTutorSnapshot(song, { labelStyle: "nashville", keyHidden: true }),
      toTutorSnapshot(/** @type {any} */ (stJames), { labelStyle: "roman" }),
      toTutorSnapshot({ ...song, title: "x".repeat(500) }, { labelStyle: "roman" }),
    ]) {
      assert.ok(validate({ snapshot: s, hint_level: "nudge" }), JSON.stringify(validate.errors));
    }
  });

  it("puts a pickup in bar 0 at the end of the bar", () => {
    const sj = toTutorSnapshot(/** @type {any} */ (stJames), { labelStyle: "roman" });
    assert.equal(sj.bars[0].bar, 0);
    assert.deepEqual(sj.bars[0].notes, [{ beat: 4, pitch: "B4", degree: "5", beats: 1 }]);
    assert.equal(sj.meter.pickup_beats, 1);
  });
});
