/**
 * Every request the eval sends, in order, and the notes the dropdown baseline
 * is judged at. Shared by run.js (which sends them) and score.js (which
 * re-scores a saved run against them), so both read the same songs and points.
 *
 * - a review of every hymn tune in evals/dataset, with the hymnal's printed
 *   chords placed as the student's chart (mode "review");
 * - a review of every demo tune in content/songs, with the dropdown's top
 *   pick placed at each downbeat (mode "review");
 * - "does this work?" about a plausible chord placed at a few downbeats of
 *   each demo tune (mode "question").
 *
 * @import { Chord, ChordSpec, Note, Song } from "../src/types.js"
 * @import { Chart, Repeat } from "./prose.js"
 */

import { readFile } from "node:fs/promises";
import { numeralOf, positionOf } from "../src/theory/index.js";
import { DEMO_TUNES, demoChart, demoPoints, loadDemo } from "./dataset/demos.js";
import { loadTunes } from "./dataset/derive.js";
import { barsOf, findRepeats } from "./prose.js";
import { checkQuestion, evalRequest, evalSnapshot } from "./request.js";

const root = new URL("../", import.meta.url);
/** @param {string} path */
export const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

/**
 * One request to send. `song` carries the chords the request shows the
 * tutor: the student's chart for a review, only the placed chord for a
 * check. `placed`, `bar`, and `beat`: the chord a check asks about and
 * where (null for a review). `bars`: the bars the song has. `repeats`: the
 * repeats code finds in its melody. `chart`: the chords shown, by bar and
 * beat.
 * @typedef {{
 *   tune: string,
 *   kind: "review" | "check",
 *   mode: "review" | "question",
 *   song: Song,
 *   placed: ChordSpec | null,
 *   bar: number | null,
 *   beat: number | null,
 *   bars: Set<number>,
 *   repeats: Repeat[],
 *   chart: Chart,
 *   body: object,
 * }} Job
 */

/**
 * A note the baseline is judged at: a check's note, on the bare melody, and
 * the chord placed there.
 * @typedef {{ melody: Song, note: Note, placed: ChordSpec }} BaselinePoint
 */

/**
 * A job's identity within a run, for matching a saved reply to it.
 * @param {{ tune: string, kind: string, bar: number | null, beat: number | null }} j
 */
export const jobKey = (j) => `${j.tune}|${j.kind}|${j.bar ?? ""}|${j.beat ?? ""}`;

/**
 * The chords placed in a song, by bar and beat.
 * @param {Song} song
 * @returns {Chart}
 */
function chartOf(song) {
  return song.chords.map((c) => {
    const note = /** @type {Note} */ (song.notes.find((n) => n.id === c.noteId));
    const { bar, beat } = positionOf(note.start, song.meter);
    return { bar, beat, chord: { root: c.root, type: c.type } };
  });
}

/**
 * A review of a song with a chart.
 * @param {string} tune
 * @param {Song} song
 * @param {Chord[]} chords the student's chart
 * @returns {Job}
 */
function review(tune, song, chords) {
  const snapshot = evalSnapshot(song, chords);
  const charted = { ...song, chords };
  return {
    tune,
    kind: "review",
    mode: "review",
    song: charted,
    placed: null,
    bar: null,
    beat: null,
    bars: barsOf(snapshot),
    repeats: findRepeats(snapshot),
    chart: chartOf(charted),
    body: evalRequest(snapshot, "review"),
  };
}

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
  /** The baseline's notes, by tune: the checks' notes. */
  /** @type {Map<string, BaselinePoint[]>} */
  const points = new Map();
  for (const tune of await loadTunes()) {
    /** @type {Song} */
    const song = await readJson(`evals/dataset/songs/${tune.id}.json`);
    tunes.push(tune);
    jobs.push(review(tune.id, song, song.chords));
    points.set(tune.id, []);
  }
  for (const id of DEMO_TUNES) {
    const song = await loadDemo(id);
    tunes.push({
      id,
      title: song.title,
      case: "Demo tune: no reference, judged for plausibility.",
    });
    const melody = { ...song, chords: [] };
    jobs.push(review(id, melody, demoChart(melody)));
    /** @type {BaselinePoint[]} */
    const picks = [];
    for (const { note, placed } of demoPoints(song)) {
      const { bar, beat } = positionOf(note.start, melody.meter);
      const chords = [{ id: "c1", noteId: note.id, ...placed }];
      const snapshot = evalSnapshot(song, chords);
      const withPlaced = { ...melody, chords };
      picks.push({ melody, note, placed });
      jobs.push({
        tune: id,
        kind: "check",
        mode: "question",
        song: withPlaced,
        placed,
        bar,
        beat,
        bars: barsOf(snapshot),
        repeats: findRepeats(snapshot),
        chart: chartOf(withPlaced),
        body: evalRequest(
          snapshot,
          "question",
          checkQuestion(numeralOf(placed, song.key), bar, beat),
        ),
      });
    }
    points.set(id, picks);
  }
  return { tunes, jobs, points };
}
