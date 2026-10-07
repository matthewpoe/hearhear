/**
 * The song store: the one source of truth for staff, audio, lead sheet, and
 * tutor. It changes only through the named actions below. Each action validates
 * the result, bumps `version`, and pushes the previous song onto the undo stack,
 * so every edit is undoable and tutor suggestions can detect staleness.
 *
 * Songs are immutable values: actions build a new song rather than mutating.
 *
 * `open(tune)` is how the song chooser switches songs: it brings back the copy
 * this tab saved for that tune, if there is one. src/store/persist.js does the
 * saving and installs the hooks open() uses (`setOpenHooks`).
 *
 * @import { Key, Meter, Note, ChordSpec, Song } from "../types.js"
 */

import { createReadable } from "../lib/readable.js";
import { rekeySong, transposeSong, ticksPerBar } from "../theory/index.js";

const MAX_NOTES = 400;
/** The piano's range, A0 to C8: every note's MIDI lies within it. */
export const MIN_MIDI = 21;
export const MAX_MIDI = 108;
const UNDO_LIMIT = 200;

/** @returns {Song} An empty song in provisional C major, 4/4. */
export function emptySong() {
  return {
    schemaVersion: 1,
    id: "untitled",
    title: "Untitled",
    key: { tonic: "C", mode: "major", provisional: true },
    meter: { beatsPerBar: 4, beatUnit: 4, pickupTicks: 0, provisional: true },
    tempo: 96,
    version: 0,
    notes: [],
    chords: [],
  };
}

/** The schema's bound on a note's `lyric` syllable. */
export const MAX_LYRIC_CHARS = 40;

/**
 * A note's optional syllable: a non-empty string within the schema's bound.
 * @param {unknown} lyric
 */
export function isLyric(lyric) {
  return typeof lyric === "string" && lyric.length >= 1 && lyric.length <= MAX_LYRIC_CHARS;
}

/**
 * A song's optional swing ratio: a number from 1 (straight) to 3.
 * @param {unknown} swing
 */
export function isSwing(swing) {
  return typeof swing === "number" && Number.isFinite(swing) && swing >= 1 && swing <= 3;
}

/**
 * Check the invariants JSON Schema can't express. Throws on the first violation.
 * @param {Song} song
 */
export function validateSong(song) {
  const fail = (/** @type {string} */ why) => {
    throw new RangeError(`Invalid song: ${why}`);
  };
  if (song.notes.length > MAX_NOTES) fail(`more than ${MAX_NOTES} notes`);
  if (song.meter.pickupTicks >= ticksPerBar(song.meter)) fail("pickup is a full bar or longer");
  if (song.swing !== undefined && !isSwing(song.swing)) fail("swing isn't a ratio from 1 to 3");
  const ids = new Set();
  let end = 0;
  for (const note of song.notes) {
    if (ids.has(note.id)) fail(`duplicate note id ${note.id}`);
    ids.add(note.id);
    if (!Number.isInteger(note.start) || !Number.isInteger(note.dur) || note.dur < 1) {
      fail(`note ${note.id} has non-integer or empty timing`);
    }
    if (note.midi < MIN_MIDI || note.midi > MAX_MIDI) fail(`note ${note.id} is off the piano`);
    if (note.start < end) fail(`note ${note.id} overlaps the note before it`);
    if (note.lyric !== undefined && !isLyric(note.lyric)) {
      fail(`note ${note.id} has a lyric that isn't 1–${MAX_LYRIC_CHARS} characters`);
    }
    end = note.start + note.dur;
  }
  const anchored = new Set();
  for (const chord of song.chords) {
    if (!ids.has(chord.noteId)) fail(`chord ${chord.id} sits on missing note ${chord.noteId}`);
    if (anchored.has(chord.noteId)) fail(`two chords on note ${chord.noteId}`);
    anchored.add(chord.noteId);
  }
}

/**
 * The highest id counter in a song. Ids are a prefix plus a base-36 counter
 * ("n1a", "c3") so they stay short and deterministic in tests.
 * @param {Song} song
 */
function highestId(song) {
  return [...song.notes, ...song.chords].reduce(
    (max, { id }) => Math.max(max, parseInt(id.slice(1), 36) || 0),
    0,
  );
}

/**
 * Shift every note that starts after `afterTick` by `delta` ticks.
 * @param {Note[]} notes
 * @param {number} afterTick
 * @param {number} delta
 */
function ripple(notes, afterTick, delta) {
  return notes.map((n) => (n.start > afterTick ? { ...n, start: n.start + delta } : n));
}

/**
 * How open() reaches this tab's saved songs. src/store/persist.js installs
 * them at startup; until then open() is load().
 * @typedef {{
 *   recall: (id: string) => { song: Song, restore: () => void } | null,
 *   fresh: (tune: Song) => void,
 * }} OpenHooks
 * - recall: this tab's saved copy of a song, already validated, plus a
 *   function that restores the view state saved with it (the demo flag). Null
 *   when there is none. Never throws.
 * - fresh: set up a tune with no saved copy (for a demo: provisional C, labels
 *   hidden; see loadDemo in src/finding/demoTunes.js).
 */

