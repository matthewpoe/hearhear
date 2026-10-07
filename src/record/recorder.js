/**
 * Record mode: capture what the user plays into a tune of their own.
 *
 * Arm with `record()`; the first note played (number row or on-screen piano,
 * through liveNotes) starts the clock and makes the tune; `stop()` ends the
 * take. While it runs, the take is shown on the staff as it grows: each note
 * reloads the tune with the rhythm guessed so far. After its first take the
 * tune is named (`name`). A tune is built a phrase at a time:
 * - Record next phrase (`record({ phrase: "next" })`) adds a take from the
 *   bar line after the tune's last note, read against the tune's beat.
 * - Redo that phrase (`record({ phrase: "redo" })`) records the latest phrase
 *   again, from where it started; the phrases before it stay as they are.
 *   With one phrase it is Start over.
 * - Start over (`record({ again: true })`) replaces all the tune's notes.
 * Each is one undoable step, so Undo brings the earlier notes back. While a
 * take runs it is shown as a draft under its own id (the tune's id and
 * "-take"), so the saved tune and its chords are never touched until Stop;
 * a take cut short leaves them as they were. The raw take keeps each
 * phrase's own timing and the ids of the notes it made, so Feel can read the
 * whole tune again and the record bar can show which notes the latest
 * phrase is.
 * - Discard takes a tune off the shelf and goes back to what was open before
 *   it was recorded (or another of the user's tunes, or the first demo);
 *   `undoDiscard` restores it, every phrase included.
 *
 * Stores and inputs are passed in, so the flow runs in Node tests.
 *
 * @import { Song } from "../types.js"
 * @import { SongStore } from "../store/song.js"
 * @import { Shelf } from "./shelf.js"
 * @import { NoteEvent } from "../input/liveNotes.js"
 * @import { Press, RawPhrase } from "./take.js"
 */

