import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { checkSuggestions } from "../../src/tutor/validate.js";

/** @type {Record<string, any>} */
const SONGS_DIR = new URL("../../content/songs/", import.meta.url);
/** Every bundled song by id, so a new fixture or song needs no edit here. */
const SONGS = Object.fromEntries(
  readdirSync(SONGS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(new URL(f, SONGS_DIR), "utf8")))
    .map((song) => [song.id, song]),
);

const FIXTURES = new URL("../../contracts/fixtures/tutor/", import.meta.url);

/** One well-formed suggestion on Ode to Joy: bar 4's held E, under an A chord. */
const GOOD = {
  bar: 4,
  beat: 3,
  numeral: "V",
  letter: "A",
  confidence: "high",
  reason: "The held E is the 5th of A.",
};

/** @param {Record<string, unknown>} change */
const variant = (change) => ({ ...GOOD, ...change });

describe("checkSuggestions", () => {
  for (const name of readdirSync(FIXTURES).filter((f) => f.endsWith(".json"))) {
    const fixture = JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
    const event = fixture.events.find((/** @type {any} */ e) => e.event === "suggestions");
    if (!event) continue;
    it(`keeps every suggestion in the ${fixture.name} fixture`, () => {
      const raw = event.data.suggestions;
      assert.ok(SONGS[fixture.song], `fixture ${fixture.name} names unknown song ${fixture.song}`);
      const { items, dropped } = checkSuggestions(raw, SONGS[fixture.song]);
      assert.equal(dropped, 0);
      assert.equal(items.length, raw.length);
    });
  }

  it("anchors a suggestion to its note and derives the chord from the numeral", () => {
    const { items, dropped } = checkSuggestions([GOOD], /** @type {any} */ (ode));
    assert.equal(dropped, 0);
    const [item] = items;
    const note = ode.notes.find((n) => n.id === item.noteId);
    assert.equal(note?.start, 3 * 48 + 24, "bar 4, beat 3");
    assert.deepEqual(
      { root: item.chord.root, numeral: item.numeral, confidence: item.confidence },
      { root: "A", numeral: "V", confidence: "high" },
    );
    assert.equal(item.reason, GOOD.reason);
  });

  it("gives every kept suggestion its own id", () => {
    const { items } = checkSuggestions([GOOD, GOOD], /** @type {any} */ (ode));
    assert.equal(new Set(items.map((s) => s.id)).size, 2);
  });

  it("lands a suggestion on a pickup note in bar 0", () => {
    // St. James has a one-beat pickup: its first note is bar 0, beat 4.
    const pickup = { ...GOOD, bar: 0, beat: 4, numeral: "i", letter: "Em" };
    const { items, dropped } = checkSuggestions([pickup], /** @type {any} */ (stJames));
    assert.equal(dropped, 0);
    assert.equal(items[0].noteId, stJames.notes[0].id);
  });

  describe("numeral and letter agree by chord identity, not spelling", () => {
    it("keeps an enharmonic root and stores the numeral's spelling", () => {
      const { items, dropped } = checkSuggestions(
        [variant({ numeral: "bVI", letter: "A#" })],
        /** @type {any} */ (ode),
      );
      assert.equal(dropped, 0);
      assert.deepEqual(items[0].chord, { root: "Bb", type: "M" });
    });

    for (const letter of ["C#dim", "C#o", "C#°", "Db°"]) {
      it(`keeps vii° in D written as ${letter}`, () => {
        const [item] = checkSuggestions(
          [variant({ numeral: "vii°", letter })],
          /** @type {any} */ (ode),
        ).items;
        assert.deepEqual(item?.chord, { root: "C#", type: "dim" });
      });
    }

    for (const letter of ["Bm", "Bmin"]) {
      it(`keeps vi in D written as ${letter}`, () => {
        const [item] = checkSuggestions(
          [variant({ numeral: "vi", letter })],
          /** @type {any} */ (ode),
        ).items;
        assert.deepEqual(item?.chord, { root: "B", type: "m" });
      });
    }

    it("still drops a real mismatch: the right root with the wrong quality", () => {
      const result = checkSuggestions([variant({ letter: "Am" })], /** @type {any} */ (ode));
      assert.deepEqual(result, { items: [], dropped: 1 });
    });
  });

  const BAD = {
    "a bar given as a string": variant({ bar: "4" }),
    "a beat given as a string": variant({ beat: "3" }),
    "a beat with no note onset": variant({ beat: 3.5 }),
    "a bar past the end of the song": variant({ bar: 99 }),
    "a numeral and letter that disagree": variant({ letter: "D" }),
    "a numeral that doesn't parse": variant({ numeral: "VIII" }),
    "a letter that doesn't parse": variant({ letter: "A major" }),
    "an unknown confidence": variant({ confidence: "certain" }),
    "a missing reason": variant({ reason: undefined }),
    "a null entry": null,
    "a bare string": "V",
  };
  for (const [what, candidate] of Object.entries(BAD)) {
    it(`drops ${what}`, () => {
      assert.deepEqual(checkSuggestions([candidate], /** @type {any} */ (ode)), {
        items: [],
        dropped: 1,
      });
    });
  }

  it("keeps the good ones and counts the rest when one is bad", () => {
    const { items, dropped } = checkSuggestions(
      [
        GOOD,
        variant({ letter: "D" }),
        variant({ bar: "4" }),
        variant({ bar: 8, beat: 3, numeral: "I", letter: "D" }),
      ],
      /** @type {any} */ (ode),
    );
    assert.deepEqual(
      items.map((s) => s.numeral),
      ["V", "I"],
    );
    assert.equal(dropped, 2);
  });

  it("matches a triplet onset within the snapshot's rounding", () => {
    const song = {
      ...ode,
      notes: [{ id: "t1", midi: 66, start: 4, dur: 4 }],
    };
    // 4 ticks into a 12-tick beat: beat 1.333 after the snapshot's rounding.
    const triplet = { ...GOOD, bar: 1, beat: 1.333, numeral: "I", letter: "D" };
    assert.equal(checkSuggestions([triplet], /** @type {any} */ (song)).items.length, 1);
    assert.equal(
      checkSuggestions([{ ...triplet, beat: 1.34 }], /** @type {any} */ (song)).items.length,
      0,
    );
  });
});