/** @param {Note[]} notes */
const byStart = (notes) => [...notes].sort((a, b) => a.start - b.start);

/**
 * Create a song store. The app uses the `song` singleton below; tests and the
 * eval harness create their own.
 * @param {Song} [initial]
 */
export function createSongStore(initial = emptySong()) {
  validateSong(initial);
  const store = createReadable(initial);
  const history = createReadable({ canUndo: false, canRedo: false });
  /** @type {Song[]} */
  let past = [];
  /** @type {Song[]} */
  let future = [];
  // Monotonic, so a deleted note's id is never reissued: selection and open
  // dropdowns anchor by id and must not jump to a different note.
  let lastId = highestId(initial);
  const newId = (/** @type {"n" | "c"} */ prefix) => prefix + (++lastId).toString(36);

  const publishHistory = () =>
    history.set({ canUndo: past.length > 0, canRedo: future.length > 0 });

  /**
   * Apply an edit as one undoable step. The version always moves forward,
   * even on undo, so suggestions made against an older song read as stale.
   * @param {(song: Song) => Song} edit
   */
  function commit(edit) {
    const current = store.get();
    const next = { ...edit(current), version: current.version + 1 };
    validateSong(next);
    past = [...past, current].slice(-UNDO_LIMIT);
    future = [];
    store.set(next);
    publishHistory();
    return next;
  }

  /**
   * Replace the song. Clears undo history.
   * @param {Song} song
   */
  function load(song) {
    const next = { ...song, version: store.get().version + 1 };
    validateSong(next);
    lastId = Math.max(lastId, highestId(next));
    past = [];
    future = [];
    store.set(next);
    publishHistory();
  }

  /** @type {OpenHooks} */
  let openHooks = { recall: () => null, fresh: load };

  /** @param {string} id */
  const noteById = (id) => {
    const note = store.get().notes.find((n) => n.id === id);
    if (!note) throw new RangeError(`No note ${id}`);
    return note;
  };

  return {
    subscribe: store.subscribe,
    /** Current song, for non-reactive callers (event handlers, evals). */
    get: store.get,
    /** `{ canUndo, canRedo }`, as its own store so toolbar buttons can react. */
    history: { subscribe: history.subscribe },

    /**
     * Replace the song (demo tune, new document). Clears undo history.
     * @param {Song} song
     */
    load,

    /**
     * Open a tune from the song chooser. If this tab saved a copy of `tune.id`
     * (the user's key guess, chords, notes, and the demo flag with it), that
     * copy comes back; otherwise the tune starts fresh, as a demo does today.
     * Undo history is per page and starts empty either way, as with load.
     * @param {Song} tune
     */
    open(tune) {
      const saved = openHooks.recall(tune.id);
      if (!saved) {
        openHooks.fresh(tune);
        return;
      }
      load(saved.song);
      saved.restore();
    },

    /**
     * Persistence hook: install how open() recalls saved songs and starts
     * fresh ones. Called once, by src/store/persist.js.
     * @param {OpenHooks} hooks
     */
    setOpenHooks(hooks) {
      openHooks = hooks;
    },

    /**
     * Add a melody note. Throws if it would overlap another note.
     * @param {{ midi: number, start: number, dur: number }} note
     * @returns {string} the new note's id
     */
    addNote({ midi, start, dur }) {
      const id = newId("n");
      commit((s) => ({ ...s, notes: byStart([...s.notes, { id, midi, start, dur }]) }));
      return id;
    },

    /**
     * Change a note's length. Later notes ripple by the difference, so halving
     * never leaves a stray rest and doubling never overlaps.
     * @param {string} noteId
     * @param {number} dur ticks
     */
    setDuration(noteId, dur) {
      const note = noteById(noteId);
      commit((s) => ({
        ...s,
        notes: ripple(s.notes, note.start, dur - note.dur).map((n) =>
          n.id === noteId ? { ...n, dur } : n,
        ),
      }));
    },

    /**
     * Turn a note into a rest: the note and its chord go, the time stays.
     * @param {string} noteId
     */
    makeRest(noteId) {
      noteById(noteId);
      commit((s) => ({
        ...s,
        notes: s.notes.filter((n) => n.id !== noteId),
        chords: s.chords.filter((c) => c.noteId !== noteId),
      }));
    },

    /**
     * Delete a note and its chord; later notes ripple back to close the gap.
     * @param {string} noteId
     */
    deleteNote(noteId) {
      const note = noteById(noteId);
      commit((s) => ({
        ...s,
        notes: ripple(
          s.notes.filter((n) => n.id !== noteId),
          note.start,
          -note.dur,
        ),
        chords: s.chords.filter((c) => c.noteId !== noteId),
      }));
    },

    /**
     * Move one note up or down an octave.
     * @param {string} noteId
     * @param {1 | -1} direction
     */
    moveOctave(noteId, direction) {
      noteById(noteId);
      commit((s) => ({
        ...s,
        notes: s.notes.map((n) => (n.id === noteId ? { ...n, midi: n.midi + 12 * direction } : n)),
      }));
    },

    /**
     * Change one note's pitch (a forgotten sharp or flat), keeping its timing
     * and its chord. Refuses a pitch off the piano.
     * @param {string} noteId
     * @param {number} midi
     */
    setPitch(noteId, midi) {
      noteById(noteId);
      if (!Number.isInteger(midi) || midi < MIN_MIDI || midi > MAX_MIDI) {
        throw new RangeError(`MIDI ${midi} is off the piano (${MIN_MIDI}–${MAX_MIDI})`);
      }
      commit((s) => ({
        ...s,
        notes: s.notes.map((n) => (n.id === noteId ? { ...n, midi } : n)),
      }));
    },

    /**
     * Place, change, or (with null) remove the chord on a note's onset.
     * @param {string} noteId
     * @param {ChordSpec | null} chord
     */
    setChord(noteId, chord) {
      noteById(noteId);
      commit((s) => {
        const others = s.chords.filter((c) => c.noteId !== noteId);
        if (!chord) return { ...s, chords: others };
        const existing = s.chords.find((c) => c.noteId === noteId);
        const id = existing?.id ?? newId("c");
        return { ...s, chords: [...others, { id, noteId, root: chord.root, type: chord.type }] };
      });
    },

    /**
     * Re-key: change only the key hypothesis. What the user heard never changes;
     * every degree, numeral, and color re-derives.
     * @param {Key} key
     */
    rekey(key) {
      commit((s) => rekeySong(s, key));
    },

    /**
     * Transpose: move melody, chords, and tonic together. Same numbers, new sound.
     * @param {number} semitones ±12 is the octave control
     * @param {{ prefer?: "sharps" | "flats" }} [options] which enharmonic key
     *   to name the new tonic with (F# or Gb major), passed to transposeSong
     */
    transpose(semitones, { prefer } = {}) {
      commit((s) => transposeSong(s, semitones, { prefer }));
    },

    /**
     * Rename the song (a recorded tune's title). Refuses a blank title or one
     * over the schema's 120 characters.
     * @param {string} title
     */
    rename(title) {
      const length = Array.from(title).length;
      if (title.trim() !== title || length < 1 || length > 120) {
        throw new RangeError("A title is 1 to 120 characters, trimmed");
      }
      if (title === store.get().title) return;
      commit((s) => ({ ...s, title }));
    },

    /**
     * Swing on or off, as one undoable step (so Undo brings a song's own
     * ratio back). On gives triplet swing (2); off drops the field, so the
     * song plays straight. Notation never changes; only the "Swing" marking
     * follows.
     * @param {boolean} on
     */
    setSwing(on) {
      if (on === (store.get().swing ?? 1) > 1) return;
      commit((s) => {
        if (on) return { ...s, swing: 2 };
        const straight = { ...s };
        delete straight.swing;
        return straight;
      });
    },

    /**
     * Re-bar: change only the meter hypothesis. Bar lines move; notes do not.
     * @param {Meter} meter
     */
    rebar(meter) {
      commit((s) => ({ ...s, meter }));
    },

    /**
     * Replace a run of notes in one undoable step: record mode's take, and the
     * one-key revert of a take to plain quarter notes. Removed notes' chords and
     * syllables go too; a take is new notes, so they carry no syllables.
     * @param {string[]} noteIds notes to remove
     * @param {{ midi: number, start: number, dur: number }[]} notes notes to add
     * @param {{ tempo?: number }} [options] `tempo`: the take's tempo, set in
     *   the same step (a re-recorded tune)
     * @returns {string[]} the new notes' ids
     */
    replaceTake(noteIds, notes, { tempo } = {}) {
      const removed = new Set(noteIds);
      const ids = notes.map(() => newId("n"));
      commit((s) => ({
        ...s,
        tempo: tempo ?? s.tempo,
        notes: byStart([
          ...s.notes.filter((n) => !removed.has(n.id)),
          ...notes.map(({ midi, start, dur }, i) => ({ id: ids[i], midi, start, dur })),
        ]),
        chords: s.chords.filter((c) => !removed.has(c.noteId)),
      }));
      return ids;
    },

    undo() {
      const previous = past.at(-1);
      if (!previous) return;
      const current = store.get();
      past = past.slice(0, -1);
      future = [...future, current];
      store.set({ ...previous, version: current.version + 1 });
      publishHistory();
    },

    redo() {
      const next = future.at(-1);
      if (!next) return;
      const current = store.get();
      future = future.slice(0, -1);
      past = [...past, current];
      store.set({ ...next, version: current.version + 1 });
      publishHistory();
    },
  };
}

/** @typedef {ReturnType<typeof createSongStore>} SongStore */

/** The app's song. */
export const song = createSongStore();
