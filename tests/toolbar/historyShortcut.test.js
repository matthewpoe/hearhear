import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyShortcut } from "../../src/toolbar/historyShortcut.js";

/**
 * An element-shaped stand-in: its own tag, and closest() that finds itself.
 * @param {string} tagName
 * @param {string} [type]
 */
const element = (tagName, type) => ({
  tagName,
  type,
  closest: (/** @type {string} */ selector) =>
    selector.split(", ").includes(tagName.toLowerCase()) ? element(tagName, type) : null,
});

/** @param {Record<string, unknown>} over */
const press = (over) =>
  /** @type {any} */ ({
    key: "z",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { tagName: "BODY" },
    ...over,
  });

describe("historyShortcut", () => {
  it("maps Cmd-Z and Ctrl-Z to undo, with Shift to redo", () => {
    assert.equal(historyShortcut(press({ metaKey: true })), "undo");
    assert.equal(historyShortcut(press({ ctrlKey: true })), "undo");
    assert.equal(historyShortcut(press({ metaKey: true, shiftKey: true, key: "Z" })), "redo");
  });

  it("ignores plain z, Alt, and other keys", () => {
    assert.equal(historyShortcut(press({})), null);
    assert.equal(historyShortcut(press({ metaKey: true, altKey: true })), null);
    assert.equal(historyShortcut(press({ metaKey: true, key: "y" })), null);
  });

  it("leaves text fields their own undo", () => {
    assert.equal(historyShortcut(press({ metaKey: true, target: element("TEXTAREA") })), null);
    const input = element("INPUT", "text");
    assert.equal(historyShortcut(press({ ctrlKey: true, target: input })), null);
  });

  it("still undoes with a radio, checkbox, or button focused", () => {
    for (const target of [
      element("INPUT", "radio"),
      element("INPUT", "checkbox"),
      element("BUTTON"),
    ])
      assert.equal(historyShortcut(press({ metaKey: true, target })), "undo");
  });
});
