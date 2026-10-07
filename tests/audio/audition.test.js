import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { audioStatus, auditionDebounced, stopAudition } from "../../src/audio/index.js";

const RANGE = { fromTick: 0, toTick: 48 };
const PAST_DEBOUNCE_MS = 250;

/** Every audioStatus value published after subscribing (not the initial one). */
function watchStatus() {
  /** @type {string[]} */
  const seen = [];
  const unsubscribe = audioStatus.subscribe((value) => seen.push(value));
  return { changes: () => seen.slice(1), unsubscribe };
}

describe("stopAudition", () => {
  it("cancels a pending debounced audition, so no late chord sounds", async () => {
    const status = watchStatus();
    auditionDebounced([48, 52, 55], RANGE, { atTick: 0 });
    stopAudition();
    await sleep(PAST_DEBOUNCE_MS);
    status.unsubscribe();
    // A fired audition wakes the engine, which moves audioStatus.
    assert.deepEqual(status.changes(), []);
  });

  it("leaves an uncancelled debounced audition to fire (control)", async (t) => {
    t.mock.method(console, "error", () => {}); // Node has no Web Audio; the wake fails
    const status = watchStatus();
    auditionDebounced([48, 52, 55], RANGE, { atTick: 0 });
    await sleep(PAST_DEBOUNCE_MS);
    status.unsubscribe();
    stopAudition();
    assert.notDeepEqual(status.changes(), []);
  });
});
