/**
 * One timed exchange with POST /api/tutor, read the way the app reads it
 * (contracts/tutor-sse.md), with the SSE parser the app uses.
 */

import { createSseParser } from "../src/tutor/sse.js";

/** How many times a rate-limited request is retried after its Retry-After. */
const RATE_LIMIT_RETRIES = 3;

/**
 * @typedef {{
 *   outcome: "ok" | "stream_error" | "http_error",
 *   code: string | null,
 *   message: string,
 *   suggestionsEvent: Record<string, any> | null,
 *   ms: number,
 *   firstDeltaMs: number | null,
 * }} Exchange
 */

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST a request and read its stream to the end. Never throws for a tutor
 * failure: an HTTP error or an `error` event is reported in `outcome` and
 * `code`. A rate limit is waited out and retried.
 * @param {string} baseUrl
 * @param {object} body
 * @param {string | undefined} accessCode sent as X-Tutor-Access when set
 * @returns {Promise<Exchange>}
 */
export async function callTutor(baseUrl, body, accessCode) {
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json" };
  if (accessCode) headers["X-Tutor-Access"] = accessCode;

  for (let attempt = 0; ; attempt += 1) {
    const started = performance.now();
    const response = await fetch(new URL("/api/tutor", baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
      const seconds = Number(response.headers.get("Retry-After") ?? 60);
      console.warn(`rate limited; waiting ${seconds}s`);
      await response.body?.cancel();
      await wait(seconds * 1000);
      continue;
    }
    if (!response.ok || !response.body) {
      const text = await response.text();
      let code = `http_${response.status}`;
      try {
        code = JSON.parse(text).error.code ?? code;
      } catch {
        // Not our error envelope (an edge page): the status stands in for a code.
      }
      return {
        outcome: "http_error",
        code,
        message: "",
        suggestionsEvent: null,
        ms: 0,
        firstDeltaMs: null,
      };
    }
    return readStream(response.body, started);
  }
}

/**
 * @param {ReadableStream<Uint8Array>} stream
 * @param {number} started
 * @returns {Promise<Exchange>}
 */
async function readStream(stream, started) {
  let message = "";
  /** @type {number | null} */
  let firstDeltaMs = null;
  /** @type {Record<string, any> | null} */
  let suggestionsEvent = null;
  /** @type {string | null} */
  let errorCode = null;
  const parser = createSseParser((event, data) => {
    const payload = JSON.parse(data);
    if (event === "message") {
      firstDeltaMs ??= performance.now() - started;
      message += payload.delta;
    } else if (event === "suggestions") suggestionsEvent = payload;
    else if (event === "error") errorCode = payload.code;
  });
  const decoder = new TextDecoder();
  for await (const chunk of stream) parser.push(decoder.decode(chunk, { stream: true }));
  parser.end();
  // A stream that ends with neither a suggestions nor an error event broke the protocol.
  const code = errorCode ?? (suggestionsEvent ? null : "protocol");
  return {
    outcome: code ? "stream_error" : "ok",
    code,
    message,
    suggestionsEvent,
    ms: performance.now() - started,
    firstDeltaMs,
  };
}
