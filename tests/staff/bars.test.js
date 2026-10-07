// Bars as the transport plays them: "Play bar 4" and "Play from bar 4".

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { barName, barPlace, songEnd } from "../../src/staff/bars.js";

const BAR = 48; // 4/4 at 12 ticks per quarter

/** @type {import("../../src/types.js").Song} */
const song = /** @type {any} */ (ode);

describe("barPlace", () => {
  it("finds bar 4 from any note in it, alone and to the end", () => {
    // Bar 4 of Ode to Joy: F# (dotted), E, E (held), the first phrase's end.
    for (const id of ["nd", "ne", "nf"]) {
      const place = barPlace(song, id);
      assert.ok(place);
      assert.equal(place.number, 4);
      assert.deepEqual(place.bar, { fromTick: 3 * BAR, toTick: 4 * BAR });
      assert.deepEqual(place.fromBar, { fromTick: 3 * BAR, toTick: songEnd(song) });
    }
  });

  it("numbers the first bar 1 when there is no pickup", () => {
    assert.equal(barPlace(song, "n1")?.number, 1);
    assert.deepEqual(barPlace(song, "n1")?.fromBar, { fromTick: 0, toTick: songEnd(song) });
  });

  it("calls a pickup bar 0 and plays just the pickup", () => {
    const withPickup = {
      ...song,
      meter: { ...song.meter, pickupTicks: 12 },
      notes: [
        { id: "p", midi: 57, start: 0, dur: 12 },
        { id: "a", midi: 62, start: 12, dur: 48 },
      ],
    };
    const place = barPlace(withPickup, "p");
    assert.equal(place?.number, 0);
    assert.deepEqual(place?.bar, { fromTick: 0, toTick: 12 });
    assert.equal(barPlace(withPickup, "a")?.number, 1);
    assert.equal(barName(0), "the pickup");
    assert.equal(barName(4), "bar 4");
  });

  it("stretches the bar to a note held over the bar line", () => {
    const tied = { ...song, notes: [{ id: "t", midi: 62, start: 36, dur: 24 }] };
    assert.deepEqual(barPlace(tied, "t")?.bar, { fromTick: 0, toTick: 60 });
  });

  it("is null with no note, or one no longer in the song", () => {
    assert.equal(barPlace(song, null), null);
    assert.equal(barPlace(song, "gone"), null);
  });
});
