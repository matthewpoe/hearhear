import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lessonFixture, onAskRequest, requestAsk } from "../../src/tutor/requests.js";

describe("ask requests", () => {
  it("reach the listening panel until it stops listening", () => {
    /** @type {unknown[]} */
    const heard = [];
    const request = /** @type {const} */ ({ question: "Why?", mode: "question", fixture: "" });
    assert.equal(requestAsk(request), false, "nobody listening");
    const stop = onAskRequest((r) => heard.push(r));
    assert.equal(requestAsk(request), true);
    stop();
    assert.equal(requestAsk(request), false);
    assert.deepEqual(heard, [request]);
  });
});

describe("lessonFixture", () => {
  const review = /** @type {const} */ ({ fixture: "lesson:ode-review", mode: "review" });

  it("sends the step's lesson only with a request of the mode it was recorded for", () => {
    assert.equal(lessonFixture(review, "review"), "lesson:ode-review");
    // A review lesson never answers a typed question, nor a question lesson a review.
    assert.equal(lessonFixture(review, "question"), "");
    assert.equal(lessonFixture({ fixture: "lesson:ode-ending", mode: "question" }, "review"), "");
  });

  it("is empty outside a lesson step", () => {
    assert.equal(lessonFixture(null, "review"), "");
  });
});