import { createReadable } from "../lib/readable.js";
import { emptySong } from "../store/song.js";
import {
  MAX_TAKE_NOTES,
  RECORDED_SWING,
  beatMsAt,
  cleanTitle,
  isUserTune,
  livePhrases,
  newTuneId,
  nextTitle,
  packPhrases,
  phraseRoom,
  phraseStart,
  phrasesOf,
  readPhrases,
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
 * - phrase: the take armed or running is a phrase onto the tune (next, or
 *   the latest again), not a whole take.
 * - added: how many notes the phrase just recorded added, until the next
 *   thing the recorder does.
 * @typedef {{
 *   status: "idle" | "armed" | "recording" | "naming",
 *   startedAtMs: number,
 *   notes: number,
 *   capped: boolean,
 *   afterTake: boolean,
 *   discarded: string | null,
 *   phrase: boolean,
 *   added: number,
 * }} RecorderState
 */

/**
 * A phrase take's plan, fixed when it is armed: the notes it replaces (Redo
 * that phrase; none for the next phrase), the tick it starts on, how many
 * presses it has room for, the phrases it keeps, and how it is read (the
 * tune's beat and feel).
 * @typedef {{
 *   replacing: Set<string>,
 *   at: number,
 *   room: number,
 *   kept: RawPhrase[],
 *   beatMs: number,
 *   feel: "auto" | "swing",
 * }} PhrasePlan
 */

/** @type {RecorderState} */
const IDLE = {
  status: "idle",
  startedAtMs: 0,
  notes: 0,
  capped: false,
  afterTake: false,
  discarded: null,
  phrase: false,
  added: 0,
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
 *   fallback?: () => Song | null,
 * }} deps `open` opens a demo the way the song picker does (song.open);
 *   `now` is the clock liveNotes stamps events with; `wallClock` names new
 *   tunes; `schedule` batches staff updates (a frame in the browser);
 *   `fallback` is the demo Discard opens when the user has no other tune to
 *   go back to (none: the empty welcome)
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
  fallback = () => null,
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
  /** A phrase onto `base`, rather than the whole tune again. @type {PhrasePlan | null} */
  let plan = null;
  /** The new tune's id and title, for a take that makes one. */
  let fresh = { id: "", title: "" };
  /** What was open before the newest recorded tune, for Discard. @type {Song | null} */
  let previous = null;
  /** The newest recorded tune's id: Discard goes back to `previous` only from it. */
  let newestId = "";
  /**
   * A discarded tune, while Undo is offered, with what Discard needs to go
   * back again after an Undo.
   * @type {{ song: Song, at: number, take: import("../store/persist.js").RawTake | null, previous: Song | null, newestId: string } | null}
   */
  let discarded = null;
  let previewQueued = false;
  /** The recorder is switching songs itself, mid-take: not another song opening. */
  let switching = false;

  /** A re-take's draft id: the tune's own, plus "-take". @param {Song} tune */
  const draftId = (tune) => `${tune.id}-take`;

  /**
   * Forget a re-take's draft, and any save of it still pending, so it can't
   * come back. A tune on the shelf is never a draft and is left alone.
   * @param {string} id
   */
  const forgetDraft = (id) => {
    if (!shelf.has(id)) song.forget(id);
  };

  /** Clear a view left by the last song: the same reset a fresh demo gets. */
  function resetView() {
    ui.update({
      demoAwaitingGuess: false,
      selectedNoteId: null,
      playheadNoteId: null,
      keyboardLights: { source: null, chord: null, melody: [] },
    });
  }

  /** How the running take is read: a phrase against the tune's beat and feel. */
  const reading = () =>
    plan ? { beatMs: plan.beatMs, feel: plan.feel, limit: plan.room } : { limit: MAX_TAKE_NOTES };

  /**
   * Put the take on the staff: a new tune, or the tune being recorded again.
   * A phrase shows with the notes it keeps, from where it starts, its notes
   * numbered past the tune's own so their ids never clash.
   * @param {{ notes: { midi: number, start: number, dur: number }[], tempo: number }} take
   */
  function show(take) {
    if (base && plan) {
      const { replacing, at } = plan;
      const kept = base.notes.filter((n) => !replacing.has(n.id));
      const keptIds = new Set(kept.map((n) => n.id));
      let counter = Math.max(0, ...base.notes.map((n) => parseInt(n.id.slice(1), 36) || 0));
      const added = take.notes.map((n) => ({
        id: `n${(++counter).toString(36)}`,
        ...n,
        start: n.start + at,
      }));
      song.load({
        ...base,
        id: draftId(base),
        notes: [...kept, ...added],
        chords: base.chords.filter((c) => keptIds.has(c.noteId)),
      });
    } else if (base) {
      const { notes } = recordedSong({ id: base.id, title: base.title, ...take });
      song.load({ ...base, id: draftId(base), notes, tempo: take.tempo, chords: [] });
    } else {
      song.load(recordedSong({ ...fresh, ...take }));
    }
  }

  function preview() {
    previewQueued = false;
    if (state.get().status !== "recording") return;
    show(takeNotes(presses, now(), { running: true, ...reading() }));
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
    // The note limit is the whole tune's: a phrase stops at what it has room for.
    if (presses.length >= reading().limit) {
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
   * The open tune's phrases that are still in it, oldest first, each with the
   * ids of its notes there and the tick it starts on. Empty for a demo, or a
   * tune whose take isn't known.
   * @param {Song} [current]
   * @returns {{ phrase: RawPhrase, ids: string[], start: number }[]}
   */
  function phrases(current = song.get()) {
    const raw = isUserTune(current.id) ? shelf.take(current.id) : null;
    if (!raw) return [];
    return livePhrases(phrasesOf(raw), current).map((live) => {
      const ids = new Set(live.ids);
      const first = current.notes.find((n) => ids.has(n.id));
      return { ...live, start: first?.start ?? 0 };
    });
  }

  /**
   * Plan a phrase take onto the open tune: after its last note ("next"), or
   * in place of its latest phrase ("redo"). Null when it can't be one: no
   * take known, no room left for a next phrase, or one phrase to redo (that
   * is the whole tune again).
   * @param {Song} current
   * @param {"next" | "redo"} mode
   * @returns {PhrasePlan | null}
   */
  function planPhrase(current, mode) {
    const live = phrases(current);
    if (live.length === 0 || (mode === "redo" && live.length < 2)) return null;
    const replacing = new Set(mode === "redo" ? /** @type {string[]} */ (live.at(-1)?.ids) : []);
    const kept = mode === "redo" ? live.slice(0, -1) : live;
    const stays = current.notes.filter((n) => !replacing.has(n.id));
    const room = phraseRoom(stays.length);
    if (room === 0) return null;
    return {
      replacing,
      at: phraseStart(stays, current.meter),
      room,
      // Each kept phrase keeps only its notes still in the tune.
      kept: kept.map(({ phrase, ids }) => ({ ...phrase, ids })),
      beatMs: beatMsAt(current.tempo),
      // A swung tune's phrase is read swung; otherwise the guess reads it.
      feel: (current.swing ?? 1) > 1 ? "swing" : "auto",
    };
  }

  /**
   * Arm a take. `again` records over the open tune (one of the user's own);
   * `phrase` records onto it: "next" after its last note, "redo" its latest
   * phrase again (with one phrase, the same as `again`). Otherwise the take
   * makes a new tune.
   * @param {{ again?: boolean, phrase?: "next" | "redo" | null }} [options]
   */
  function record({ again = false, phrase = null } = {}) {
    if (state.get().status === "armed" || state.get().status === "recording") return;
    const current = song.get();
    const mine = isUserTune(current.id);
    plan = phrase && mine ? planPhrase(current, phrase) : null;
    // A next phrase that can't be planned isn't a re-take: nothing is armed.
    if (phrase === "next" && !plan) return;
    base = (again || phrase) && mine ? current : null;
    presses = [];
    discarded = null;
    stopAudio();
    listen();
    state.set({ ...IDLE, status: "armed", phrase: plan !== null });
  }

  /** End the take; before its first note, put the recorder away. */
  function stop() {
    const { status } = state.get();
    if (status === "armed") {
      quiet();
      base = null;
      plan = null;
      state.set(IDLE);
      return;
    }
    if (status !== "recording") return;
    quiet();
    const takeEnd = now();
    const read = reading();
    const take = takeNotes(presses, takeEnd, read);
    const played = { presses: presses.slice(0, read.limit).map((p) => ({ ...p })), endMs: takeEnd };
    /** The tune's phrases before this take's. @type {RawPhrase[]} */
    let kept = [];
    /** @type {string[]} */
    let ids;
    const phrased = plan;
    if (base) {
      const before = base;
      base = null;
      plan = null;
      // Back to the tune as it was, then the take in one undoable step.
      switching = true;
      try {
        song.load(before);
      } finally {
        switching = false;
      }
      if (phrased) {
        kept = phrased.kept;
        ids = song.replaceTake(
          [...phrased.replacing],
          take.notes.map((n) => ({ ...n, start: n.start + phrased.at })),
        );
      } else {
        ids = song.replaceTake(
          before.notes.map((n) => n.id),
          take.notes,
          { tempo: take.tempo },
        );
      }
      forgetDraft(draftId(before));
    } else {
      show(take);
      ids = song.get().notes.map((n) => n.id);
    }
    shelf.track(song.get());
    // The raw take stays beside the tune, a phrase at a time, so Feel can
    // read it all again and the bar knows which notes the latest phrase is.
    shelf.saveTake(song.get().id, packPhrases([...kept, { ...played, ids }]));
    // A phrase onto a named tune needs no name: the bar offers the next one.
    if (phrased) set({ status: "idle", phrase: false, added: ids.length });
    else set({ status: "naming", afterTake: true });
  }

  /**
   * Name the open tune. A blank title keeps the one it has.
   * @param {string} raw what the user typed
   */
  function name(raw) {
    const current = song.get();
    if (isUserTune(current.id)) song.rename(cleanTitle(raw, current.title));
    set({ status: "idle", afterTake: false, capped: false, added: 0 });
  }

  /** Open the title field on one of the user's tunes, to rename it. */
  function rename() {
    if (!isUserTune(song.get().id) || state.get().status !== "idle") return;
    set({ status: "naming", afterTake: false, capped: false, discarded: null, added: 0 });
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

  /**
   * Open a tune to go back to: one of the user's own still on the shelf, or a
   * demo. Anything else (a tune since discarded, or none) opens the user's
   * most recent other tune, else `fallback` (the first demo), so a Discard
   * never leaves the staff empty when there is something to show.
   * @param {Song | null} tune
   * @param {string} leaving the tune being discarded, never reopened
   */
  function reopen(tune, leaving) {
    stopAudio();
    const other = shelf.list.get().findLast((t) => t.id !== leaving);
    if (tune && isUserTune(tune.id) && tune.id !== leaving && shelf.has(tune.id)) {
      song.load(/** @type {Song} */ (shelf.get(tune.id)));
      resetView();
    } else if (tune && !isUserTune(tune.id)) {
      open(tune);
    } else if (other) {
      song.load(/** @type {Song} */ (shelf.get(other.id)));
      resetView();
    } else {
      const demo = fallback();
      if (demo) open(demo);
      else {
        song.load(emptySong());
        resetView();
      }
    }
  }

  /** Discard the open tune (one of the user's own), with Undo offered. */
  function discard() {
    const current = song.get();
    if (!isUserTune(current.id)) return;
    if (state.get().status === "armed" || state.get().status === "recording") return;
    const back = current.id === newestId ? previous : null;
    const wasNewest = current.id === newestId ? { previous: back, newestId: current.id } : null;
    previous = null;
    newestId = "";
    // Switch first: leaving the tune saves it, and only then is it forgotten.
    reopen(back, current.id);
    const removed = shelf.remove(current.id);
    discarded = removed && { ...removed, previous: null, newestId: "", ...wasNewest };
    state.set({ ...IDLE, discarded: current.title });
  }

  /** Bring back the tune just discarded. */
  function undoDiscard() {
    if (!discarded) return;
    const { song: tune, at, take } = discarded;
    // Discarding it again goes back where the first Discard did.
    previous = discarded.previous;
    newestId = discarded.newestId;
    discarded = null;
    shelf.add(tune, at, take);
    state.set(IDLE);
    openTune(tune.id);
  }

  /**
   * Read the open tune's take again with the player's feel: Swing evens its
   * long-short pairs (and marks it swung), Straight reads them literally.
   * Every phrase still in the tune is read again with one beat, the first
   * phrase's (readPhrases), and its notes keep their ids. One undoable step;
   * chords on the old notes go, as with Start over.
   * @param {"straight" | "swing"} feel
   * @returns {boolean} whether the tune had a take to read
   */
  function reread(feel) {
    const current = song.get();
    const raw = shelf.take(current.id);
    if (!raw) return false;
    const live = phrases(current).map(({ phrase }) => phrase);
    // No phrase left in the tune (an Undo past its take): read the take as kept.
    const read = live.length > 0 ? live : phrasesOf(raw);
    const take = readPhrases(read, { feel, meter: current.meter });
    const notes = take.notes.flatMap((phrase, i) =>
      phrase.map((n, j) => {
        const id = read[i].ids?.[j];
        return id ? { ...n, id } : n;
      }),
    );
    const ids = song.replaceTake(
      current.notes.map((n) => n.id),
      notes,
      { tempo: take.tempo, swing: take.swing ? RECORDED_SWING : null },
    );
    let at = 0;
    const kept = read.map((phrase, i) => {
      const count = take.notes[i].length;
      at += count;
      return { ...phrase, ids: ids.slice(at - count, at) };
    });
    shelf.saveTake(current.id, packPhrases(kept));
    return true;
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
    if (switching) return;
    const { status } = state.get();
    if (status === "recording" && current.id !== (base ? draftId(base) : fresh.id)) {
      // The take is dropped. A re-take only ever wrote its draft, so the saved
      // tune is as it was; the draft is forgotten.
      quiet();
      if (base) forgetDraft(draftId(base));
      base = null;
      plan = null;
      state.set(IDLE);
    } else if (status === "naming") {
      set({ status: "idle", afterTake: false, capped: false, added: 0 });
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
    reread,
    phrases,
  };
}

/** @typedef {ReturnType<typeof createRecorder>} Recorder */
