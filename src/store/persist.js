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

import songSchema from "../../contracts/song.schema.json" with { type: "json" };
import { isLyric, isSwing, validateSong } from "./song.js";
import { isTitle } from "./songLimits.js";

/** Bump when the stored shape changes; older entries are then ignored. */
export const STORE_VERSION = 1;
const SONG_PREFIX = "hearhear.song.";
const OPEN_KEY = "hearhear.openSong";
/** The user's own songs (recorded tunes): one index of ids, oldest first. */
const MY_SONGS_KEY = "hearhear.mySongs";
/** A recorded tune's raw take (key timings), beside its song, never in it. */
const TAKE_PREFIX = "hearhear.take.";
/** A user song's id: "mine-" and a base-36 counter, within the song id pattern. */
const MY_SONG_ID = /^mine-[a-z0-9]{1,58}$/;
/** Wait this long after the last change before saving. */
const SAVE_DELAY_MS = 300;

// The shape a saved song must have, read from the schema itself so the two
// can't drift. The browser has no schema validator, so isSong checks it.
const { properties: SONG, $defs: DEFS } = songSchema;
/** @param {{ pattern: string }} rule */
const pattern = (rule) => new RegExp(rule.pattern);
const SONG_ID = pattern(SONG.id);
const NOTE_ID = pattern(DEFS.note.properties.id);
const CHORD_ID = pattern(DEFS.chord.properties.id);
const TONIC = pattern(DEFS.key.properties.tonic);
const PITCH_CLASS = pattern(DEFS.pitchClassName);
/** The chord types a song may use. */
const CHORD_TYPES = new Set(DEFS.chord.properties.type.enum);
const MODES = new Set(DEFS.key.properties.mode.enum);
const BEAT_UNITS = new Set(DEFS.meter.properties.beatUnit.enum);

/**
 * sessionStorage-like access; the getter itself may throw (blocked storage).
 * `removeItem` is optional: without it a forgotten song just stays stored.
 * @typedef {() => Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>} StorageAccess
 */

/**
 * A recorded take as played: each press's pitch and key-down/up times (ms),
 * and when Stop was pressed.
 * @typedef {{ presses: { midi: number, downMs: number, upMs?: number | null }[], endMs: number }} RawTake
 */

/**
 * A saved song and the demo state that goes with it.
 * @typedef {{ song: Song, demoAwaitingGuess: boolean }} SavedSong
 */

/**
 * An integer within a schema rule's bounds.
 * @param {unknown} n
 * @param {{ minimum?: number, maximum?: number }} rule
 */
const isInt = (n, { minimum = -Infinity, maximum = Infinity }) =>
  Number.isInteger(n) &&
  /** @type {number} */ (n) >= minimum &&
  /** @type {number} */ (n) <= maximum;

/**
 * An array no longer than a schema rule allows, every item passing `check`.
 * @param {unknown} list
 * @param {{ maxItems?: number }} rule
 * @param {(item: any) => boolean} check
 */
const isList = (list, { maxItems = Infinity }, check) =>
  Array.isArray(list) && list.length <= maxItems && list.every(check);

/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = (value) => typeof value === "object" && value !== null;

/**
 * The checks song.schema.json makes, in plain JS, with the schema's own
 * patterns, enums, and bounds. validateSong covers the rest.
 * @param {unknown} song
 * @returns {song is Song}
 */
