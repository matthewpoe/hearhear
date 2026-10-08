import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createReadMarks } from "../../src/record/readMarks.js";

const read = [
  { id: "n1", midi: 60, start: 0, dur: 12 },
  { id: "n2", midi: 62, start: 12, dur: 6 },
];
const tune = { id: "u-1", notes: read };

describe("createReadMarks", () => {
  it("counts a tune with no read known as unedited", () => {
    assert.equal(createReadMarks().edited(tune), false);
  });

  it("sees a hand edit after a read, and Undo back to any read as clean", () => {
    const reads = createReadMarks();
    reads.mark(tune);
    assert.equal(reads.edited(tune), false);
    assert.equal(reads.edited({ ...tune, notes: [{ ...read[0], midi: 61 }, read[1]] }), true);
    assert.equal(reads.edited({ ...tune, notes: [{ ...read[0], dur: 6 }, read[1]] }), true);
    assert.equal(reads.edited({ ...tune, notes: [read[0]] }), true);
    assert.equal(reads.edited({ ...tune, notes: [{ ...read[0], lyric: "la" }, read[1]] }), true);
    // A re-read is a read too; the first one still counts after an Undo.
    const swung = { ...tune, notes: [read[0], { ...read[1], dur: 4 }] };
    reads.mark(swung);
    assert.equal(reads.edited(swung), false);
    assert.equal(reads.edited({ ...tune, notes: read.map((n) => ({ ...n })) }), false);
  });

  it("keeps each tune's reads apart", () => {
    const reads = createReadMarks();
    reads.mark(tune);
    assert.equal(reads.edited({ id: "u-2", notes: [] }), false);
    reads.mark({ id: "u-2", notes: [] });
    assert.equal(reads.edited({ id: "u-2", notes: read }), true);
  });
});
