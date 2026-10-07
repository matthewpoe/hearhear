import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ode from "../../content/songs/ode-to-joy.json" with { type: "json" };
import stJames from "../../content/songs/st-james-infirmary.json" with { type: "json" };
import { rankKeys } from "../../src/theory/index.js";

/** @param {{ key: { tonic: string, mode: string } }} r */
const name = (r) => `${r.key.tonic} ${r.key.mode}`;

describe("rankKeys", () => {
  it("ranks all 24 keys once each, best first", () => {
    const ranked = rankKeys(ode.notes);
    assert.equal(ranked.length, 24);
    assert.equal(new Set(ranked.map(name)).size, 24);
    for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score >= ranked[i].score);
  });

  it("puts D major in Ode to Joy's top three", () => {
    const top = rankKeys(ode.notes).slice(0, 3).map(name);
    assert.ok(top.includes("D major"), top.join(", "));
  });

  it("puts E minor in St. James Infirmary's top three, ahead of its relative major", () => {
    const ranked = rankKeys(stJames.notes).map(name);
    assert.ok(ranked.slice(0, 3).includes("E minor"), ranked.slice(0, 3).join(", "));
    assert.ok(ranked.indexOf("E minor") < ranked.indexOf("G major"));
  });

  it("annotates out-of-scale notes without dropping the key", () => {
    // A blue note: Ode's held E in bar 4 bent down to an Eb.
    const blue = ode.notes.map((n) => (n.id === "ne" ? { ...n, midi: 63 } : n));
    const ranked = rankKeys(blue);
    const dMajor = ranked.find((r) => name(r) === "D major");
    assert.deepEqual(dMajor?.outOfScale, [{ noteId: "ne", pitch: "Eb4" }]);
    assert.ok(ranked.slice(0, 3).includes(/** @type {any} */ (dMajor)));
  });

  it("finds nothing out of scale in a tune that stays in its key", () => {
    const dMajor = rankKeys(ode.notes).find((r) => name(r) === "D major");
    assert.deepEqual(dMajor?.outOfScale, []);
  });

  it("accepts minor's raised leading tone as in the key", () => {
    const withLeadingTone = [...stJames.notes, { id: "n1c", midi: 75, start: 384, dur: 12 }];
    const eMinor = rankKeys(withLeadingTone).find((r) => name(r) === "E minor");
    assert.deepEqual(eMinor?.outOfScale, []);
  });

  it("offers candidates, not verdicts, before any notes", () => {
    const ranked = rankKeys([]);
    assert.equal(ranked.length, 24);
    assert.ok(ranked.every((r) => r.score === 0 && r.key.provisional));
  });
});
