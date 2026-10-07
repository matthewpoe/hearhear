import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canRetry, failureText } from "../../src/tutor/failures.js";

describe("failureText", () => {
  it("tells an unanswerable question apart from a garbled reply", () => {
    assert.equal(
      failureText("unanswerable"),
      "The tutor couldn't answer that one. Try asking another way.",
    );
    assert.equal(failureText("invalid_output"), "The tutor's answer came back garbled.");
  });

  it("gives an unknown code the generic line", () => {
    assert.equal(failureText("nope"), "Something went wrong talking to the tutor.");
  });

  it("lets an unanswerable question be asked again", () => {
    assert.equal(canRetry("unanswerable"), true);
  });

  it("asks for a moment, and a retry, when the tutor is busy", () => {
    assert.equal(
      failureText("busy"),
      "The tutor is helping someone else right now. Try again in a moment.",
    );
    assert.equal(canRetry("busy"), true);
  });
});
