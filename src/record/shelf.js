/**
 * The user's recorded tunes: which ones exist, in the order they were made,
 * and the latest copy of each. The songs themselves are saved by per-song
 * memory (src/store/persist.js), like any other song, and persist.js keeps the
 * one "my songs" index of their ids, so the song picker can offer them after
 * a reload. The shelf reads and writes that index and keeps the latest copy
 * of each tune for the picker.
 *
 * Storage is a convenience here too: blocked or full storage leaves the
 * shelf working for this page, and it is empty again after a reload.
 *
 * @import { Song } from "../types.js"
 * @import { RawTake, StorageAccess } from "../store/persist.js"
 */

import { createReadable } from "../lib/readable.js";
import { createSongMemory } from "../store/persist.js";

/**
 * @typedef {{ id: string, title: string }} ShelfEntry
 */

/**
 * @param {StorageAccess} storage the same access per-song memory uses
 */
export function createShelf(storage) {
  const memory = createSongMemory(storage);
  /** @type {Map<string, Song>} in the order the tunes were made */
  const copies = new Map();
  const list = createReadable(/** @type {ShelfEntry[]} */ ([]));

  const writeIndex = () => memory.setMySongs([...copies.keys()]);

  function publish() {
    list.set([...copies.values()].map(({ id, title }) => ({ id, title })));
  }

  for (const id of memory.mySongs()) {
    const saved = memory.recall(id);
    if (saved) copies.set(id, saved.song);
  }
  publish();

  return {
    /** The user's tunes, oldest first, as `{ id, title }`. */
    list: { subscribe: list.subscribe, get: list.get },

    /** @param {string} id @returns {Song | undefined} the latest copy */
    get: (id) => copies.get(id),

    /** @param {string} id */
    has: (id) => copies.has(id),

    /**
     * A tune's raw take (its key timings), kept beside it so it can be read
     * again with another feel. Null for a tune with none.
     * @param {string} id
     * @returns {RawTake | null}
     */
    take: (id) => (copies.has(id) ? memory.recallTake(id) : null),

    /**
     * Keep a tune's raw take beside it.
     * @param {string} id
     * @param {RawTake} take
     */
    saveTake(id, take) {
      memory.saveTake(id, take);
    },

    /**
     * Put a new tune on the shelf, or back where it was (`at`, an undone
     * discard, with its raw take).
     * @param {Song} song
     * @param {number} [at]
     * @param {RawTake | null} [take]
     */
    add(song, at = copies.size, take = null) {
      if (take) memory.saveTake(song.id, take);
      const entries = [...copies.entries()].filter(([id]) => id !== song.id);
      entries.splice(Math.min(at, entries.length), 0, [song.id, song]);
      copies.clear();
      for (const [id, copy] of entries) copies.set(id, copy);
      writeIndex();
      publish();
    },

    /**
     * Keep the latest copy of a tune on the shelf as it changes. Songs that
     * aren't on it are ignored.
     * @param {Song} song
     */
    track(song) {
      const previous = copies.get(song.id);
      if (!previous) return;
      copies.set(song.id, song);
      if (previous.title !== song.title) publish();
    },

    /**
     * Forget a saved song that isn't on the shelf (a re-take's draft).
     * @param {string} id
     */
    forget(id) {
      if (!copies.has(id)) memory.forget(id);
    },

    /**
     * Take a tune off the shelf and forget its saved copy.
     * @param {string} id
     * @returns {{ song: Song, at: number, take: RawTake | null } | null} what
     *   was removed, for undo
     */
    remove(id) {
      const song = copies.get(id);
      if (!song) return null;
      const at = [...copies.keys()].indexOf(id);
      const take = memory.recallTake(id);
      copies.delete(id);
      writeIndex();
      memory.forget(id);
      memory.forgetTake(id);
      publish();
      return { song, at, take };
    },
  };
}

/** @typedef {ReturnType<typeof createShelf>} Shelf */
