/**
 * One timed exchange with POST /api/tutor, read the way the app reads it
 * (contracts/tutor-sse.md), with the SSE parser the app uses.
 */

import { createSseParser } from "../src/tutor/sse.js";

/** How many times a rate-limited request is retried after its Retry-After. */
const RATE_LIMIT_RETRIES = 3;
/** Seconds to wait when Retry-After is missing or not a number, and the most to wait. */
const DEFAULT_RETRY_SECONDS = 60;
const MAX_RETRY_SECONDS = 120;

/**
 * The live tutor's access gate turned the harness away (401 access_required
 * or 429 access_locked). Every later request would be refused too, so the
 * run stops rather than recording each one as a failure.
 */
export class AccessError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(
      code === "access_locked"
        ? "The live tutor has locked this IP out after too many wrong access codes. " +
            "Wait for the lockout to pass (up to 10 minutes), check TUTOR_ACCESS_CODE, and run again."
        : "The live tutor needs its access code. Set TUTOR_ACCESS_CODE in the environment " +
            "to the server's code and run again.",
    );
    this.code = code;
  }
}

/**
 * Seconds to wait out a rate limit: the Retry-After header, capped, or the
 * default when it is missing or not a whole number.
 * @param {string | null} header
 */
export function retryAfterSeconds(header) {
  const seconds = /^\d+$/.test(header?.trim() ?? "") ? Number(header) : DEFAULT_RETRY_SECONDS;
  return Math.min(seconds, MAX_RETRY_SECONDS);
}

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
 * `code`. A rate limit is waited out and retried. The access gate's refusals
 * throw AccessError instead, since no later request would get through.
 * @param {string} baseUrl
 * @param {object} body
 * @param {string | undefined} accessCode sent as X-Tutor-Access when set,
 *   percent-encoded as the app sends it
 * @returns {Promise<Exchange>}
 */
export async function callTutor(baseUrl, body, accessCode) {
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json" };
  if (accessCode) headers["X-Tutor-Access"] = encodeURIComponent(accessCode);

  for (let attempt = 0; ; attempt += 1) {
    const started = performance.now();
    const response = await fetch(new URL("/api/tutor", baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      const text = await response.text();
      let code = `http_${response.status}`;
      try {
        code = JSON.parse(text).error.code ?? code;
      } catch {
        // Not our error envelope (an edge page): the status stands in for a code.
      }
      if (code === "access_required" || code === "access_locked") throw new AccessError(code);
      if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
        const seconds = retryAfterSeconds(response.headers.get("Retry-After"));
        console.warn(`rate limited; waiting ${seconds}s`);
        await wait(seconds * 1000);
        continue;
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
