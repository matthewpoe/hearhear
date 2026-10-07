// persist.js checks a saved song in plain JS, reading its patterns, enums,
// and bounds from contracts/song.schema.json. Here a real schema validator
// judges the same songs: for every chord type and at every bound, a saved
// song comes back exactly when the schema accepts it (and validateSong, which
// checks what the schema can't, such as a pickup shorter than a bar).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import songSchema from "../../contracts/song.schema.json" with { type: "json" };
import { createSongMemory, STORE_VERSION } from "../../src/store/persist.js";
import { validateSong } from "../../src/store/song.js";

const checkSong = new Ajv2020({ strict: false }).compile(songSchema);

/** A small song that passes the schema and validateSong. */
const BASE = {
  schemaVersion: 1,
  id: "probe",
  title: "Probe",
  key: { tonic: "C", mode: "major", provisional: false },
  meter: { beatsPerBar: 4, beatUnit: 4, pickupTicks: 0, provisional: false },
  tempo: 100,
  version: 0,
  notes: [
    { id: "n1", midi: 60, start: 0, dur: 12 },
    { id: "n2", midi: 62, start: 12, dur: 12 },
  ],
  chords: [{ id: "c1", noteId: "n1", root: "C", type: "M" }],
};

/**
 * Whether persist.js brings a saved song back.
 * @param {any} song
 */
function recalled(song) {
  const items = new Map([
    [
      `hearhear.song.${BASE.id}`,
      JSON.stringify({ schemaVersion: STORE_VERSION, song, demoAwaitingGuess: false }),
    ],
  ]);
  const memory = createSongMemory(() => ({
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }));
  return memory.recall(BASE.id) !== null;
}

/**
 * The song with one value replaced, at a path into it.
 * @param {(string | number)[]} path
 * @param {unknown} value
 */
function withValue(path, value) {
  const song = structuredClone(BASE);
  /** @type {any} */
  let at = song;
  for (const step of path.slice(0, -1)) at = at[step];
  at[/** @type {string | number} */ (path.at(-1))] = value;
  return song;
}

/** @param {any} song */
function keepsInvariants(song) {
  try {
    validateSong(song);
    return true;
  } catch {
    return false;
  }
}

/** @param {any} song @param {string} what */
function agrees(song, what) {
  const schema = checkSong(song);
  assert.equal(
    recalled(song),
    schema && keepsInvariants(song),
    `${what}: persist.js and the schema disagree`,
  );
}

describe("persist.js accepts what song.schema.json accepts", () => {
  it("starts from a song both accept", () => {
    assert.ok(checkSong(BASE));
    assert.ok(recalled(BASE));
  });

  it("for every chord type, and some that aren't", () => {
    const schemaTypes = songSchema.$defs.chord.properties.type.enum;
    for (const type of [...schemaTypes, "maj", "min", "M7", "9", "dom7", "", "m7b5 "]) {
      agrees(withValue(["chords", 0, "type"], type), `chord type "${type}"`);
    }
  });

  it("at every numeric bound", () => {
    const { properties: top, $defs: defs } = songSchema;
    /** @type {[(string | number)[], { minimum?: number, maximum?: number }][]} */
    const bounded = [
      [["tempo"], top.tempo],
      [["version"], top.version],
      [["meter", "beatsPerBar"], defs.meter.properties.beatsPerBar],
      [["meter", "pickupTicks"], defs.meter.properties.pickupTicks],
      [["notes", 0, "midi"], defs.note.properties.midi],
      [["notes", 1, "dur"], defs.note.properties.dur],
    ];
    for (const [path, rule] of bounded) {
      const edges = [rule.minimum, rule.maximum].filter((n) => n !== undefined);
      assert.ok(edges.length > 0, `${path.join(".")} has a bound`);
      for (const edge of edges) {
        for (const value of [edge - 1, edge, edge + 1, edge + 0.5]) {
          agrees(withValue(path, value), `${path.join(".")} = ${value}`);
        }
      }
    }
  });

  it("for beat units, modes, tonics, roots, and title lengths", () => {
    for (const unit of [2, 4, 8, 16]) agrees(withValue(["meter", "beatUnit"], unit), `${unit}`);
    for (const mode of ["major", "minor", "dorian"]) agrees(withValue(["key", "mode"], mode), mode);
    for (const tonic of ["C", "F#", "Bb", "C##", "H", "c"])
      agrees(withValue(["key", "tonic"], tonic), `tonic ${tonic}`);
    for (const root of ["C", "F##", "Bbb", "Cbbb", "H"])
      agrees(withValue(["chords", 0, "root"], root), `root ${root}`);
    const { minLength = 0, maxLength = 0 } = songSchema.properties.title;
    for (const length of [minLength - 1, minLength, maxLength, maxLength + 1].filter((n) => n >= 0))
      agrees(withValue(["title"], "x".repeat(length)), `title of ${length}`);
  });
});
