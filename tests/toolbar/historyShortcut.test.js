import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyShortcut, isTextField } from "../../src/toolbar/historyShortcut.js";

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
    assert.equal(historyShortcut(press({ metaKey: true, target: { tagName: "TEXTAREA" } })), null);
    const input = { tagName: "INPUT", type: "text" };
    assert.equal(historyShortcut(press({ ctrlKey: true, target: input })), null);
  });
});

describe("isTextField", () => {
  it("counts text inputs, textareas, and editable content, not checkboxes or buttons", () => {
    assert.ok(isTextField(/** @type {any} */ ({ tagName: "INPUT", type: "search" })));
    assert.ok(isTextField(/** @type {any} */ ({ tagName: "DIV", isContentEditable: true })));
    assert.ok(!isTextField(/** @type {any} */ ({ tagName: "INPUT", type: "checkbox" })));
    assert.ok(!isTextField(/** @type {any} */ ({ tagName: "BUTTON" })));
    assert.ok(!isTextField(null));
  });
});
