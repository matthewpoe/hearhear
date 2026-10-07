/**
 * What the panel says when an exchange fails, by error code (the protocol's
 * codes in contracts/tutor-sse.md, plus the client's `network` and `protocol`).
 * Plain words, no blame; anything unknown gets the generic line.
 */

/** @type {Record<string, string>} */
const TEXT = {
  over_budget: "The live tutor is out of budget for today; the recorded lessons still work.",
  rate_limited: "The tutor needs a short breather. Try again in a minute.",
  too_large: "This song is too long to send to the tutor in one go.",
  invalid_request: "The tutor couldn't read this request.",
  upstream: "The tutor didn't finish its answer.",
  invalid_output: "The tutor's answer came back garbled.",
  network: "Couldn't reach the tutor. Check your connection.",
  protocol: "The tutor's answer came back garbled.",
};

const GENERIC = "Something went wrong talking to the tutor.";

/** Failures a retry can't fix: the budget resets tomorrow, and the same request fails the same way. */
const FINAL = new Set(["over_budget", "too_large", "invalid_request"]);

/** @param {string} code */
export const failureText = (code) => TEXT[code] ?? GENERIC;

/** @param {string} code */
export const canRetry = (code) => !FINAL.has(code);
