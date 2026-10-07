import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { createSongStore } from "../../src/store/song.js";
import { createUiStore } from "../../src/store/ui.js";
import { createShelf } from "../../src/record/shelf.js";
import { createRecorder } from "../../src/record/recorder.js";
import { MAX_TAKE_NOTES, isUserTune } from "../../src/record/take.js";

/** @typedef {import("../../src/types.js").Song} Song */
/** @typedef {import("../../src/input/liveNotes.js").NoteEvent} NoteEvent */

const ODE = /** @type {Song} */ (/** @type {unknown} */ (ode));

/** A sessionStorage stand-in over a shared map (the tab). */
function fakeStorage(items = new Map()) {
  return {
    items,
    /** @param {string} key */
    getItem: (key) => items.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => void items.set(key, String(value)),
    /** @param {string} key */
    removeItem: (key) => void items.delete(key),
  };
}

/** A recorder over fresh stores, with a hand-driven clock and inputs. */
function setup({ initial = /** @type {Song | undefined} */ (undefined), items = new Map() } = {}) {
  const song = createSongStore(initial);
  const ui = createUiStore();
  const storage = fakeStorage(items);
  const shelf = createShelf(() => storage);
  song.subscribe((s) => shelf.track(s));
  /** @type {Set<(event: NoteEvent) => void>} */
  const listeners = new Set();
  let clock = 1000;
  /** @type {Song[]} */
  const opened = [];
  const recorder = createRecorder({
    song,
    ui,
    shelf,
    onNoteEvent: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: (tune) => {
      opened.push(tune);
      song.load(tune);
    },
    stopAudio: () => {},
    now: () => clock,
    wallClock: () => 1_760_000_000_000,
    schedule: (run) => run(),
  });
  /** @param {NoteEvent} event */
  const emit = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  /**
   * Tap a pitch: down now, up 100 ms later, then wait out the rest of `beats`.
   * @param {number} midi
   * @param {number} [beats]
   * @param {string} [source]
   */
  const tap = (midi, beats = 1, source = "key:Digit1") => {
    emit({ type: "on", midi, source, atMs: clock });
    clock += 100;
    emit({ type: "off", midi, source, atMs: clock });
    clock += beats * 500 - 100;
  };
  return { song, ui, shelf, recorder, tap, emit, opened, storage, listeners };
}

