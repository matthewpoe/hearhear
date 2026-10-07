import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOUBLE_LEFT_MS, transportAction } from "../../src/staff/transportKeys.js";

/** @param {Partial<Parameters<typeof transportAction>[0]>} over */
const press = (over) =>
  transportAction({
    code: "Space",
    modified: false,
    fieldOwnsKey: false,
    focus: "none",
    menuOpen: false,
    recording: false,
    playing: false,
    paused: false,
    sinceLastLeftMs: Infinity,
    ...over,
  });

describe("transportAction: Space", () => {
  it("plays from the top when stopped, pauses when playing, resumes when paused", () => {
    assert.equal(press({}), "play-top");
    assert.equal(press({ playing: true }), "pause");
    assert.equal(press({ paused: true }), "resume");
  });

  it("goes to the transport after a mouse click left focus on a control", () => {
    assert.equal(press({ focus: "control-mouse" }), "play-top");
  });

  it("is left to a control with keyboard focus, and to a staff note", () => {
    assert.equal(press({ focus: "control-keyboard" }), null);
    assert.equal(press({ focus: "staff-note" }), null);
  });

  it("is left alone in a field, with a menu open, while recording, or with a modifier", () => {
    assert.equal(press({ fieldOwnsKey: true }), null);
    assert.equal(press({ menuOpen: true, playing: true }), null);
    assert.equal(press({ recording: true }), null);
    assert.equal(press({ modified: true }), null);
  });
});

describe("transportAction: Left", () => {
  const left = (/** @type {Partial<Parameters<typeof transportAction>[0]>} */ over) =>
    press({ code: "ArrowLeft", playing: true, ...over });

  it("goes back to the bar's start while playing, and to the top on a quick second press", () => {
    assert.equal(left({}), "bar-start");
    assert.equal(left({ sinceLastLeftMs: DOUBLE_LEFT_MS - 50 }), "top");
    assert.equal(left({ sinceLastLeftMs: DOUBLE_LEFT_MS + 50 }), "bar-start");
  });

  it("does nothing while stopped or paused, leaving the staff's navigation", () => {
    assert.equal(left({ playing: false }), null);
    assert.equal(left({ playing: false, paused: true }), null);
  });

  it("is left to a staff note, a radio's arrows, and an open menu", () => {
    assert.equal(left({ focus: "staff-note" }), null);
    assert.equal(left({ fieldOwnsKey: true }), null);
    assert.equal(left({ menuOpen: true }), null);
  });

  it("ignores other keys", () => {
    assert.equal(press({ code: "ArrowRight", playing: true }), null);
    assert.equal(press({ code: "KeyP" }), null);
  });
});
