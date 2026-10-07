import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { askTutor, TutorError } from "../../src/tutor/client.js";

/** @type {any} */
const REQUEST = { snapshot: {}, hint_level: "nudge", question: null, history: [] };

/** Make the next fetch answer with `response`. @param {Response} response */
function answer(response) {
  mock.method(globalThis, "fetch", async () => response);
}

/** @param {string} text an SSE body */
const stream = (text) =>
  new Response(text, { status: 200, headers: { "Content-Type": "text/event-stream" } });

/** Ask, expecting a failure, and return its code. */
async function failureCode() {
  try {
    await askTutor(REQUEST, { onDelta: () => {} });
  } catch (error) {
    assert.ok(error instanceof TutorError, `expected a TutorError, got ${error}`);
    return error.code;
  }
  assert.fail("the exchange should have failed");
}

describe("askTutor", () => {
  beforeEach(() => mock.method(console, "error", () => {}));
  afterEach(() => mock.restoreAll());

  it("streams deltas and resolves with the suggestions event", async () => {
    const suggestions = { hint_level: "nudge", suggestions: [], snapshot_version: 3, dropped: 0 };
    answer(
      stream(
        'event: message\ndata: {"delta":"Listen "}\n\n' +
          'event: message\ndata: {"delta":"to bar 4."}\n\n' +
          `event: suggestions\ndata: ${JSON.stringify(suggestions)}\n\n` +
          "event: done\ndata: {}\n\n",
      ),
    );
    let text = "";
    const reply = await askTutor(REQUEST, { onDelta: (delta) => (text += delta) });
    assert.equal(text, "Listen to bar 4.");
    assert.deepEqual(reply, suggestions);
  });

  describe("an HTTP error", () => {
    it("takes its code from the error envelope first", async () => {
      const body = { error: { code: "over_budget", message: "Out of budget." } };
      answer(Response.json(body, { status: 503 }));
      assert.equal(await failureCode(), "over_budget");
    });

    it("reads a 401 with the access_required envelope as a passphrase prompt, not network", async () => {
      const body = { error: { code: "access_required", message: "Passphrase needed." } };
      answer(Response.json(body, { status: 401 }));
      assert.equal(await failureCode(), "access_required");
    });

    it("reads a 429 with the access_locked envelope as locked, not rate_limited", async () => {
      const body = { error: { code: "access_locked", message: "Too many wrong codes." } };
      answer(Response.json(body, { status: 429 }));
      assert.equal(await failureCode(), "access_locked");
    });

    const BY_STATUS = [
      [413, "too_large"],
      [422, "invalid_request"],
      [429, "rate_limited"],
      [502, "network"],
      [503, "network"],
      [504, "network"],
      [500, "network"],
    ];
    for (const [status, code] of BY_STATUS) {
      it(`falls back on the status without an envelope: ${status} is ${code}`, async () => {
        answer(new Response("<html>Bad gateway</html>", { status: Number(status) }));
        assert.equal(await failureCode(), code);
      });
    }

    it("reads a rate limiter's string error as rate_limited, not garbled", async () => {
      answer(Response.json({ error: "Rate limit exceeded: 10 per 1 minute" }, { status: 429 }));
      assert.equal(await failureCode(), "rate_limited");
    });

    for (const status of [401, 403, 404, 405, 418]) {
      it(`reads a bare ${status} as unreachable, not a garbled answer`, async () => {
        answer(new Response("", { status }));
        assert.equal(await failureCode(), "network");
      });
    }
  });

  describe("the passphrase", () => {
    /** Ask with these options and return the headers the request carried. @param {any} options */
    async function sentHeaders(options) {
      const fetch = mock.method(globalThis, "fetch", async () =>
        stream(
          `event: suggestions\ndata: ${JSON.stringify({ suggestions: [] })}\n\n` +
            "event: done\ndata: {}\n\n",
        ),
      );
      await askTutor(REQUEST, { onDelta: () => {}, ...options });
      return /** @type {any} */ (fetch.mock.calls[0].arguments[1]).headers;
    }

    it("travels as the X-Tutor-Access header", async () => {
      const headers = await sentHeaders({ accessCode: "open sesame" });
      assert.equal(headers["X-Tutor-Access"], "open sesame");
    });

    it("sends no header when there is no code", async () => {
      const headers = await sentHeaders({});
      assert.equal("X-Tutor-Access" in headers, false);
    });
  });

  it("reports a fetch that never reaches the server as network", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });
    assert.equal(await failureCode(), "network");
  });

  it("passes on the stream's error event", async () => {
    answer(
      stream(
        'event: message\ndata: {"delta":"Half"}\n\n' +
          'event: error\ndata: {"code":"upstream","message":"Cut off."}\n\n' +
          "event: done\ndata: {}\n\n",
      ),
    );
    assert.equal(await failureCode(), "upstream");
  });

  for (const data of ["null", "3", '"text"', "[]", "{not json"]) {
    it(`calls event data of ${data} garbled, not a broken connection`, async () => {
      answer(stream(`event: message\ndata: ${data}\n\nevent: done\ndata: {}\n\n`));
      assert.equal(await failureCode(), "protocol");
    });
  }

  it("calls a stream that ends before done a protocol failure", async () => {
    answer(stream('event: message\ndata: {"delta":"Half"}\n\n'));
    assert.equal(await failureCode(), "protocol");
  });
});
