/**
 * The guided tour's shared state: whether it's running and which step it's
 * on. The entry (GuidedEntry.svelte, in the masthead and on the landing)
 * starts it; the strip (GuidedPath.svelte, docked on the keyboard) runs it.
 * Running also sets ui.guidedActive, which hushes the beginner tips.
 */

import content from "../../content/guided-path.json" with { type: "json" };
import { createReadable } from "../lib/readable.js";
import { ui } from "../store/ui.js";
import { clampStep, loadProgress, saveProgress } from "./steps.js";

export const STEP_COUNT = content.steps.length;

const store = createReadable({ running: false, index: loadProgress(STEP_COUNT) });

/** @type {{ subscribe: typeof store.subscribe, get: typeof store.get }} */
export const tour = { subscribe: store.subscribe, get: store.get };

export function startTour() {
  store.set({ ...store.get(), running: true });
  ui.update({ guidedActive: true });
}

export function leaveTour() {
  store.set({ ...store.get(), running: false });
  ui.update({ guidedActive: false });
}

/** Leave, and start the next tour from the first step. */
export function finishTour() {
  goTo(0);
  leaveTour();
}

/** @param {number} index */
export function goTo(index) {
  const next = clampStep(index, STEP_COUNT);
  store.set({ ...store.get(), index: next });
  saveProgress(next);
}
