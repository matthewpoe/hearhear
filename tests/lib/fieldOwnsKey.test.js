import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldOwnsKey } from "../../src/lib/fieldOwnsKey.js";

/**
 * An element-shaped stand-in sitting inside a form field (or none).
 * @param {string | null} field the field tag it sits in: "input", "textarea", "select"
 * @param {string} [type] the input's type
 */
function inside(field, type = "text") {
  const fieldElement = field && { tagName: field.toUpperCase(), type };
  return /** @type {any} */ ({
    tagName: fieldElement ? fieldElement.tagName : "DIV",
    type,
    isContentEditable: false,
    closest: (/** @type {string} */ selector) =>
      field && selector.split(", ").includes(field) ? fieldElement : null,
  });
}

describe("fieldOwnsKey", () => {
  it("gives text fields, selects, and sliders every key", () => {
    for (const target of [
      inside("textarea"),
      inside("input", "text"),
      inside("input", "search"),
      inside("input", "range"),
      inside("select"),
    ]) {
      assert.ok(fieldOwnsKey(target, "Digit1"));
      assert.ok(fieldOwnsKey(target, "ArrowUp"));
      assert.ok(fieldOwnsKey(target, "KeyZ"));
    }
  });

  it("gives a radio or checkbox only its arrows", () => {
    for (const type of ["radio", "checkbox"]) {
      const target = inside("input", type);
      assert.ok(fieldOwnsKey(target, "ArrowLeft"));
      assert.ok(fieldOwnsKey(target, "ArrowDown"));
      assert.ok(!fieldOwnsKey(target, "Digit1"));
      assert.ok(!fieldOwnsKey(target, "KeyZ"));
    }
  });

  it("gives editable content every key", () => {
    const target = { ...inside(null), isContentEditable: true };
    assert.ok(fieldOwnsKey(target, "Digit1"));
  });

  it("leaves everything else, and non-elements, to the app", () => {
    assert.ok(!fieldOwnsKey(inside(null), "Digit1"));
    assert.ok(!fieldOwnsKey(null, "Digit1"));
    assert.ok(!fieldOwnsKey(/** @type {any} */ ({ tagName: "BODY" }), "KeyZ"));
    // The window itself, when nothing has focus.
    assert.ok(!fieldOwnsKey(/** @type {any} */ ({ addEventListener() {} }), "Digit1"));
  });
});
