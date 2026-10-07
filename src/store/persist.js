/**
 * Songs remember themselves for this tab (Matthew: "When you switch between
 * the songs and go back and forth, the song you were working on before should
 * retain its guesses"). Each song is saved in sessionStorage under its id, as
 * the user has it (key and its provisional flag, notes, chords, meter, tempo,
 * title) plus the demo flag that goes with it, a moment after every change.
 * Which song is open is saved too, so a reload lands where the user was.
 *
 * Storage is a convenience: it can be blocked or full, and the app works the
 * same without it. Anything that doesn't match the current stored shape, or
 * fails song validation, is ignored and overwritten by the next save. Nothing
 * tutor-related is stored here.
 *
 * @import { Song } from "../types.js"
 * @import { SongStore } from "./song.js"
 */

import { isLyric, validateSong } from "./song.js";

/** Bump when the stored shape changes; older entries are then ignored. */
export const STORE_VERSION = 1;
const SONG_PREFIX = "hearhear.song.";
const OPEN_KEY = "hearhear.openSong";
/** Wait this long after the last change before saving. */
const SAVE_DELAY_MS = 300;

const TONIC = /^[A-G](#|b)?$/;
const PITCH_CLASS = /^[A-G](##|bb|#|b)?$/;
const CHORD_TYPES = new Set([
  "M",
  "m",
  "7",
  "maj7",
  "m7",
  "dim",
  "dim7",
  "m7b5",
  "aug",
  "sus2",
  "sus4",
  "6",
  "m6",
]);

/**
 * sessionStorage-like access; the getter itself may throw (blocked storage).
 * @typedef {() => Pick<Storage, "getItem" | "setItem">} StorageAccess
 */

/**
 * A saved song and the demo state that goes with it.
 * @typedef {{ song: Song, demoAwaitingGuess: boolean }} SavedSong
 */

/** @param {unknown} n @param {number} min @param {number} [max] */
const isInt = (n, min, max = Infinity) =>
  Number.isInteger(n) && /** @type {number} */ (n) >= min && /** @type {number} */ (n) <= max;

/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = (value) => typeof value === "object" && value !== null;

/**
 * The checks song.schema.json makes, in plain JS (the browser has no schema
 * validator). validateSong covers the rest.
 * @param {unknown} song
 * @returns {song is Song}
 */
function isSong(song) {
  if (!isObject(song) || song.schemaVersion !== 1) return false;
  const { id, title, key, meter, tempo, version, notes, chords } = song;
  return (
    typeof id === "string" &&
    /^[a-z0-9-]{1,64}$/.test(id) &&
    typeof title === "string" &&
    title.length >= 1 &&
    title.length <= 120 &&
    isObject(key) &&
    typeof key.tonic === "string" &&
    TONIC.test(key.tonic) &&
    (key.mode === "major" || key.mode === "minor") &&
    typeof key.provisional === "boolean" &&
    isObject(meter) &&
    isInt(meter.beatsPerBar, 2, 12) &&
    (meter.beatUnit === 4 || meter.beatUnit === 8) &&
    isInt(meter.pickupTicks, 0, 144) &&
    typeof meter.provisional === "boolean" &&
    isInt(tempo, 30, 240) &&
    isInt(version, 0) &&
    Array.isArray(notes) &&
    notes.every(
      (n) =>
        isObject(n) &&
        typeof n.id === "string" &&
        /^n[0-9a-z]{1,16}$/.test(n.id) &&
        isInt(n.midi, 21, 108) &&
        isInt(n.start, 0) &&
        isInt(n.dur, 1, 576) &&
        (n.lyric === undefined || isLyric(n.lyric)),
    ) &&
    Array.isArray(chords) &&
    chords.every(
      (c) =>
        isObject(c) &&
        typeof c.id === "string" &&
        /^c[0-9a-z]{1,16}$/.test(c.id) &&
        typeof c.noteId === "string" &&
        typeof c.root === "string" &&
        PITCH_CLASS.test(c.root) &&
        CHORD_TYPES.has(c.type),
    )
  );
}

/**
 * This tab's saved songs. Every storage call is guarded: a failure is warned
 * about once and otherwise reads as "nothing saved".
 * @param {StorageAccess} storage
 */
export function createSongMemory(storage) {
  let warned = false;

  /**
   * @template T
   * @param {() => T} action
   * @param {T} fallback
   * @returns {T}
   */
  function guard(action, fallback) {
    try {
      return action();
    } catch (error) {
      if (!warned) {
        warned = true;
        // Blocked or full storage: songs still work, they just won't come back.
        console.warn("Couldn't use this tab's storage to remember songs", error);
      }
      return fallback;
    }
  }

  return {
    /** @param {SavedSong} saved */
    save({ song, demoAwaitingGuess }) {
      const entry = JSON.stringify({ schemaVersion: STORE_VERSION, song, demoAwaitingGuess });
      guard(() => storage().setItem(SONG_PREFIX + song.id, entry), undefined);
    },

    /**
     * The saved copy of a song, or null if there is none or it doesn't check out.
     * @param {string} id
     * @returns {SavedSong | null}
     */
    recall(id) {
      const raw = guard(() => storage().getItem(SONG_PREFIX + id), null);
      if (!raw) return null;
      try {
        const entry = JSON.parse(raw);
        if (
          !isObject(entry) ||
          entry.schemaVersion !== STORE_VERSION ||
          typeof entry.demoAwaitingGuess !== "boolean" ||
          !isSong(entry.song) ||
          entry.song.id !== id
        ) {
          return null;
        }
        validateSong(entry.song);
        return { song: entry.song, demoAwaitingGuess: entry.demoAwaitingGuess };
      } catch {
        // Corrupt JSON or a song that breaks an invariant: start fresh instead.
        return null;
      }
    },

    /** @returns {string | null} the id of the song open in this tab */
    openId: () => guard(() => storage().getItem(OPEN_KEY), null),

    /** @param {string} id */
    setOpenId(id) {
      guard(() => storage().setItem(OPEN_KEY, id), undefined);
    },
  };
}

/**
 * Install song memory on the app's stores: open() recalls saved songs, the
 * song open last in this tab comes back, and every change after that is
 * saved, debounced. Call once at startup.
 * @param {{
 *   song: SongStore,
 *   ui: ReturnType<typeof import("./ui.js").createUiStore>,
 *   storage: StorageAccess,
 *   fresh: (tune: Song) => void,
 *   stop: () => void,
 * }} options `fresh` sets up a tune with no saved copy (loadDemo); `stop`
 *   silences audio before a saved song takes over
 * @returns {{ flush: () => void }} flush saves any pending change now (page hide)
 */
export function installPersistence({ song, ui, storage, fresh, stop }) {
  const memory = createSongMemory(storage);

  /** @type {SavedSong | null} */
  let pending = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  function flush() {
    clearTimeout(timer);
    if (pending) memory.save(pending);
    pending = null;
  }

  song.setOpenHooks({
    recall(id) {
      // Write any pending edit first, or reopening the open song reads a stale copy.
      flush();
      const saved = memory.recall(id);
      if (!saved) return null;
      return {
        song: saved.song,
        // The same view reset a fresh demo gets, with the saved demo flag.
        restore() {
          stop();
          ui.update({
            demoAwaitingGuess: saved.demoAwaitingGuess,
            selectedNoteId: null,
            playheadNoteId: null,
            keyboardLights: { source: null, chord: null, melody: [] },
          });
        },
      };
    },
    fresh,
  });

  // Reopen before watching, so the empty starting song never overwrites a saved one.
  const lastOpen = memory.openId();
  const reopened = lastOpen ? memory.recall(lastOpen) : null;
  if (reopened) song.open(reopened.song);

  let openId = lastOpen;

  function changed() {
    const current = song.get();
    // A switch: the song being left is saved now, as it was, before the new one counts.
    if (pending && pending.song.id !== current.id) flush();
    if (current.id !== openId) {
      openId = current.id;
      memory.setOpenId(current.id);
    }
    pending = { song: current, demoAwaitingGuess: ui.get().demoAwaitingGuess };
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  song.subscribe(changed);
  let demo = ui.get().demoAwaitingGuess;
  ui.subscribe((state) => {
    if (state.demoAwaitingGuess === demo) return;
    demo = state.demoAwaitingGuess;
    changed();
  });

  return { flush };
}
