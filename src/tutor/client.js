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
 * }} SuggestionsEvent
 */

/**
 * A failed exchange. `code` is one of the protocol's error codes
 * (too_large, invalid_request, rate_limited, over_budget, upstream,
 * invalid_output) or a client-side one: `network` (no response) or
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
 * Read a non-stream error body: `{ error: { code, message } }`.
 * @param {Response} response
 */
async function errorFromResponse(response) {
  const fallback = new TutorError("protocol", `The tutor answered ${response.status}.`);
  let body;
  try {
    body = await response.json();
  } catch (error) {
    console.error("Tutor error body was not JSON", error);
    return fallback;
  }
  const { code, message } = body?.error ?? {};
  return typeof code === "string" ? new TutorError(code, String(message ?? "")) : fallback;
}

/**
 * Ask the tutor. Calls `onDelta` with each piece of message text as it streams.
 * @param {TutorRequest} request
 * @param {{ onDelta: (text: string) => void, signal?: AbortSignal }} options
 * @returns {Promise<SuggestionsEvent>}
 * @throws {TutorError} on an HTTP error, an `error` event, or a broken stream.
 *   An AbortError passes through unchanged when `signal` aborts.
 */
export async function askTutor(request, { onDelta, signal }) {
  let response;
  try {
    response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
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
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new TutorError("network", "The tutor's reply was cut off.");
  }

  if (failure) throw failure;
  if (!done || !result) throw new TutorError("protocol", "The tutor's reply ended early.");
  return result;
}
