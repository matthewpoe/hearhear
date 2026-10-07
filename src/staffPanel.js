/**
 * The dark theme's staff panel: "slate" (deep violet, the default) or "paper"
 * (a warm cream card, like sheet music on a dark stand). It only shows in the
 * dark theme; light and print always draw the staff on the light page.
 * Remembered in localStorage as a per-viewer convenience, like the theme:
 * public/theme-init.js applies a remembered "paper" before first paint, and
 * this module owns the choice afterwards.
 */

import { createReadable } from "./lib/readable.js";

/** @typedef {"slate" | "paper"} StaffPanel */

const STORAGE_KEY = "hearhear.staffPanel";

/** @returns {StaffPanel} */
function current() {
  return document.documentElement.dataset.staffPanel === "paper" ? "paper" : "slate";
}

const store = createReadable(current());

/** The active staff panel. */
export const staffPanel = { subscribe: store.subscribe };

/**
 * Switch the panel and remember it. Storage failures only lose the memory;
 * the switch still happens.
 * @param {StaffPanel} next
 */
export function setStaffPanel(next) {
  if (next === "paper") document.documentElement.dataset.staffPanel = "paper";
  else delete document.documentElement.dataset.staffPanel;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (error) {
    console.warn("Staff panel choice not saved:", error);
  }
  store.set(next);
}
