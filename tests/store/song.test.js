import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import { createSongStore, emptySong, noteIdsAfter, validateSong } from "../../src/store/song.js";

/** @param {import("../../src/types.js").Song} [song] */
function storeWith(song = /** @type {any} */ (ode)) {
  const store = createSongStore(emptySong());
  store.load(song);
  return store;
}

const starts = (store) => store.get().notes.map((n) => n.start);

describe("song store", () => {
  it("implements the Svelte store contract", () => {
    const store = createSongStore();
    const seen = [];
    const unsubscribe = store.subscribe((s) => seen.push(s.version));
    store.addNote({ midi: 60, start: 0, dur: 12 });
    unsubscribe();
    store.addNote({ midi: 62, start: 12, dur: 12 });
    assert.deepEqual(seen, [0, 1]);
  });

  it("turns swing on and off as one undoable step", () => {
    const store = storeWith();
    assert.equal(store.get().swing, undefined);
    store.setSwing(true);
    assert.equal(store.get().swing, 2);
    store.setSwing(true); // already on: no new step
    store.setSwing(false);
    assert.equal("swing" in store.get(), false);
    store.undo();
    assert.equal(store.get().swing, 2);
    store.undo();
    assert.equal(store.get().swing, undefined);
    assert.doesNotThrow(() => validateSong({ ...store.get(), swing: 2 }));
  });

  it("bumps the version on every action", () => {
    const store = storeWith();
    const before = store.get().version;
    store.setChord("n1", { root: "D", type: "M" });
    store.rekey({ tonic: "B", mode: "minor", provisional: false });
    assert.equal(store.get().version, before + 2);
  });

  it("never reissues a deleted note's id", () => {
    const store = createSongStore();
    const first = store.addNote({ midi: 60, start: 0, dur: 12 });
    store.deleteNote(first);
    const second = store.addNote({ midi: 62, start: 0, dur: 12 });
    assert.notEqual(second, first);
    store.undo();
    store.undo();
    store.redo();
    assert.notEqual(store.addNote({ midi: 64, start: 12, dur: 12 }), first);
  });

  it("load clears undo history", () => {
    const store = createSongStore();
    store.addNote({ midi: 60, start: 0, dur: 12 });
    store.load(/** @type {any} */ (ode));
    store.undo();
    assert.equal(store.get().id, "ode-to-joy");
  });

  it("rejects overlapping notes and leaves the song unchanged", () => {
    const store = storeWith();
    const before = store.get();
    assert.throws(() => store.addNote({ midi: 60, start: 6, dur: 12 }), RangeError);
    assert.equal(store.get(), before);
  });

  describe("setDuration ripples later notes", () => {
    it("halving pulls later notes earlier", () => {
      const store = storeWith();
      store.setDuration("n1", 6);
      assert.deepEqual(starts(store).slice(0, 3), [0, 6, 18]);
    });

    it("doubling pushes later notes later", () => {
      const store = storeWith();
      store.setDuration("n1", 24);
      assert.deepEqual(starts(store).slice(0, 3), [0, 24, 36]);
    });
  });

  it("makeRest keeps the time and drops the note's chord", () => {
    const store = storeWith();
    store.setChord("n2", { root: "D", type: "M" });
    store.makeRest("n2");
    const s = store.get();
    assert.deepEqual(
      s.notes.slice(0, 2).map((n) => n.start),
      [0, 24],
    );
    assert.equal(s.chords.length, 0);
  });

  it("deleteNote closes the gap and drops the note's chord", () => {
    const store = storeWith();
    store.setChord("n2", { root: "D", type: "M" });
    store.deleteNote("n2");
    const s = store.get();
    assert.deepEqual(
      s.notes.slice(0, 2).map((n) => n.start),
      [0, 12],
    );
    assert.equal(s.chords.length, 0);
  });

  it("setChord places, replaces in place, and removes", () => {
    const store = storeWith();
    store.setChord("n1", { root: "D", type: "M" });
    const { id } = store.get().chords[0];
    store.setChord("n1", { root: "A", type: "7" });
    assert.deepEqual(store.get().chords, [{ id, noteId: "n1", root: "A", type: "7" }]);
    store.setChord("n1", null);
    assert.deepEqual(store.get().chords, []);
  });

  it("setPitch changes one note's pitch, keeps its chord, and undoes", () => {
    const store = storeWith();
    store.setChord("n1", { root: "D", type: "M" });
    const before = store.get();
    const { midi } = before.notes[0];
    store.setPitch("n1", midi + 1);
    const after = store.get();
    assert.equal(after.notes[0].midi, midi + 1);
    assert.deepEqual(after.notes.slice(1), before.notes.slice(1));
    assert.deepEqual(after.chords, before.chords);
    assert.equal(after.version, before.version + 1);
    store.undo();
    assert.equal(store.get().notes[0].midi, midi);
  });

  it("setPitch refuses a pitch off the piano or a missing note", () => {
    const store = storeWith();
    const before = store.get();
    for (const midi of [20, 109, 60.5]) {
      assert.throws(() => store.setPitch("n1", midi), RangeError);
    }
    assert.throws(() => store.setPitch("nope", 60));
    store.setPitch("n1", 21);
    store.setPitch("n1", 108);
    assert.equal(store.get().version, before.version + 2);
  });

  it("rekey changes labels' basis but not what was heard", () => {
    const store = storeWith();
    const notes = store.get().notes;
    store.rekey({ tonic: "B", mode: "minor", provisional: false });
    assert.equal(store.get().notes, notes);
    assert.equal(store.get().key.tonic, "B");
  });

  it("transpose moves melody, chords, and tonic together", () => {
    const store = storeWith();
    store.setChord("n1", { root: "D", type: "M" });
    store.transpose(3);
    const s = store.get();
    assert.equal(s.key.tonic, "F");
    assert.equal(s.notes[0].midi, ode.notes[0].midi + 3);
    assert.equal(s.chords[0].root, "F");
  });

  it("transpose passes the enharmonic preference through", () => {
    const sharps = storeWith();
    sharps.transpose(4, { prefer: "sharps" });
    assert.equal(sharps.get().key.tonic, "F#");
    const flats = storeWith();
    flats.transpose(4, { prefer: "flats" });
    assert.equal(flats.get().key.tonic, "Gb");
    assert.equal(flats.get().notes[0].midi, ode.notes[0].midi + 4);
  });

  it("rebar moves only the meter", () => {
    const store = storeWith();
    const notes = store.get().notes;
    store.rebar({ beatsPerBar: 3, beatUnit: 4, pickupTicks: 0, provisional: false });
    assert.equal(store.get().notes, notes);
    assert.equal(store.get().meter.beatsPerBar, 3);
  });

  it("replaceTake swaps a run of notes in one undoable step", () => {
    const store = createSongStore();
    const take = [0, 1, 2].map((i) => store.addNote({ midi: 60 + i, start: i * 10, dur: 8 }));
    const ids = store.replaceTake(
      take,
      [0, 1, 2].map((i) => ({ midi: 60 + i, start: i * 12, dur: 12 })),
    );
    assert.deepEqual(starts(store), [0, 12, 24]);
    assert.equal(new Set([...take, ...ids]).size, 6, "new ids never reuse old ones");
    store.undo();
    assert.deepEqual(starts(store), [0, 10, 20]);
  });

  it("renames the song as one undoable step, refusing a blank or overlong title", () => {
    const store = storeWith();
    store.rename("Joyful noodle");
    assert.equal(store.get().title, "Joyful noodle");
    store.undo();
    assert.equal(store.get().title, "Ode to Joy");
    assert.throws(() => store.rename("   "), RangeError);
    assert.throws(() => store.rename(" padded "), RangeError);
    assert.throws(() => store.rename("x".repeat(121)), RangeError);
    const before = store.get().version;
    store.rename("Ode to Joy");
    assert.equal(store.get().version, before, "the same title is no change");
  });

  describe("undo and redo", () => {
    it("round-trips every edit", () => {
      const store = storeWith();
      const original = store.get();
      store.setDuration("n1", 24);
      store.setChord("n3", { root: "G", type: "M" });
      store.undo();
      store.undo();
      assert.deepEqual(store.get().notes, original.notes);
      assert.deepEqual(store.get().chords, original.chords);
      store.redo();
      store.redo();
      assert.equal(store.get().chords[0].root, "G");
    });

    it("moves the version forward so old suggestions read as stale", () => {
      const store = storeWith();
      store.setChord("n1", { root: "D", type: "M" });
      const after = store.get().version;
      store.undo();
      assert.ok(store.get().version > after);
    });

    it("a new edit clears redo", () => {
      const store = storeWith();
      store.setChord("n1", { root: "D", type: "M" });
      store.undo();
      store.setChord("n2", { root: "D", type: "M" });
      const seen = [];
      store.history.subscribe((h) => seen.push(h));
      assert.deepEqual(seen.at(-1), { canUndo: true, canRedo: false });
    });
  });
});

describe("validateSong", () => {
  it("accepts the demo songs", () => {
    validateSong(/** @type {any} */ (ode));
  });

  it("rejects a chord on a missing note", () => {
    const bad = { ...emptySong(), chords: [{ id: "c1", noteId: "n9", root: "C", type: "M" }] };
    assert.throws(() => validateSong(bad), /missing note/);
  });

  it("rejects a pickup of a full bar", () => {
    const bad = { ...emptySong(), meter: { ...emptySong().meter, pickupTicks: 48 } };
    assert.throws(() => validateSong(bad), /pickup/);
  });
});

describe("noteIdsAfter", () => {
  it("numbers new notes past the highest note id, in base 36", () => {
    assert.deepEqual(noteIdsAfter([{ id: "n9" }, { id: "n2" }], 3), ["na", "nb", "nc"]);
    assert.deepEqual(noteIdsAfter([], 2), ["n1", "n2"]);
    assert.deepEqual(noteIdsAfter([{ id: "n1" }], 0), []);
  });
});
