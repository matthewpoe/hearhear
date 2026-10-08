import { test } from "node:test";
import assert from "node:assert/strict";
import { Ajv2020 } from "ajv/dist/2020.js";
import requestSchema from "../../contracts/tutor-request.schema.json" with { type: "json" };
import {
  CHECK_POINTS,
  DEMO_TUNES,
  demoChart,
  demoPoints,
  loadDemo,
} from "../../evals/dataset/demos.js";
import { buildJobs } from "../../evals/jobs.js";
import { baselineChord, plausible } from "../../evals/metrics.js";
import { validateSong } from "../../src/store/song.js";
import { letterOf, numeralOf, positionOf } from "../../src/theory/index.js";
import { evalRequest } from "../../evals/request.js";

const validate = new Ajv2020({ strict: false }).compile(requestSchema);
const { tunes, jobs } = await buildJobs();

test("every request meets the contract and never carries the title", () => {
  for (const job of jobs) {
    const title = /** @type {string} */ (tunes.find((t) => t.id === job.tune)?.title);
    assert.ok(validate(job.body), `${job.tune} ${job.kind}: ${JSON.stringify(validate.errors)}`);
    const body = /** @type {any} */ (job.body);
    assert.equal("title" in body.snapshot, false, job.tune);
    assert.equal(JSON.stringify(body).includes(title), false, job.tune);
    assert.doesNotThrow(() => validateSong(job.song), `${job.tune} ${job.kind}`);
  }
});

test("a review shows the whole chart and asks no question", () => {
  const reviews = jobs.filter((j) => j.kind === "review");
  assert.equal(reviews.length, tunes.length, "one review a tune");
  for (const job of reviews) {
    const body = /** @type {any} */ (job.body);
    assert.equal(body.mode, "review");
    assert.equal("question" in body, false);
    const shown = body.snapshot.bars.flatMap((/** @type {any} */ b) => b.chords).length;
    assert.equal(shown, job.song.chords.length, job.tune);
    assert.ok(shown > 0, job.tune);
  }
});

test("a demo tune's chart is the dropdown's top pick at every downbeat", async () => {
  for (const id of DEMO_TUNES) {
    const song = await loadDemo(id);
    const melody = { ...song, chords: [] };
    const chart = demoChart(song);
    for (const chord of chart) {
      const note = /** @type {any} */ (song.notes.find((n) => n.id === chord.noteId));
      assert.equal(positionOf(note.start, song.meter).beat, 1, id);
      assert.deepEqual(
        { root: chord.root, type: chord.type },
        baselineChord(melody, chord.noteId),
        id,
      );
    }
  }
});

test("a check carries only the chord asked about, and asks about it", async () => {
  for (const id of DEMO_TUNES) {
    const song = await loadDemo(id);
    const points = demoPoints(song);
    assert.equal(points.length, CHECK_POINTS, id);
    for (const { note, placed } of points) {
      const suggestion = { numeral: numeralOf(placed, song.key), letter: letterOf(placed) };
      assert.ok(plausible(suggestion, { ...song, chords: [] }, note), `${id} placed chord`);
    }
  }
  for (const job of jobs.filter((j) => j.kind === "check")) {
    const body = /** @type {any} */ (job.body);
    assert.equal(body.mode, "question");
    assert.equal(body.snapshot.bars.flatMap((/** @type {any} */ b) => b.chords).length, 1);
    assert.match(body.question, /^Does .+ work under the melody note at bar \d+, beat 1\?$/);
  }
});

test("a question request needs its question", () => {
  const snapshot = /** @type {any} */ (jobs[0].body).snapshot;
  assert.throws(() => evalRequest(snapshot, "question"), /needs its question/);
  assert.deepEqual(Object.keys(evalRequest(snapshot, "review")), ["snapshot", "mode", "history"]);
});