describe("recorder", () => {
  it("waits for the first note, then records a new tune onto the staff as it is played", () => {
    const { song, recorder, tap, shelf } = setup();
    recorder.record();
    assert.equal(recorder.get().status, "armed");
    assert.equal(song.get().notes.length, 0, "nothing until the first note");
    tap(60);
    assert.equal(recorder.get().status, "recording");
    assert.equal(recorder.get().startedAtMs, 1000);
    assert.ok(isUserTune(song.get().id));
    assert.equal(song.get().notes.length, 1, "the first note is on the staff");
    tap(62);
    tap(64);
    assert.equal(song.get().notes.length, 3);
    assert.equal(recorder.get().notes, 3);
    assert.deepEqual(
      shelf.list.get().map((t) => t.title),
      ["My tune"],
    );
  });

  it("stops into a tune at the played tempo, 4/4, with a provisional key, and asks its name", () => {
    const { song, recorder, tap } = setup();
    recorder.record();
    for (const midi of [60, 62, 64, 65]) tap(midi);
    recorder.stop();
    const tune = song.get();
    assert.equal(recorder.get().status, "naming");
    assert.equal(recorder.get().afterTake, true);
    assert.equal(tune.tempo, 120);
    assert.deepEqual(
      tune.notes.map((n) => [n.midi, n.start, n.dur]),
      [
        [60, 0, 12],
        [62, 12, 12],
        [64, 24, 12],
        [65, 36, 12],
      ],
    );
    assert.equal(tune.key.provisional, true);
    assert.equal(tune.meter.pickupTicks, 0);
    recorder.name("  Morning   noodle ");
    assert.equal(song.get().title, "Morning noodle");
    assert.equal(recorder.get().status, "idle");
  });

  it("keeps the offered title when the name is left blank", () => {
    const { song, recorder, tap } = setup();
    recorder.record();
    tap(60);
    recorder.stop();
    recorder.name("   ");
    assert.equal(song.get().title, "My tune");
  });

  it("leaves chord-row chords out of the melody", () => {
    const { song, recorder, tap } = setup();
    recorder.record();
    tap(60);
    tap(48, 1, "chord:KeyA");
    tap(62);
    recorder.stop();
    assert.deepEqual(
      song.get().notes.map((n) => n.midi),
      [60, 62],
    );
  });

  it("puts the recorder away when stopped before any note", () => {
    const { song, recorder, listeners } = setup({ initial: ODE });
    recorder.record();
    recorder.stop();
    assert.equal(recorder.get().status, "idle");
    assert.equal(song.get().id, "ode-to-joy");
    assert.equal(listeners.size, 0);
  });

  it("stops at the note limit and says so", () => {
    const { song, recorder, tap } = setup();
    recorder.record();
    for (let i = 0; i < MAX_TAKE_NOTES + 3; i++) tap(60 + (i % 5));
    assert.equal(recorder.get().status, "naming");
    assert.equal(recorder.get().capped, true);
    assert.equal(song.get().notes.length, MAX_TAKE_NOTES);
  });

  it("records again in one undoable step: Undo brings the earlier take back", () => {
    const { song, recorder, tap } = setup();
    recorder.record();
    for (const midi of [60, 62, 64]) tap(midi);
    recorder.stop();
    recorder.name("Take one");
    const first = song.get();
    recorder.record({ again: true });
    for (const midi of [67, 65]) tap(midi, 2);
    recorder.stop();
    const second = song.get();
    assert.equal(second.id, first.id);
    assert.equal(second.title, "Take one");
    assert.deepEqual(
      second.notes.map((n) => n.midi),
      [67, 65],
    );
    song.undo();
    assert.deepEqual(
      song.get().notes.map((n) => n.midi),
      [60, 62, 64],
    );
    assert.equal(song.get().tempo, first.tempo);
  });

  it("discards a new tune back to the song open before it, and Undo restores it", () => {
    const { song, recorder, tap, shelf, opened, storage } = setup({ initial: ODE });
    recorder.record();
    tap(60);
    tap(62);
    recorder.stop();
    recorder.name("Scratch");
    const id = song.get().id;
    storage.setItem(`hearhear.song.${id}`, "{}");
    recorder.discard();
    assert.equal(song.get().id, "ode-to-joy");
    assert.equal(opened.at(-1)?.id, "ode-to-joy");
    assert.equal(shelf.list.get().length, 0);
    assert.equal(storage.getItem(`hearhear.song.${id}`), null, "its saved copy is forgotten");
    assert.equal(recorder.get().discarded, "Scratch");
    recorder.undoDiscard();
    assert.equal(song.get().id, id);
    assert.equal(song.get().title, "Scratch");
    assert.equal(shelf.list.get().length, 1);
    assert.equal(recorder.get().discarded, null);
  });

  it("discards to the empty welcome when nothing was open", () => {
    const { song, recorder, tap } = setup();
    recorder.record();
    tap(60);
    recorder.stop();
    recorder.name("Gone");
    recorder.discard();
    assert.equal(song.get().notes.length, 0);
    assert.equal(recorder.get().discarded, "Gone");
  });

  it("stops offering Undo once another song opens", () => {
    const { song, recorder, tap } = setup();
    recorder.record();
    tap(60);
    recorder.stop();
    recorder.discard();
    song.load(ODE);
    assert.equal(recorder.get().discarded, null);
  });

  it("drops the take when another song opens mid-recording", () => {
    const { song, recorder, tap, listeners } = setup();
    recorder.record();
    tap(60);
    song.load(ODE);
    assert.equal(recorder.get().status, "idle");
    assert.equal(listeners.size, 0);
    tap(62);
    assert.equal(song.get().id, "ode-to-joy");
  });

  it("brings the user's tunes back after a reload, renamed", () => {
    const items = new Map();
    const first = setup({ items });
    first.recorder.record();
    first.tap(60);
    first.tap(64);
    first.recorder.stop();
    first.recorder.name("Keeper");
    // persist.js saves each song under its id; stand in for it here.
    const tune = first.song.get();
    first.storage.setItem(
      `hearhear.song.${tune.id}`,
      JSON.stringify({ schemaVersion: 1, song: tune, demoAwaitingGuess: false }),
    );
    const second = setup({ items });
    assert.deepEqual(second.shelf.list.get(), [{ id: tune.id, title: "Keeper" }]);
    second.recorder.openTune(tune.id);
    assert.equal(second.song.get().title, "Keeper");
    assert.equal(second.song.get().notes.length, 2);
  });

  it("a second tune is offered the next free title", () => {
    const { recorder, tap, shelf } = setup();
    for (let take = 0; take < 2; take++) {
      recorder.record();
      tap(60);
      recorder.stop();
      recorder.name("");
    }
    assert.deepEqual(
      shelf.list.get().map((t) => t.title),
      ["My tune", "My tune 2"],
    );
  });
});
