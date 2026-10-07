import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptySong } from "../../src/store/song.js";
import { candidates, fit } from "../../src/theory/index.js";
import { chordOptions, degreeOf } from "../../src/chords/options.js";
import { HIDDEN_NAME, chordView } from "../../src/chords/chordView.js";

/** @param {{ root: string, type: string }} c */
const id = (c) => `${c.root}${c.type}`;

/** C major, one melody note on C4. */
function song() {
  const s = emptySong();
  s.key = { tonic: "C", mode: "major", provisional: false };
  s.notes = [{ id: "n1", midi: 60, start: 0, dur: 12 }];
  return s;
}

describe("chordOptions", () => {
  it("orders by fit, best first, keeping candidates() order among ties", () => {
    const s = song();
    const note = s.notes[0];
    const fits = candidates(s.key).map((chord, index) => ({
      chord,
      index,
      fit: fit(s, note.id, chord),
    }));
    // The fixture must contain a tie, or the stability half proves nothing.
    assert.ok(new Set(fits.map((f) => f.fit)).size < fits.length);
    const expected = [...fits].sort((a, b) => b.fit - a.fit || a.index - b.index);
    assert.deepEqual(
      chordOptions(s, note).map((o) => id(o.chord)),
      expected.map((f) => id(f.chord)),
    );
  });

  it("explains the melody note's role over each chord", () => {
    const s = song();
    const byChord = Object.fromEntries(chordOptions(s, s.notes[0]).map((o) => [id(o.chord), o]));
    assert.equal(byChord.CM.why, "Melody is the root");
    assert.equal(byChord.Am.why, "Melody is the 3rd");
    assert.equal(byChord.FM.why, "Melody is the 5th");
  });

  it("lists only chords the likely list doesn't already hold when extended", () => {
    const s = song();
    const likely = new Set(chordOptions(s, s.notes[0]).map((o) => id(o.chord)));
    const extended = chordOptions(s, s.notes[0], { extended: true });
    assert.ok(extended.length > 0);
    assert.ok(extended.every((o) => !likely.has(id(o.chord))));
    assert.equal(new Set(extended.map((o) => o.key)).size, extended.length);
  });

  it("maps diatonic options to their degree and chromatic ones to null", () => {
    const s = song();
    const all = [
      ...chordOptions(s, s.notes[0]),
      ...chordOptions(s, s.notes[0], { extended: true }),
    ];
    const degree = (/** @type {string} */ name) => degreeOf(all.find((o) => id(o.chord) === name));
    assert.equal(degree("GM"), 5);
    assert.equal(degree("Dm"), 2);
    assert.equal(degree("BbM"), null); // borrowed bVII
    assert.equal(degree("A7"), null); // V7/ii
  });
});

describe("chordView", () => {
  const key = { tonic: "C", mode: /** @type {const} */ ("major"), provisional: false };
  const g7 = { root: "G", type: /** @type {const} */ ("7") };
  const styles = /** @type {const} */ (["roman", "roman+letters", "nashville", "letters"]);

  it("shows nothing key-relative, not even letters, in hidden mode", () => {
    for (const style of styles) {
      assert.deepEqual(chordView(g7, key, "hidden", style), {
        mode: "hidden",
        text: "",
        sup: "",
        fn: null,
        color: null,
        name: HIDDEN_NAME,
      });
    }
  });

  for (const mode of /** @type {const} */ (["tentative", "confirmed"])) {
    it(`labels in every style, with function and color, when ${mode}`, () => {
      const view = (/** @type {(typeof styles)[number]} */ style) =>
        chordView(g7, key, mode, style);
      assert.deepEqual(
        styles.map((style) => [view(style).text, view(style).sup]),
        [
          ["V7", ""],
          ["V7 · G7", ""],
          ["5", "7"],
          ["G7", ""],
        ],
      );
      for (const style of styles) {
        assert.equal(view(style).mode, mode);
        assert.equal(view(style).fn, "dominant");
        assert.equal(view(style).color, "--fn-dominant");
      }
      assert.equal(view("nashville").name, "5 7, dominant, tension");
      assert.equal(view("roman").name, "V7, dominant, tension");
    });
  }

  it("keeps a Nashville major seventh inline", () => {
    const view = chordView({ root: "C", type: "maj7" }, key, "confirmed", "nashville");
    assert.equal(view.sup, "");
    assert.equal(view.fn, "tonic");
  });
});
