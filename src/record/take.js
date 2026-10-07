/**
 * Record mode's pure core: key presses captured while recording become a
 * song. No DOM, audio, or store.
 *
 * A take is a list of presses, each a pitch with its key-down and key-up
 * times. It is played into the one melody line, so it is made monophonic
 * first (a later onset cuts the earlier note off), then guessRhythm turns the
 * times into ticks and a tempo.
 *
 * @import { Song } from "../types.js"
 */

import { guessRhythm, ticksPerBar } from "../theory/index.js";
import {
  DEFAULT_TEMPO,
  MAX_NOTES,
  MAX_TEMPO,
  MAX_TITLE_CHARS,
  MIN_TEMPO,
} from "../store/songLimits.js";

/** The song's note limit (and the tutor snapshot's): a take stops here. */
export const MAX_TAKE_NOTES = MAX_NOTES;

/** Every recorded tune's id starts with this, so the picker can tell them from demos. */
export const USER_TUNE_PREFIX = "mine-";

/**
 * One captured press. `upMs` is undefined while the key is still down.
 * @typedef {{ midi: number, downMs: number, upMs?: number }} Press
 */

/** @param {string} id */
export const isUserTune = (id) => id.startsWith(USER_TUNE_PREFIX);

/**
 * A fresh id for a recorded tune, from the time it was made: short, sortable,
 * and inside the song schema's pattern.
 * @param {number} nowMs
 * @param {Iterable<string>} [taken] ids already in use
 */
export function newTuneId(nowMs, taken = []) {
  const used = new Set(taken);
  let n = Math.floor(nowMs);
  while (used.has(USER_TUNE_PREFIX + n.toString(36))) n++;
  return USER_TUNE_PREFIX + n.toString(36);
}

/**
 * The title a new take is offered: "My tune 1", "My tune 2", and so on,
 * skipping any the user already has.
 * @param {Iterable<string>} titles the user's tunes' titles
 */
export function nextTitle(titles) {
  const used = new Set([...titles].map((t) => t.trim().toLowerCase()));
  let n = 1;
  while (used.has(`my tune ${n}`)) n++;
  return `My tune ${n}`;
}

/**
 * A typed title, cleaned for the song: whitespace collapsed, trimmed, cut to
 * the schema's bound by code point. Blank keeps `fallback`.
 * @param {string} raw
 * @param {string} fallback
 */
export function cleanTitle(raw, fallback) {
  const title = Array.from(raw.replace(/\s+/g, " ").trim()).slice(0, MAX_TITLE_CHARS).join("");
  return title || fallback;
}

/**
 * Make a take monophonic: in onset order, a press still held when the next
 * starts is cut off there. A press still down when the take stops ends at
 * `endMs`.
 * @param {Press[]} presses
 * @param {number} endMs
 * @returns {{ midi: number, downMs: number, upMs: number }[]}
 */
export function monophonic(presses, endMs) {
  const sorted = [...presses].sort((a, b) => a.downMs - b.downMs);
  return sorted.map((press, i) => {
    const next = sorted[i + 1];
    let upMs = press.upMs ?? endMs;
    if (next && upMs > next.downMs) upMs = next.downMs;
    return { midi: press.midi, downMs: press.downMs, upMs: Math.max(upMs, press.downMs) };
  });
}

/**
 * The tempo a detected beat implies, rounded and kept in the schema's range.
 * @param {number} beatMs
 */
export function tempoFor(beatMs) {
  const bpm = Math.round(60000 / beatMs);
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Number.isFinite(bpm) ? bpm : DEFAULT_TEMPO));
}

/**
 * A take's notes in ticks and its tempo. Slipped onsets (two keys pressed
 * together) merge into one note, as guessRhythm decides.
 * @param {Press[]} presses at most `limit`; extras are left out
 * @param {number} endMs when the take stopped, or now while it runs
 * @param {{ running?: boolean, feel?: import("../theory/rhythm.js").Feel, beatMs?: number, limit?: number }} [options]
 *   `running`: the take hasn't stopped, so a tapped last note shows one beat
 *   instead of growing to now; `feel`: the player's Straight or Swing, or
 *   "auto" (the guess); `beatMs`: the tune's beat, for a phrase recorded onto
 *   it (read against that beat rather than a new guess); `limit`: the most
 *   presses kept (MAX_TAKE_NOTES, or what a phrase has room for)
 * @returns {{ notes: { midi: number, start: number, dur: number }[], tempo: number, swing: boolean }}
 *   `swing`: the take reads as swung (most eighth pairs were, or the player said so)
 */
export function takeNotes(
  presses,
  endMs,
  { running = false, feel = "auto", beatMs, limit = MAX_TAKE_NOTES } = {},
) {
  const events = monophonic(presses.slice(0, limit), endMs);
  if (events.length === 0) return { notes: [], tempo: DEFAULT_TEMPO, swing: false };
  const read = guessRhythm(events, running ? { feel, beatMs } : { endMs, feel, beatMs });
  const { notes, dropped, swing } = read;
  const kept = events.filter((_, i) => !dropped.includes(i));
  return {
    notes: notes.map((n, i) => ({ midi: kept[i].midi, start: n.start, dur: n.dur })),
    tempo: tempoFor(read.beatMs),
    swing,
  };
}

/**
 * The beat of a tune at `tempo`, in ms: what a phrase recorded onto it is
 * read against.
 * @param {number} tempo
 */
export const beatMsAt = (tempo) => 60000 / tempo;

