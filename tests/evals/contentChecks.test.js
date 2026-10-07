import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { hiddenKeyFailures, jsonFiles, keySpoilers } from "../../scripts/contentChecks.js";

test("keySpoilers finds the tonic as a note or chord name, and letter-plus-mode phrases", () => {
  const d = { tonic: "D" };
  assert.deepEqual(keySpoilers("Home is D.", d), ["D"]);
  assert.deepEqual(keySpoilers("Try a D chord, or Dmaj7.", d), ["D", "Dmaj7"]);
  assert.deepEqual(keySpoilers("It sounds like E minor to me.", { tonic: "E" }), ["E", "E minor"]);
  assert.deepEqual(keySpoilers("A minor is home.", { tonic: "A" }), ["A minor"]);
  assert.deepEqual(keySpoilers("Home is B-flat.", { tonic: "Bb" }), ["B-flat"]);
  assert.deepEqual(keySpoilers("Home is A.", { tonic: "A" }), ["A"]);
});

test("keySpoilers lets ordinary words and other notes through", () => {
  const d = { tonic: "D" };
  assert.deepEqual(keySpoilers("Do you hear the phrase settle? Did it rest?", d), []);
  assert.deepEqual(keySpoilers("That D# isn't home, and neither is F#.", d), []);
  assert.deepEqual(keySpoilers("Does the minor feel come from the last note?", d), []);
  assert.deepEqual(keySpoilers("A good place to listen is the end.", { tonic: "A" }), []);
  assert.deepEqual(keySpoilers("Home is B.", { tonic: "Bb" }), []);
  // A sentence-initial article before a mode word is not the key.
  const e = { tonic: "E" };
  assert.deepEqual(keySpoilers("A minor key sounds darker because its third is lowered.", e), []);
  assert.deepEqual(keySpoilers("A major chord can still fit a minor tune.", e), []);
  assert.deepEqual(keySpoilers("A minor third above the tonic gives it color.", d), []);
});

/** @param {string[]} deltas */
const events = (...deltas) => [
  ...deltas.map((delta) => ({ event: "message", data: { delta } })),
  { event: "done", data: {} },
];
/** @param {boolean} hidden */
const request = (hidden) => ({ snapshot: { key: { tonic: "E" }, key_hidden: hidden } });

test("hiddenKeyFailures refuses a hidden-key reply that names the key", () => {
  // The spoiler is split across deltas, as a stream would split it.
  const failures = hiddenKeyFailures("x", request(true), events("Home is E ", "minor, so…"));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /x: the key is hidden, but the reply names it \(E, E minor\)/);
});

test("hiddenKeyFailures passes a clean nudge, and any reply when the key is shown", () => {
  const nudge = events("Listen to the last note. ", "Does it feel like rest?");
  assert.deepEqual(hiddenKeyFailures("x", request(true), nudge), []);
  assert.deepEqual(hiddenKeyFailures("x", request(false), events("Home is E.")), []);
});

test("jsonFiles lets only an optional directory be missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "content-"));
  try {
    const base = pathToFileURL(dir + "/");
    await writeFile(join(dir, "a.json"), "{}");
    await writeFile(join(dir, "notes.md"), "");
    assert.deepEqual(await jsonFiles(base, "./"), ["./a.json"]);
    assert.deepEqual(await jsonFiles(base, "missing/", { optional: true }), []);
    await assert.rejects(jsonFiles(base, "missing/"), { code: "ENOENT" });
    // Optional forgives only absence: a file where the directory should be still fails.
    await assert.rejects(jsonFiles(base, "a.json/", { optional: true }), { code: "ENOTDIR" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
