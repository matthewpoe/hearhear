import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { createSongStore } from "../../src/store/song.js";
import { createUiStore } from "../../src/store/ui.js";
import { STORE_VERSION, createSongMemory, installPersistence } from "../../src/store/persist.js";

/** @typedef {import("../../src/types.js").Song} Song */

const ODE = /** @type {Song} */ (/** @type {unknown} */ (ode));
const ST_JAMES = /** @type {Song} */ (/** @type {unknown} */ (stJames));
const G_MAJOR = { tonic: "G", mode: "major", provisional: false };

/** A sessionStorage stand-in; `items` is the shared backing map (the tab). */
function fakeStorage(items = new Map()) {
  return {
    items,
    /** @param {string} key */
    getItem: (key) => items.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => void items.set(key, String(value)),
  };
}

const throwing = {
  getItem() {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem() {
    throw new DOMException("full", "QuotaExceededError");
  },
};

/**
 * A page load: fresh stores with persistence installed on `storage`.
 * `fresh` mirrors loadDemo: provisional C, labels hidden.
 * @param {any} storage
 */
function boot(storage) {
  const song = createSongStore();
  const ui = createUiStore();
  const stop = mock.fn();
  const memory = installPersistence({
    song,
    ui,
    storage: () => storage,
    fresh(tune) {
      song.load({ ...tune, key: { tonic: "C", mode: "major", provisional: true } });
      ui.update({ demoAwaitingGuess: true });
    },
    stop,
  });
  return { song, ui, stop, memory };
}

describe("song memory", () => {
  it("open() is a plain load until persistence is installed", () => {
    const song = createSongStore();
    song.open(ODE);
    assert.equal(song.get().id, ODE.id);
    assert.deepEqual(song.get().key, ODE.key);
  });

  afterEach(() => {
    mock.restoreAll();
    mock.timers.reset();
  });

  it("opens a tune fresh when nothing is saved", () => {
    const { song, ui } = boot(fakeStorage());
    song.open(ODE);
    assert.equal(song.get().id, ODE.id);
    assert.deepEqual(song.get().key, { tonic: "C", mode: "major", provisional: true });
    assert.equal(ui.get().demoAwaitingGuess, true);
  });

  it("keeps a song's key guess and chords when switched away and back", () => {
    const { song, ui, stop } = boot(fakeStorage());
    song.open(ODE);
    song.rekey(G_MAJOR);
    const noteId = song.get().notes[0].id;
    song.setChord(noteId, { root: "G", type: "M" });
    ui.update({ selectedNoteId: noteId });

    song.open(ST_JAMES);
    assert.equal(song.get().id, ST_JAMES.id);
    assert.equal(song.get().key.provisional, true);

    song.open(ODE);
    assert.deepEqual(song.get().key, G_MAJOR);
    assert.deepEqual(
      song.get().chords.map(({ noteId: on, root, type }) => ({ on, root, type })),
      [{ on: noteId, root: "G", type: "M" }],
    );
    assert.equal(ui.get().demoAwaitingGuess, true);
    assert.equal(ui.get().selectedNoteId, null);
    assert.equal(stop.mock.callCount(), 1);
  });

  it("starts undo history empty when a saved song opens", () => {
    const { song } = boot(fakeStorage());
    song.open(ODE);
    song.rekey(G_MAJOR);
    song.open(ST_JAMES);
    song.open(ODE);
    /** @type {{ canUndo: boolean }[]} */
    const seen = [];
    song.history.subscribe((h) => seen.push(h))();
    assert.equal(seen[0].canUndo, false);
  });

  it("reopens the last song after a reload, with its changes and demo flag", () => {
    const tab = fakeStorage();
    const before = boot(tab);
    before.song.open(ODE);
    before.song.rekey(G_MAJOR);
    before.ui.update({ demoAwaitingGuess: false });
    before.memory.flush();

    const after = boot(tab);
    assert.equal(after.song.get().id, ODE.id);
    assert.deepEqual(after.song.get().key, G_MAJOR);
    assert.equal(after.ui.get().demoAwaitingGuess, false);
  });

  it("keeps an edit when the same song reopens before the save fires", () => {
    const tab = fakeStorage();
    const { song } = boot(tab);
    song.open(ODE);
    song.rekey(G_MAJOR);
    // Within the debounce window: nothing flushed yet.
    song.open(ODE);
    assert.deepEqual(song.get().key, G_MAJOR);
    const stored = JSON.parse(tab.items.get(`hearhear.song.${ODE.id}`));
    assert.deepEqual(stored.song.key, G_MAJOR);
  });

  it("forget() drops a song's saved copy and cancels its pending save", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const tab = fakeStorage();
    const removable = { ...tab, removeItem: (/** @type {string} */ key) => tab.items.delete(key) };
    const { song, memory } = boot(removable);
    const key = `hearhear.song.${ODE.id}`;
    song.open(ODE);
    memory.flush();
    assert.ok(tab.items.has(key), "an earlier copy was saved");
    song.rekey(G_MAJOR);
    // Within the debounce window: the edit's save is still pending.
    song.forget(ODE.id);
    assert.equal(tab.items.has(key), false);
    mock.timers.tick(10_000);
    memory.flush();
    assert.equal(tab.items.has(key), false, "the pending save never lands");
  });

  it("forget() leaves another song's pending save alone", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const tab = fakeStorage();
    const { song, memory } = boot(tab);
    song.open(ODE);
    song.rekey(G_MAJOR);
    memory.forget(ST_JAMES.id);
    mock.timers.tick(10_000);
    assert.deepEqual(JSON.parse(tab.items.get(`hearhear.song.${ODE.id}`)).song.key, G_MAJOR);
  });

  it("round-trips a song through storage", () => {
    const tab = fakeStorage();
    const memory = createSongMemory(() => tab);
    memory.save({ song: ODE, demoAwaitingGuess: true });
    assert.deepEqual(memory.recall(ODE.id), { song: ODE, demoAwaitingGuess: true });
    assert.equal(memory.recall(ST_JAMES.id), null);
  });

  it("ignores corrupt, old-version, and invalid saved copies", () => {
    const warn = mock.method(console, "warn", () => {});
    const tab = fakeStorage();
    const memory = createSongMemory(() => tab);
    const key = `hearhear.song.${ODE.id}`;
    const entry = (/** @type {object} */ patch) =>
      JSON.stringify({
        schemaVersion: STORE_VERSION,
        song: ODE,
        demoAwaitingGuess: true,
        ...patch,
      });

    for (const raw of [
      "{not json",
      entry({ schemaVersion: STORE_VERSION + 1 }),
      entry({ schemaVersion: undefined }),
      entry({ demoAwaitingGuess: "yes" }),
      entry({ song: { ...ODE, id: "someone-else" } }),
      entry({ song: { ...ODE, tempo: 9000 } }),
      entry({ song: { ...ODE, chords: [{ id: "c1", noteId: "n999", root: "C", type: "M" }] } }),
    ]) {
      tab.items.set(key, raw);
      assert.equal(memory.recall(ODE.id), null, raw);
    }

    // open() then starts the tune fresh, and the next save overwrites the junk.
    const { song, memory: installed } = boot(tab);
    song.open(ODE);
    assert.equal(song.get().id, ODE.id);
    installed.flush();
    assert.equal(JSON.parse(tab.items.get(key)).schemaVersion, STORE_VERSION);
    assert.equal(warn.mock.callCount(), 0);
  });

  it("works without storage when storage throws", () => {
    const warn = mock.method(console, "warn", () => {});
    const { song, memory } = boot(throwing);
    song.open(ODE);
    song.rekey(G_MAJOR);
    memory.flush();
    song.open(ST_JAMES);
    assert.equal(song.get().id, ST_JAMES.id);
    assert.ok(warn.mock.callCount() >= 1);
  });

  it("works when the storage getter itself throws", () => {
    mock.method(console, "warn", () => {});
    const song = createSongStore();
    const ui = createUiStore();
    installPersistence({
      song,
      ui,
      storage: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      fresh: song.load,
      stop: () => {},
    }).flush();
    song.open(ODE);
    assert.equal(song.get().id, ODE.id);
  });
});
