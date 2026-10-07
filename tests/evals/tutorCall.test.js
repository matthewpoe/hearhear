import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { AccessError, callTutor, retryAfterSeconds } from "../../evals/tutorCall.js";

test("retryAfterSeconds caps the wait and falls back to the default", () => {
  assert.equal(retryAfterSeconds("7"), 7);
  assert.equal(retryAfterSeconds("86400"), 120);
  assert.equal(retryAfterSeconds("Wed, 07 Oct 2026 12:00:00 GMT"), 60);
  assert.equal(retryAfterSeconds(null), 60);
});

/**
 * Answer every request with one JSON error, and count the requests.
 * @param {number} status
 * @param {string} code
 */
async function refusingServer(status, code) {
  const seen = { requests: 0, accessHeader: /** @type {string | undefined} */ (undefined) };
  const server = createServer((req, res) => {
    seen.requests += 1;
    seen.accessHeader = /** @type {string | undefined} */ (req.headers["x-tutor-access"]);
    req.resume();
    res.writeHead(status, { "Content-Type": "application/json", "Retry-After": "1" });
    res.end(JSON.stringify({ error: { code, message: "" } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  return { url: `http://127.0.0.1:${port}`, seen, close: () => server.close() };
}

for (const [status, code] of /** @type {const} */ ([
  [401, "access_required"],
  [429, "access_locked"],
])) {
  test(`callTutor stops at ${code} without retrying`, async () => {
    const server = await refusingServer(status, code);
    try {
      await assert.rejects(callTutor(server.url, {}, "clé 42"), (error) => {
        assert.ok(error instanceof AccessError);
        assert.equal(error.code, code);
        assert.doesNotMatch(error.message, /clé|cl%C3%A9/);
        return true;
      });
      assert.equal(server.seen.requests, 1);
      assert.equal(server.seen.accessHeader, "cl%C3%A9%2042");
    } finally {
      server.close();
    }
  });
}

/**
 * Answer the first `refusals` requests with a 503 of `code` (Retry-After 0),
 * then a short stream with a suggestions event.
 * @param {number} refusals
 * @param {string} code
 */
async function busyThenStream(refusals, code) {
  const seen = { requests: 0 };
  const server = createServer((req, res) => {
    seen.requests += 1;
    req.resume();
    if (seen.requests <= refusals) {
      res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "0" });
      res.end(JSON.stringify({ error: { code, message: "" } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`event: message\ndata: ${JSON.stringify({ delta: "Listen." })}\n\n`);
    res.end(`event: suggestions\ndata: ${JSON.stringify({ suggestions: [] })}\n\n`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  return { url: `http://127.0.0.1:${port}`, seen, close: () => server.close() };
}

test("callTutor waits out a 503 busy and retries", async () => {
  const server = await busyThenStream(2, "busy");
  try {
    const exchange = await callTutor(server.url, {}, undefined);
    assert.equal(exchange.outcome, "ok");
    assert.equal(exchange.message, "Listen.");
    assert.equal(server.seen.requests, 3);
  } finally {
    server.close();
  }
});

test("callTutor gives up on busy after three retries", async () => {
  const server = await busyThenStream(Infinity, "busy");
  try {
    const exchange = await callTutor(server.url, {}, undefined);
    assert.equal(exchange.outcome, "http_error");
    assert.equal(exchange.code, "busy");
    assert.equal(server.seen.requests, 4);
  } finally {
    server.close();
  }
});

test("callTutor doesn't retry other 503s, such as the daily budget", async () => {
  const server = await busyThenStream(Infinity, "over_budget");
  try {
    const exchange = await callTutor(server.url, {}, undefined);
    assert.equal(exchange.code, "over_budget");
    assert.equal(server.seen.requests, 1);
  } finally {
    server.close();
  }
});