/**
 * Where a phrase recorded onto a tune starts: the first bar line at or after
 * the end of its last note (Matthew's call). Phrases mostly start on a
 * downbeat, so each new one lines up with the bars, and the rest before it
 * reads as the breath between phrases.
 * @param {{ start: number, dur: number }[]} notes the notes the phrase follows
 * @param {import("../types.js").Meter} meter
 */
export function phraseStart(notes, meter) {
  const end = notes.reduce((max, n) => Math.max(max, n.start + n.dur), 0);
  const bar = ticksPerBar(meter);
  const pickup = meter.pickupTicks;
  if (end <= pickup) return end === 0 ? 0 : pickup;
  return pickup + Math.ceil((end - pickup) / bar) * bar;
}

/**
 * How many presses a phrase has room for: the note limit is the whole
 * tune's, so a phrase gets what the notes it joins leave.
 * @param {number} kept how many notes stay in the tune beside the phrase
 */
export const phraseRoom = (kept) => Math.max(0, MAX_TAKE_NOTES - kept);

/**
 * One phrase's raw take, and the ids of the notes it made (absent on a take
 * saved before phrases, which is the whole tune).
 * @typedef {import("../store/persist.js").RawPhrase} RawPhrase
 * @typedef {import("../store/persist.js").RawTake} RawTake
 */

/**
 * A tune's raw take as its phrases, oldest first.
 * @param {RawTake} raw
 * @returns {RawPhrase[]}
 */
export function phrasesOf(raw) {
  const { later = [], ...first } = raw;
  return [first, ...later];
}

/**
 * Phrases back into the raw take kept beside the tune. The first phrase is
 * the take's own fields, so a take of one phrase is the shape it always was.
 * @param {RawPhrase[]} phrases at least one
 * @returns {RawTake}
 */
export function packPhrases([first, ...later]) {
  return later.length > 0 ? { ...first, later } : { ...first };
}

/**
 * The phrases still in the tune, each with the ids of its notes there. A
 * phrase none of whose notes are left (an Undo took it back) is not. A take
 * from before phrases owns every note.
 * @param {RawPhrase[]} phrases
 * @param {{ notes: { id: string }[] }} song
 * @returns {{ phrase: RawPhrase, ids: string[] }[]}
 */
export function livePhrases(phrases, song) {
  const present = new Set(song.notes.map((n) => n.id));
  return phrases.flatMap((phrase) => {
    const ids = phrase.ids ? phrase.ids.filter((id) => present.has(id)) : [...present];
    return ids.length > 0 ? [{ phrase, ids }] : [];
  });
}

/**
 * Read a tune's phrases again with one feel (Feel: Straight or Swing): the
 * first sets the beat, tempo and swing, as a single take does; each later one
 * is read against that beat and starts on the first beat after the notes
 * before it. Each phrase keeps its own timing, so a pause between phrases
 * never becomes a rest.
 * @param {RawPhrase[]} phrases at least one
 * @param {{ feel: import("../theory/rhythm.js").Feel, meter: import("../types.js").Meter }} options
 * @returns {{ notes: { midi: number, start: number, dur: number }[][], tempo: number, swing: boolean }}
 *   `notes`: each phrase's notes, in ticks from the start of the tune
 */
export function readPhrases(phrases, { feel, meter }) {
  /** @type {{ midi: number, start: number, dur: number }[][]} */
  const notes = [];
  let tempo = DEFAULT_TEMPO;
  let swing = false;
  let used = 0;
  for (const [i, phrase] of phrases.entries()) {
    const at = phraseStart(notes.flat(), meter);
    const take = takeNotes(toPresses(phrase.presses), phrase.endMs, {
      feel,
      ...(i > 0 ? { beatMs: beatMsAt(tempo) } : {}),
      limit: phraseRoom(used),
    });
    if (i === 0) ({ tempo, swing } = take);
    notes.push(take.notes.map((n) => ({ ...n, start: n.start + at })));
    used += take.notes.length;
  }
  return { notes, tempo, swing };
}

/**
 * Stored presses as presses: a missing release (stored as null) is undefined.
 * @param {RawPhrase["presses"]} stored
 * @returns {Press[]}
 */
export function toPresses(stored) {
  return stored.map(({ midi, downMs, upMs }) => ({
    midi,
    downMs,
    ...(Number.isFinite(upMs) ? { upMs: /** @type {number} */ (upMs) } : {}),
  }));
}

/** The swing a swung take plays back with: triplet swing, about 2:1. */
export const RECORDED_SWING = 2;

/**
 * A recorded tune: 4/4 with no pickup, the tempo from the take, and the key
 * provisional until the key question finds home: the key the number row was
 * in when the take was armed (C by default), so every press of the take maps
 * a degree to the same pitch. Note ids are n1, n2, …
 * A take whose eighth pairs were mostly swung is marked to play back swung
 * (the notation stays straight eighths).
 * @param {{ id: string, title: string, notes: { midi: number, start: number, dur: number }[], tempo: number, swing?: boolean, key?: import("../types.js").Key }} take
 * @returns {Song}
 */
export function recordedSong({ id, title, notes, tempo, swing = false, key }) {
  return {
    ...(swing ? { swing: RECORDED_SWING } : {}),
    schemaVersion: 1,
    id,
    title,
    key: key ? { ...key, provisional: true } : { tonic: "C", mode: "major", provisional: true },
    meter: { beatsPerBar: 4, beatUnit: 4, pickupTicks: 0, provisional: true },
    tempo,
    version: 0,
    notes: notes.map((n, i) => ({ id: `n${(i + 1).toString(36)}`, ...n })),
    chords: [],
  };
}
