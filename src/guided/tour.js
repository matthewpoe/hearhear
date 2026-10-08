/**
 * The guided walkthrough's shared state: whether it's running, which step
 * it's on, and whether this start should take focus. On a first visit it
 * starts on its own, non-modal, in the dock's strip; once someone leaves or
 * finishes it, it stays put for the rest of the tab's session (remembered in
 * sessionStorage, like the rest of the app's per-tab state) until they press
 * "Guided lesson" in the masthead (GuidedEntry.svelte). The strip
 * (GuidedPath.svelte) runs it.
 */

import content from "../../content/guided-path.json" with { type: "json" };
import { createReadable } from "../lib/readable.js";
import { clampStep, loadProgress, saveProgress } from "./steps.js";

/** @import { GuidedPath } from "./steps.js" */

/** The walkthrough's content (content/guided-path.json), typed. */
export const guidedPath = /** @type {GuidedPath} */ (content);

export const STEP_COUNT = content.steps.length;

const SEEN_KEY = "hearhear.guided.dismissed";

/** @typedef {Pick<Storage, "getItem" | "setItem">} KeyValueStore */

/**
 * Whether the walkthrough was left or finished in this tab. Blocked storage
 * counts as not, so it starts on its own (and Leave still works).
 * @param {KeyValueStore} [storage]
 */
export function wasDismissed(storage) {
  try {
    return (storage ?? sessionStorage).getItem(SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

/** @param {KeyValueStore} [storage] */
function rememberDismissed(storage) {
  try {
    (storage ?? sessionStorage).setItem(SEEN_KEY, "true");
  } catch {
    // Storage blocked: it may start again on reload, and Leave still works.
  }
}

const store = createReadable({
  running: false,
  index: loadProgress(STEP_COUNT),
  /** Move focus to the strip when it starts: yes when asked for, no on its own. */
  focus: false,
});

/** @type {{ subscribe: typeof store.subscribe, get: typeof store.get }} */
export const tour = { subscribe: store.subscribe, get: store.get };

/** Start (or resume) from the masthead: focus goes to the step. */
export function startTour() {
  store.set({ ...store.get(), running: true, focus: true });
}

/** On a first visit, start on its own, without taking focus. */
export function autoStart() {
  if (!wasDismissed() && !store.get().running) {
    store.set({ ...store.get(), running: true, focus: false });
  }
}

export function leaveTour() {
  rememberDismissed();
  store.set({ ...store.get(), running: false });
}

/** Leave, and start the next run from the first step. */
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
