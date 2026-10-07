/**
 * Record mode: capture what the user plays into a tune of their own.
 *
 * Arm with `record()`; the first note played (number row or on-screen piano,
 * through liveNotes) starts the clock and makes the tune; `stop()` ends the
 * take. While it runs, the take is shown on the staff as it grows: each note
 * reloads the tune with the rhythm guessed so far. After a take the tune is
 * named (`name`), and can be recorded again or discarded:
 * - Record again replaces the tune's notes in one undoable step, so Undo
 *   brings the earlier take back.
 * - Discard takes a tune off the shelf and goes back to what was open before
 *   it was recorded; `undoDiscard` restores it.
 *
 * Stores and inputs are passed in, so the flow runs in Node tests.
 *
 * @import { Song } from "../types.js"
 * @import { SongStore } from "../store/song.js"
 * @import { Shelf } from "./shelf.js"
 * @import { NoteEvent } from "../input/liveNotes.js"
 * @import { Press } from "./take.js"
 */

import { createReadable } from "../lib/readable.js";
import { emptySong } from "../store/song.js";
import {
  MAX_TAKE_NOTES,
  cleanTitle,
  isUserTune,
  newTuneId,
  nextTitle,
  recordedSong,
  takeNotes,
} from "./take.js";

/**
 * - status: "idle"; "armed" (waiting for the first note); "recording";
 *   "naming" (the title field is open, after a take or to rename).
 * - startedAtMs: when the first note was played, on the `now` clock.
 * - notes: notes captured in this take so far.
 * - capped: the take stopped at the note limit.
 * - afterTake: the naming follows a take just recorded (not a rename).
 * - discarded: the title of a tune just discarded, while Undo is offered.
 * @typedef {{
 *   status: "idle" | "armed" | "recording" | "naming",
 *   startedAtMs: number,
 *   notes: number,
 *   capped: boolean,
 *   afterTake: boolean,
 *   discarded: string | null,
 * }} RecorderState
 */

/** @type {RecorderState} */
const IDLE = {
  status: "idle",
  startedAtMs: 0,
  notes: 0,
  capped: false,
  afterTake: false,
  discarded: null,
};

/**
 * @param {{
 *   song: SongStore,
 *   ui: { update: (patch: Partial<import("../store/ui.js").UiState>) => void },
 *   shelf: Shelf,
 *   onNoteEvent: (listener: (event: NoteEvent) => void) => () => void,
 *   open: (tune: Song) => void,
 *   stopAudio: () => void,
 *   now?: () => number,
 *   wallClock?: () => number,
 *   schedule?: (run: () => void) => void,
 * }} deps `open` opens a demo the way the song picker does (song.open);
 *   `now` is the clock liveNotes stamps events with; `wallClock` names new
 *   tunes; `schedule` batches staff updates (a frame in the browser)
 */
