// The theory core keeps its own tables of chord types (how each is written as
// a numeral, and which letter-name suffixes name it). Each must cover exactly
// the chord types contracts/song.schema.json allows: no more, no fewer.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import songSchema from "../../contracts/song.schema.json" with { type: "json" };
import { SUFFIX_TYPES } from "../../src/theory/letters.js";
import { NUMERAL_FORMS } from "../../src/theory/numerals.js";

const schemaTypes = [...songSchema.$defs.chord.properties.type.enum].sort();

describe("chord types match the song schema", () => {
  it("numerals.js writes every schema chord type, once, and no others", () => {
    const types = NUMERAL_FORMS.map((form) => form.type);
    assert.equal(new Set(types).size, types.length, "a chord type is listed twice");
    assert.deepEqual([...types].sort(), schemaTypes);
  });

  it("letters.js reads a suffix for every schema chord type, and no others", () => {
    assert.deepEqual([...new Set(Object.values(SUFFIX_TYPES))].sort(), schemaTypes);
  });
});
