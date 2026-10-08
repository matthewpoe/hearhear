/**
 * Every request the eval sends, in order, and the notes the dropdown baseline
 * is judged at. Shared by run.js (which sends them) and score.js (which
 * re-scores a saved run against them), so both read the same songs and points.
 *
 * - every hymn tune in evals/dataset, at every change point, at every hint
 *   level ("ask": what could go here?);
 * - the demo tunes in content/songs, at a few downbeats, at the comparison
 *   level ("ask"), and at a few others with a plausible chord placed there
 *   ("check": does this work?).
 *
 * @import { ChordSpec, Note, Song } from "../src/types.js"
 */

import { readFile } from "node:fs/promises";
import { numeralOf, positionOf } from "../src/theory/index.js";
import { DEMO_TUNES, demoPoints, loadDemo } from "./dataset/demos.js";
import { loadTunes } from "./dataset/derive.js";
import { evalRequest, evalSnapshot } from "./request.js";

export const LEVELS = /** @type {const} */ (["nudge", "comparison", "answer"]);

const root = new URL("../", import.meta.url);
/** @param {string} path */
export const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

/**
 * One request to send: a note at one hint level. `song` is the melody with no
 * chords; `reference` is the hymnal's chord there (hymn tunes only); `placed`
 * the chord a "check" request asks about.
 * @typedef {{
 *   tune: string,
 *   kind: "ask" | "check",
 *   song: Song,
 *   reference: ChordSpec | null,
 *   placed: ChordSpec | null,
 *   level: (typeof LEVELS)[number],
 *   bar: number,
 *   beat: number,
 *   body: object,
 * }} Job
 */

/**
 * A note the baseline is judged at, on the melody the tutor sees.
 * @typedef {{ melody: Song, note: Note, reference: ChordSpec | null }} BaselinePoint
 */

/**
 * A job's identity within a run, for matching a saved reply to it.
 * @param {{ tune: string, kind: string, level: string, bar: number, beat: number }} j
 */
export const jobKey = (j) => `${j.tune}|${j.kind}|${j.level}|${j.bar}|${j.beat}`;

/**
 * @returns {Promise<{
 *   tunes: { id: string, title: string, case: string }[],
 *   jobs: Job[],
 *   points: Map<string, BaselinePoint[]>,
 * }>}
 */
export async function buildJobs() {
  /** @type {{ id: string, title: string, case: string }[]} */
  const tunes = [];
  /** @type {Job[]} */
  const jobs = [];
  /** The baseline's notes, by tune, in the order the tutor is asked about them. */
  /** @type {Map<string, BaselinePoint[]>} */
  const points = new Map();
  for (const tune of await loadTunes()) {
    /** @type {Song} */
    const song = await readJson(`evals/dataset/songs/${tune.id}.json`);
    tunes.push(tune);
    // The tutor and the baseline both see the melody with no chords: what goes there is the question.
    const melody = { ...song, chords: [] };
    const snapshot = evalSnapshot(song);
    const picks = [];
    for (const chord of song.chords) {
      const note = /** @type {Note} */ (melody.notes.find((n) => n.id === chord.noteId));
      const { bar, beat } = positionOf(note.start, melody.meter);
      picks.push({ melody, note, reference: chord });
      for (const level of LEVELS) {
        const body = evalRequest(snapshot, level, bar, beat);
        jobs.push({
          tune: tune.id,
          kind: "ask",
          song: melody,
          reference: chord,
          placed: null,
          level,
          bar,
          beat,
          body,
        });
      }
    }
    points.set(tune.id, picks);
  }
  for (const id of DEMO_TUNES) {
    const song = await loadDemo(id);
    tunes.push({
      id,
      title: song.title,
      case: "Demo tune: no reference, judged for plausibility.",
    });
    const melody = { ...song, chords: [] };
    const snapshot = evalSnapshot(song);
    const { ask, check } = demoPoints(song);
    const picks = [];
    for (const note of ask) {
      const { bar, beat } = positionOf(note.start, melody.meter);
      picks.push({ melody, note, reference: null });
      const body = evalRequest(snapshot, "comparison", bar, beat);
      jobs.push({
        tune: id,
        kind: "ask",
        song: melody,
        reference: null,
        placed: null,
        level: "comparison",
        bar,
        beat,
        body,
      });
    }
    for (const { note, placed } of check) {
      const { bar, beat } = positionOf(note.start, melody.meter);
      const chord = { id: "c1", noteId: note.id, ...placed };
      const body = evalRequest(
        evalSnapshot(song, [chord]),
        "comparison",
        bar,
        beat,
        numeralOf(placed, song.key),
      );
      jobs.push({
        tune: id,
        kind: "check",
        song: melody,
        reference: null,
        placed,
        level: "comparison",
        bar,
        beat,
        body,
      });
    }
    points.set(id, picks);
  }
  return { tunes, jobs, points };
}
