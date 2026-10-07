/**
 * The user's recorded tunes: which ones exist, in the order they were made,
 * and the latest copy of each. The songs themselves are saved by per-song
 * memory (src/store/persist.js), like any other song; the shelf adds the list
 * of ids, so the song picker can offer them after a reload.
 *
 * Storage is a convenience here too: blocked or full storage leaves the
 * shelf working for this page, and it is empty again after a reload.
 *
 * @import { Song } from "../types.js"
 * @import { StorageAccess } from "../store/persist.js"
 */

import { createReadable } from "../lib/readable.js";
import { createSongMemory } from "../store/persist.js";
import { isUserTune } from "./take.js";

const INDEX_KEY = "hearhear.myTunes";

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

  /** @returns {string[]} */
  function readIndex() {
    try {
      const ids = JSON.parse(storage().getItem(INDEX_KEY) ?? "[]");
      return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && isUserTune(id)) : [];
    } catch {
      // Blocked storage or a corrupt index: no tunes to bring back.
      return [];
    }
  }

  function writeIndex() {
    try {
      storage().setItem(INDEX_KEY, JSON.stringify([...copies.keys()]));
    } catch {
      // persist.js already warns once about blocked storage.
    }
  }

  function publish() {
    list.set([...copies.values()].map(({ id, title }) => ({ id, title })));
  }

  for (const id of readIndex()) {
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
     * Put a new tune on the shelf, or back where it was (`at`, an undone discard).
     * @param {Song} song
     * @param {number} [at]
     */
    add(song, at = copies.size) {
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
     * Take a tune off the shelf and forget its saved copy.
     * @param {string} id
     * @returns {{ song: Song, at: number } | null} what was removed, for undo
     */
    remove(id) {
      const song = copies.get(id);
      if (!song) return null;
      const at = [...copies.keys()].indexOf(id);
      copies.delete(id);
      writeIndex();
      memory.forget(id);
      publish();
      return { song, at };
    },
  };
}

/** @typedef {ReturnType<typeof createShelf>} Shelf */
