import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { loadOn, saveOn, loadDismissed, saveDismissed } from "../../src/callouts/memory.js";

function fakeStorage() {
  /** @type {Map<string, string>} */
  const items = new Map();
  return {
    getItem: (/** @type {string} */ key) => items.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => void items.set(key, value),
  };
}

const blocked = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

describe("beginner tips memory", () => {
  it("is on by default and remembers being turned off", () => {
    const storage = fakeStorage();
    assert.equal(loadOn(storage), true);
    saveOn(false, storage);
    assert.equal(loadOn(storage), false);
    saveOn(true, storage);
    assert.equal(loadOn(storage), true);
  });

  it("remembers dismissed tips", () => {
    const storage = fakeStorage();
    assert.deepEqual([...loadDismissed(storage)], []);
    saveDismissed(new Set(["welcome", "staff"]), storage);
    assert.deepEqual([...loadDismissed(storage)], ["welcome", "staff"]);
  });

  it("treats unreadable dismissals as none", () => {
    const warn = mock.method(console, "warn", () => {});
    const storage = fakeStorage();
    storage.setItem("hearhear.callouts.dismissed", "{not json");
    assert.deepEqual([...loadDismissed(storage)], []);
    storage.setItem("hearhear.callouts.dismissed", '{"a":1}');
    assert.deepEqual([...loadDismissed(storage)], []);
    storage.setItem("hearhear.callouts.dismissed", '["a", 2]');
    assert.deepEqual([...loadDismissed(storage)], ["a"]);
    warn.mock.restore();
  });

  it("still works, on by default, when storage is blocked", () => {
    const warn = mock.method(console, "warn", () => {});
    assert.equal(loadOn(blocked), true);
    assert.deepEqual([...loadDismissed(blocked)], []);
    assert.doesNotThrow(() => saveOn(false, blocked));
    assert.doesNotThrow(() => saveDismissed(new Set(["a"]), blocked));
    assert.equal(warn.mock.callCount(), 4);
    warn.mock.restore();
  });
});
