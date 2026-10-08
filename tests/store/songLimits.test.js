import assert from "node:assert/strict";
import { describe, it } from "node:test";
import songSchema from "../../contracts/song.schema.json" with { type: "json" };
import * as limits from "../../src/store/songLimits.js";
import { emptySong } from "../../src/store/song.js";
import { tempoFor, takeNotes } from "../../src/record/take.js";
import { guessRhythm } from "../../src/theory/index.js";

const SONG = songSchema.properties;

describe("song limits", () => {
  it("are the song schema's own bounds", () => {
    assert.equal(limits.MAX_TITLE_CHARS, SONG.title.maxLength);
    assert.equal(limits.MIN_TEMPO, SONG.tempo.minimum);
    assert.equal(limits.MAX_TEMPO, SONG.tempo.maximum);
    assert.equal(limits.DEFAULT_TEMPO, SONG.tempo.default);
    assert.equal(limits.MAX_NOTES, SONG.notes.maxItems);
    assert.equal(limits.MAX_LYRIC_CHARS, songSchema.$defs.note.properties.lyric.maxLength);
    assert.equal(limits.MIN_MIDI, songSchema.$defs.note.properties.midi.minimum);
    assert.equal(limits.MAX_MIDI, songSchema.$defs.note.properties.midi.maximum);
    assert.equal(limits.MIN_SWING, SONG.swing.minimum);
    assert.equal(limits.MAX_SWING, SONG.swing.maximum);
  });

  it("share one default tempo: a new song, an empty take, and a lone note's beat", () => {
    assert.equal(emptySong().tempo, limits.DEFAULT_TEMPO);
    assert.equal(takeNotes([], 0).tempo, limits.DEFAULT_TEMPO);
    assert.equal(tempoFor(NaN), limits.DEFAULT_TEMPO);
    const { beatMs } = guessRhythm([{ downMs: 0, upMs: 100 }]);
    assert.equal(beatMs, 60000 / limits.DEFAULT_TEMPO);
  });

  it("count a title in characters, as the schema does", () => {
    const max = limits.MAX_TITLE_CHARS;
    const { isTitle } = limits;
    assert.equal(isTitle("🎹".repeat(max)), true, "an emoji is one character");
    assert.equal(isTitle("x".repeat(max + 1)), false);
    assert.equal(isTitle(""), false);
  });
});
