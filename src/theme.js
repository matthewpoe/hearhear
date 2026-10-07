/**
 * The color theme: light by default; dark once the viewer picks it, remembered
 * in localStorage as a per-viewer convenience. public/theme-init.js applies a
 * remembered choice before first paint; this module owns it afterwards.
 */

import { createReadable } from "./lib/readable.js";

/** @typedef {"light" | "dark"} Theme */

const STORAGE_KEY = "hearhear.theme";

/** @returns {Theme} */
function current() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const store = createReadable(current());

/** The active theme. */
export const theme = { subscribe: store.subscribe };

/**
 * Switch theme and remember it. Storage failures only lose the memory; the
 * switch still happens.
 * @param {Theme} next
 */
export function setTheme(next) {
  if (next === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch (error) {
    console.warn("Theme choice not saved:", error);
  }
  store.set(next);
}
