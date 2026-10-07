import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { onAskRequest, requestAsk } from "../../src/tutor/requests.js";

describe("ask requests", () => {
  it("reach the listening panel until it stops listening", () => {
    /** @type {unknown[]} */
    const heard = [];
    const request = /** @type {const} */ ({ question: "Why?", level: "answer", fixture: "" });
    assert.equal(requestAsk(request), false, "nobody listening");
    const stop = onAskRequest((r) => heard.push(r));
    assert.equal(requestAsk(request), true);
    stop();
    assert.equal(requestAsk(request), false);
    assert.deepEqual(heard, [request]);
  });
});