function isSong(song) {
  if (!isObject(song) || song.schemaVersion !== SONG.schemaVersion.const) return false;
  const { id, title, key, meter, tempo, version, notes, chords } = song;
  const meterRules = DEFS.meter.properties;
  const noteRules = DEFS.note.properties;
  return (
    typeof id === "string" &&
    SONG_ID.test(id) &&
    isTitle(title) &&
    isObject(key) &&
    typeof key.tonic === "string" &&
    TONIC.test(key.tonic) &&
    MODES.has(key.mode) &&
    typeof key.provisional === "boolean" &&
    isObject(meter) &&
    isInt(meter.beatsPerBar, meterRules.beatsPerBar) &&
    BEAT_UNITS.has(meter.beatUnit) &&
    isInt(meter.pickupTicks, meterRules.pickupTicks) &&
    typeof meter.provisional === "boolean" &&
    isInt(tempo, SONG.tempo) &&
    (song.swing === undefined || isSwing(song.swing)) &&
    isInt(version, SONG.version) &&
    isList(
      notes,
      SONG.notes,
      (n) =>
        isObject(n) &&
        typeof n.id === "string" &&
        NOTE_ID.test(n.id) &&
        isInt(n.midi, noteRules.midi) &&
        isInt(n.start, noteRules.start) &&
        isInt(n.dur, noteRules.dur) &&
        (n.lyric === undefined || isLyric(n.lyric)),
    ) &&
    isList(
      chords,
      SONG.chords,
      (c) =>
        isObject(c) &&
        typeof c.id === "string" &&
        CHORD_ID.test(c.id) &&
        typeof c.noteId === "string" &&
        NOTE_ID.test(c.noteId) &&
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

    /**
     * Forget a saved song (a discarded recording).
     * @param {string} id
     */
    forget(id) {
      guard(() => storage().removeItem?.(SONG_PREFIX + id), undefined);
    },

    /**
     * The "my songs" index: the ids of the user's own songs, oldest first.
     * Anything that isn't a list of user-song ids reads as empty.
     * @returns {string[]}
     */
    mySongs() {
      const raw = guard(() => storage().getItem(MY_SONGS_KEY), null);
      try {
        const ids = JSON.parse(raw ?? "[]");
        return Array.isArray(ids)
          ? ids.filter((id) => typeof id === "string" && MY_SONG_ID.test(id))
          : [];
      } catch {
        return [];
      }
    },

    /** @param {string[]} ids the user's own songs, oldest first */
    setMySongs(ids) {
      guard(() => storage().setItem(MY_SONGS_KEY, JSON.stringify(ids)), undefined);
    },

    /**
     * Keep a recorded tune's raw take beside it: the key-down and key-up
     * times, so the take can be read again with another feel. A sidecar, not
     * part of the song or its schema.
     * @param {string} id
     * @param {RawTake} take
     */
    saveTake(id, take) {
      guard(() => storage().setItem(TAKE_PREFIX + id, JSON.stringify(take)), undefined);
    },

    /**
     * A recorded tune's raw take, or null if there is none or it doesn't check out.
     * @param {string} id
     * @returns {RawTake | null}
     */
    recallTake(id) {
      const raw = guard(() => storage().getItem(TAKE_PREFIX + id), null);
      if (!raw) return null;
      try {
        const take = JSON.parse(raw);
        const ok =
          isObject(take) &&
          Number.isFinite(take.endMs) &&
          Array.isArray(take.presses) &&
          take.presses.length <= 400 &&
          take.presses.every(
            (/** @type {unknown} */ p) =>
              isObject(p) &&
              isInt(p.midi, 21, 108) &&
              Number.isFinite(p.downMs) &&
              (p.upMs === undefined || p.upMs === null || Number.isFinite(p.upMs)),
          );
        return ok ? take : null;
      } catch {
        return null;
      }
    },

    /** @param {string} id */
    forgetTake(id) {
      guard(() => storage().removeItem?.(TAKE_PREFIX + id), undefined);
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
 * Install song memory on the app's stores: open() recalls saved songs,
 * forget() drops them, the song open last in this tab comes back, and every
 * change after that is saved, debounced. Call once at startup.
 * @param {{
 *   song: SongStore,
 *   ui: ReturnType<typeof import("./ui.js").createUiStore>,
 *   storage: StorageAccess,
 *   fresh: (tune: Song) => void,
 *   stop: () => void,
 * }} options `fresh` sets up a tune with no saved copy (loadDemo); `stop`
 *   silences audio before a saved song takes over
 * @returns {{ flush: () => void, forget: (id: string) => void }} flush saves
 *   any pending change now (page hide); forget is what song.forget() calls
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

  /**
   * Forget a song's saved copy, and cancel a save of it that hasn't run yet,
   * so the copy can't come back after it is forgotten.
   * @param {string} id
   */
  function forget(id) {
    if (pending?.song.id === id) {
      clearTimeout(timer);
      pending = null;
    }
    memory.forget(id);
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
    forget,
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

  return { flush, forget };
}