export function createRecorder({
  song,
  ui,
  shelf,
  onNoteEvent,
  open,
  stopAudio,
  now = () => performance.now(),
  wallClock = () => Date.now(),
  schedule = (run) => requestAnimationFrame(run),
}) {
  const state = createReadable(IDLE);
  const set = (/** @type {Partial<RecorderState>} */ patch) =>
    state.set({ ...state.get(), ...patch });

  /** The presses of the take running now. @type {Press[]} */
  let presses = [];
  /** @type {(() => void) | null} */
  let unlisten = null;
  /** Re-recording an existing tune: its song before the take. @type {Song | null} */
  let base = null;
  /** The new tune's id and title, for a take that makes one. */
  let fresh = { id: "", title: "" };
  /** What was open before the newest recorded tune, for Discard. @type {Song | null} */
  let previous = null;
  /** The newest recorded tune's id: Discard goes back to `previous` only from it. */
  let newestId = "";
  /** A discarded tune, while Undo is offered. @type {{ song: Song, at: number } | null} */
  let discarded = null;
  let previewQueued = false;

  /** Clear a view left by the last song: the same reset a fresh demo gets. */
  function resetView() {
    ui.update({
      demoAwaitingGuess: false,
      selectedNoteId: null,
      playheadNoteId: null,
      keyboardLights: { source: null, chord: null, melody: [] },
    });
  }

  /**
   * Put the take on the staff: a new tune, or the tune being recorded again.
   * @param {{ notes: { midi: number, start: number, dur: number }[], tempo: number }} take
   */
  function show(take) {
    if (base) {
      const { notes } = recordedSong({ id: base.id, title: base.title, ...take });
      song.load({ ...base, notes, tempo: take.tempo, chords: [] });
    } else {
      song.load(recordedSong({ ...fresh, ...take }));
    }
  }

  function preview() {
    previewQueued = false;
    if (state.get().status !== "recording") return;
    show(takeNotes(presses, now(), { running: true }));
  }

  /** @param {number} atMs */
  function begin(atMs) {
    const current = song.get();
    if (!base) {
      previous = current.notes.length > 0 ? current : null;
      const ids = shelf.list.get().map((t) => t.id);
      fresh = {
        id: newTuneId(wallClock(), ids),
        title: nextTitle(shelf.list.get().map((t) => t.title)),
      };
      newestId = fresh.id;
    }
    set({ status: "recording", startedAtMs: atMs, notes: 0 });
  }

  /** @param {NoteEvent} event */
  function onNote(event) {
    const { status } = state.get();
    if (event.type === "off") {
      if (status !== "recording") return;
      const open = presses.findLast((p) => p.midi === event.midi && p.upMs === undefined);
      if (open) open.upMs = event.atMs;
      queuePreview();
      return;
    }
    // Chord-row chords sound along but aren't the melody.
    if (event.source.startsWith("chord:")) return;
    if (status === "armed") {
      begin(event.atMs);
      presses.push({ midi: event.midi, downMs: event.atMs });
      set({ notes: 1 });
      // The first note makes the tune at once, so it is on the shelf and the staff.
      preview();
      if (!base) shelf.add(song.get());
      resetView();
      return;
    }
    if (status !== "recording") return;
    presses.push({ midi: event.midi, downMs: event.atMs });
    set({ notes: presses.length });
    if (presses.length >= MAX_TAKE_NOTES) {
      set({ capped: true });
      stop();
      return;
    }
    queuePreview();
  }

  function queuePreview() {
    if (previewQueued) return;
    previewQueued = true;
    schedule(preview);
  }

  function listen() {
    unlisten?.();
    unlisten = onNoteEvent(onNote);
  }

  function quiet() {
    unlisten?.();
    unlisten = null;
  }

  /**
   * Arm a take. `again` records over the open tune (one of the user's own);
   * otherwise the take makes a new tune.
   * @param {{ again?: boolean }} [options]
   */
  function record({ again = false } = {}) {
    if (state.get().status === "armed" || state.get().status === "recording") return;
    const current = song.get();
    base = again && isUserTune(current.id) ? current : null;
    presses = [];
    discarded = null;
    stopAudio();
    listen();
    state.set({ ...IDLE, status: "armed" });
  }

  /** End the take; before its first note, put the recorder away. */
  function stop() {
    const { status } = state.get();
    if (status === "armed") {
      quiet();
      state.set(IDLE);
      return;
    }
    if (status !== "recording") return;
    quiet();
    const take = takeNotes(presses, now());
    if (base) {
      const before = base;
      base = null;
      // Back to the old take, then the new one in one undoable step.
      song.load(before);
      song.replaceTake(
        before.notes.map((n) => n.id),
        take.notes,
        { tempo: take.tempo },
      );
    } else {
      show(take);
    }
    shelf.track(song.get());
    set({ status: "naming", afterTake: true });
  }

  /**
   * Name the open tune. A blank title keeps the one it has.
   * @param {string} raw what the user typed
   */
  function name(raw) {
    const current = song.get();
    if (isUserTune(current.id)) song.rename(cleanTitle(raw, current.title));
    set({ status: "idle", afterTake: false, capped: false });
  }

  /** Open the title field on one of the user's tunes, to rename it. */
  function rename() {
    if (!isUserTune(song.get().id) || state.get().status !== "idle") return;
    set({ status: "naming", afterTake: false, capped: false, discarded: null });
  }

  /** Close the title field without renaming. */
  function keepName() {
    if (state.get().status === "naming") set({ status: "idle", afterTake: false, capped: false });
  }

  /**
   * Open one of the user's tunes from the shelf.
   * @param {string} id
   */
  function openTune(id) {
    const copy = shelf.get(id);
    if (!copy || song.get().id === id) return;
    stopAudio();
    song.load(copy);
    resetView();
  }

  /** @param {Song | null} tune */
  function reopen(tune) {
    stopAudio();
    if (tune && isUserTune(tune.id) && shelf.has(tune.id)) {
      song.load(/** @type {Song} */ (shelf.get(tune.id)));
      resetView();
    } else if (tune && !isUserTune(tune.id)) {
      open(tune);
    } else {
      song.load(emptySong());
      resetView();
    }
  }

  /** Discard the open tune (one of the user's own), with Undo offered. */
  function discard() {
    const current = song.get();
    if (!isUserTune(current.id)) return;
    if (state.get().status === "armed" || state.get().status === "recording") return;
    const back = current.id === newestId ? previous : null;
    previous = null;
    newestId = "";
    // Switch first: leaving the tune saves it, and only then is it forgotten.
    reopen(back);
    discarded = shelf.remove(current.id);
    state.set({ ...IDLE, discarded: current.title });
  }

  /** Bring back the tune just discarded. */
  function undoDiscard() {
    if (!discarded) return;
    const { song: tune, at } = discarded;
    discarded = null;
    shelf.add(tune, at);
    state.set(IDLE);
    openTune(tune.id);
  }

  /** Put away the Undo offer. */
  function dismiss() {
    discarded = null;
    set({ discarded: null });
  }

  // Another song opened from elsewhere (the guided tour, the picker) ends
  // what the recorder was doing with this one.
  let shownId = song.get().id;
  song.subscribe((current) => {
    if (current.id === shownId) return;
    shownId = current.id;
    const { status } = state.get();
    if (status === "recording" && current.id !== (base?.id ?? fresh.id)) {
      quiet();
      base = null;
      state.set(IDLE);
    } else if (status === "naming") {
      set({ status: "idle", afterTake: false, capped: false });
    } else if (state.get().discarded) {
      // Undo is offered only until the next song opens.
      dismiss();
    }
  });

  return {
    subscribe: state.subscribe,
    get: state.get,
    record,
    stop,
    name,
    rename,
    keepName,
    openTune,
    discard,
    undoDiscard,
    dismiss,
  };
}

/** @typedef {ReturnType<typeof createRecorder>} Recorder */
