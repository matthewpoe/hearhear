/**
 * The tutor client: POST /api/tutor and read its SSE stream with fetch and a
 * stream reader (protocol: contracts/tutor-sse.md). Message text arrives as
 * deltas for the caller to append as plain text; the call resolves with the
 * `suggestions` event's data once `done` arrives.
 */

import { createSseParser } from "./sse.js";

/**
 * The request body, shaped by contracts/tutor-request.schema.json.
 * @typedef {{
 *   snapshot: ReturnType<typeof import("../store/snapshot.js").toTutorSnapshot>,
 *   hint_level: HintLevel,
 *   question: string | null,
 *   history: Turn[],
 * }} TutorRequest
 * @typedef {"nudge" | "comparison" | "answer"} HintLevel
 * @typedef {{ role: "student" | "tutor", text: string }} Turn
 *
 * The `suggestions` event's data. Suggestions are still untrusted here:
 * the panel re-validates them (src/tutor/validate.js).
 * @typedef {{
 *   hint_level: HintLevel,
 *   suggestions: unknown[],
 *   snapshot_version: number,
 *   dropped: number,
 *   withheld?: number,
 *   served_by?: string,
 * }} SuggestionsEvent
 * `served_by` is "fixture" when the server replayed a recorded reply.
 */

/**
 * A failed exchange. `code` is one of the protocol's error codes
 * (access_required, access_locked, too_large, invalid_request, rate_limited,
 * over_budget, busy, upstream, invalid_output, unanswerable) or a client-side one: `network` (no response) or
 * `protocol` (a response the client can't read).
 */
export class TutorError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "TutorError";
    this.code = code;
  }
}

/**
 * The code for an HTTP error whose body has no `{ error: { code } }` envelope:
 * an edge proxy's HTML page, or a rate limiter's own body. Over budget is a
 * 503 too, but only the envelope can say so; any other 5xx means the tutor
 * couldn't be reached, never that its answer was garbled.
 * @param {number} status
 */
function codeFromStatus(status) {
  if (status === 413) return "too_large";
  if (status === 422) return "invalid_request";
  if (status === 429) return "rate_limited";
  // Any other status without our envelope never reached the tutor (an edge
  // error page, a misrouted deploy), so it isn't the tutor's answer garbled.
  return "network";
}

/**
 * Read a non-stream error. The body's `{ error: { code, message } }` envelope
 * comes first; without one, the HTTP status decides.
 * @param {Response} response
 */
async function errorFromResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON (an HTML error page, an empty body): the status decides.
  }
  const envelope = body?.error;
  if (envelope && typeof envelope === "object" && typeof envelope.code === "string") {
    return new TutorError(envelope.code, String(envelope.message ?? ""));
  }
  return new TutorError(
    codeFromStatus(response.status),
    `The tutor answered ${response.status} without an error code.`,
  );
}

/**
 * Ask the tutor. Calls `onDelta` with each piece of message text as it streams.
 * `accessCode`, the live tutor's passphrase, travels in the X-Tutor-Access
 * header so it stays out of the request body and the snapshot Claude sees.
 * `fixture` names a recorded lesson ("lesson:<id>") for the server to replay
 * in the X-Tutor-Fixture header; only the guided path sends one.
 * @param {TutorRequest} request
 * @param {{ onDelta: (text: string) => void, signal?: AbortSignal, accessCode?: string, fixture?: string }} options
 * @returns {Promise<SuggestionsEvent>}
 * @throws {TutorError} on an HTTP error, an `error` event, or a broken stream.
 *   An AbortError passes through unchanged when `signal` aborts.
 */
export async function askTutor(request, { onDelta, signal, accessCode = "", fixture = "" }) {
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  // Percent-encoded: header values must be Latin-1, and a passphrase may not
  // be. The server decodes it and applies the one normalization rule.
  if (accessCode) headers["X-Tutor-Access"] = encodeURIComponent(accessCode);
  if (fixture) headers["X-Tutor-Fixture"] = fixture;
  let response;
  try {
    response = await fetch("/api/tutor", {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new TutorError("network", "Couldn't reach the tutor.");
  }
  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) throw new TutorError("protocol", "The tutor's reply had no body.");

  /** @type {SuggestionsEvent | null} */
  let result = null;
  /** @type {TutorError | null} */
  let failure = null;
  let done = false;

  const parser = createSseParser((event, raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      console.error(`Tutor sent unreadable ${event} data`, error);
      failure ??= new TutorError("protocol", "The tutor's reply was garbled.");
      return;
    }
    // Every event's data is an object (`data: {}` for done); `null` or a bare
    // value would throw below and be misreported as a broken connection.
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      console.error(`Tutor sent ${event} data that isn't an object`, raw);
      failure ??= new TutorError("protocol", "The tutor's reply was garbled.");
      return;
    }
    if (event === "message" && typeof data.delta === "string") onDelta(data.delta);
    else if (event === "suggestions") result = data;
    else if (event === "error") failure ??= new TutorError(String(data.code), String(data.message));
    else if (event === "done") done = true;
  });

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      parser.push(value);
    }
    parser.end();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new TutorError("network", "The tutor's reply was cut off.");
  }

  if (failure) throw failure;
  if (!done || !result) throw new TutorError("protocol", "The tutor's reply ended early.");
  return result;
}
