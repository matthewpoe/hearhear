import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

describe("applied dominants in the main list", () => {
  /**
   * One 4/4 bar in a key: the given melody pitches as quarter notes, with any
   * chords already placed (a placed chord ends the span before it).
   * @param {string} tonic
   * @param {"major" | "minor"} mode
   * @param {number[]} pitches
   * @param {{ noteId: string, root: string, type: string }[]} [chords]
   */
  function bar(tonic, mode, pitches, chords = []) {
    const s = emptySong();
    s.key = { tonic, mode, provisional: false };
    s.notes = pitches.map((midi, i) => ({ id: `n${i + 1}`, midi, start: i * 12, dur: 12 }));
    s.chords = /** @type {any} */ (chords);
    return s;
  }
  /** @param {ReturnType<typeof bar>} s @param {number} i */
  const main = (s, i) => chordOptions(s, s.notes[i]);
  /** @param {import("../../src/chords/options.js").ChordOption[]} options */
  const labels = (options) => options.map((o) => `${id(o.chord)} ${o.numeral}`);

  it("offers E7 as V7/ii under a G# in G major, ahead of the tension chords", () => {
    // Sweet Georgia Brown's opening shape: a held G# on the downbeat.
    const s = bar("G", "major", [68, 68, 68, 68]);
    const options = main(s, 0);
    assert.deepEqual(labels(options.slice(0, 1)), ["E7 V7/ii"]);
    assert.equal(options[0].why, "Melody is the 3rd");
    // Sevenths only: the E triad (which would read "VI") is not offered.
    assert.deepEqual(labels(options.filter((o) => o.applied)), ["E7 V7/ii"]);
    // The six likely chords are all still there, after it.
    assert.deepEqual(
      new Set(options.slice(1).map((o) => id(o.chord))),
      new Set(candidates(s.key).map(id)),
    );
  });

  it("offers A7 as V7/V under a C# leading to D in G major", () => {
    const s = bar("G", "major", [73, 73, 73, 74], [{ noteId: "n4", root: "D", type: "M" }]);
    // C# is A7's 3rd and F#7's 5th; both fit the lone C# fully, and the 3rd wins the tie.
    assert.deepEqual(labels(main(s, 0).slice(0, 2)), ["A7 V7/V", "F#7 V7/iii"]);
  });

  it("labels and colors an applied option with the existing theory functions", () => {
    const key = { tonic: "G", mode: /** @type {const} */ ("major"), provisional: false };
    const e7 = main(bar("G", "major", [68]), 0)[0];
    assert.equal(e7.numeral, "V7/ii");
    assert.equal(chordView(e7.chord, key, "confirmed", "roman").fn, "dominant");
    assert.equal(chordView(e7.chord, key, "confirmed", "nashville").text, "6");
    assert.equal(chordView(e7.chord, key, "confirmed", "letters").text, "E7");
  });

  it("adds at most two, keeps them out of the extended list, and gives them no number key", () => {
    const s = bar("G", "major", [73]);
    const likely = chordOptions(s, s.notes[0]);
    const extended = chordOptions(s, s.notes[0], { extended: true });
    const applied = likely.filter((o) => o.applied);
    assert.ok(applied.length > 0 && applied.length <= 2);
    const shown = new Set(likely.map((o) => o.key));
    assert.ok(extended.every((o) => !shown.has(o.key)));
    assert.ok(applied.every((o) => degreeOf(o) === null));
  });

  it("offers V7/V for #4 in minor, and nothing for minor's raised 6th and 7th", () => {
    // E minor: A# (#4) is F#7's 3rd; C# and D# belong to melodic and harmonic minor.
    assert.deepEqual(labels(main(bar("E", "minor", [70]), 0).slice(0, 1)), ["F#7 V7/V"]);
    for (const midi of [73, 75]) {
      assert.ok(main(bar("E", "minor", [midi]), 0).every((o) => !o.applied));
    }
  });

  it("leaves every main list in Ode to Joy, St. James, Amazing Grace and Greensleeves unchanged", () => {
    // Snapshot taken from main's dropdown before applied dominants existed.
    // To regenerate (only when a diatonic list is meant to change): for each
    // song id in the file, load content/songs/<id>.json and map every note id to
    // chordOptions(song, note) as `${key} ${numeral} ${fit.toFixed(4)}`,
    // joined with ", ", then write the object out with 2-space indents.
    // Greensleeves' C# and D# are minor's raised 6th and 7th, so it is in too.
    const snapshot = JSON.parse(
      readFileSync(new URL("./diatonic-main-lists.json", import.meta.url), "utf8"),
    );
    for (const [songId, byNote] of Object.entries(snapshot)) {
      const s = JSON.parse(
        readFileSync(new URL(`../../content/songs/${songId}.json`, import.meta.url), "utf8"),
      );
      assert.equal(s.notes.length, Object.keys(byNote).length, songId);
      for (const note of s.notes) {
        const now = chordOptions(s, note)
          .map((o) => `${o.key} ${o.numeral} ${o.fit.toFixed(4)}`)
          .join(", ");
        assert.equal(now, byNote[note.id], `${songId} ${note.id}`);
      }
    }
  });
});
