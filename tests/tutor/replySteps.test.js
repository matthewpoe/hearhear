import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { replySteps } from "../../src/tutor/replySteps.js";

describe("replySteps", () => {
  it("splits the closing numbered steps from the prose", () => {
    const text = "Listen to bar 4.\nThen bar 8.\n\n1. Hover bar 4.\n2. Hover bar 8.\n3. Hum it.";
    assert.deepEqual(replySteps(text), {
      prose: "Listen to bar 4.\nThen bar 8.",
      steps: ["Hover bar 4.", "Hover bar 8.", "Hum it."],
    });
  });

  it("leaves a reply without steps as prose", () => {
    assert.deepEqual(replySteps("Just listen."), { prose: "Just listen.", steps: [] });
  });

  it("keeps numbered lines followed by more prose in the prose", () => {
    const text = "1. First\n2. Second\nAnd then some thoughts.";
    assert.deepEqual(replySteps(text), { prose: text, steps: [] });
  });

  it("allows blank lines between and after the steps", () => {
    assert.deepEqual(replySteps("Prose.\n\n1. One\n\n2. Two\n"), {
      prose: "Prose.",
      steps: ["One", "Two"],
    });
  });

  it("doesn't mistake a numeral or a digit in prose for a step", () => {
    const text = "The tune climbs 3-4-5.\n2 is above home.";
    assert.deepEqual(replySteps(text), { prose: text, steps: [] });
  });

  it("shows a step mid-stream once its number and a space arrive", () => {
    assert.deepEqual(replySteps("Prose.\n\n1. Hov"), { prose: "Prose.", steps: ["Hov"] });
    assert.deepEqual(replySteps("Prose.\n\n1. Hover.\n2"), {
      prose: "Prose.\n\n1. Hover.\n2",
      steps: [],
    });
    assert.deepEqual(replySteps("Prose.\n\n1. Hover.\n2. "), {
      prose: "Prose.",
      steps: ["Hover.", ""],
    });
  });

  it("can be all steps", () => {
    assert.deepEqual(replySteps("1. One\n2. Two"), { prose: "", steps: ["One", "Two"] });
  });
});
