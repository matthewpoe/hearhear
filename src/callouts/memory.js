/**
 * What the beginner tour remembers per viewer, in localStorage: whether tips
 * are on (on by default) and which tips were dismissed. A per-viewer
 * convenience only: when storage is blocked or full, the tour still works and
 * just forgets on reload.
 *
 * Each function takes the storage to use so Node tests can pass a stand-in;
 * the app omits it and gets localStorage.
 */

const ON_KEY = "hearhear.callouts.on";
const DISMISSED_KEY = "hearhear.callouts.dismissed";

/** @typedef {Pick<Storage, "getItem" | "setItem">} KeyValueStore */

/**
 * @param {KeyValueStore} [storage]
 * @returns {boolean}
 */
export function loadOn(storage) {
  return read(ON_KEY, storage) !== "false";
}

/**
 * @param {boolean} on
 * @param {KeyValueStore} [storage]
 */
export function saveOn(on, storage) {
  write(ON_KEY, String(on), storage);
}

/**
 * Ids of dismissed tips. Anything unreadable counts as none dismissed.
 * @param {KeyValueStore} [storage]
 * @returns {Set<string>}
 */
export function loadDismissed(storage) {
  const raw = read(DISMISSED_KEY, storage);
  if (raw === null) return new Set();
  try {
    const ids = JSON.parse(raw);
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch (error) {
    console.warn("Dismissed tips not readable; starting fresh:", error);
    return new Set();
  }
}

/**
 * @param {ReadonlySet<string>} ids
 * @param {KeyValueStore} [storage]
 */
export function saveDismissed(ids, storage) {
  write(DISMISSED_KEY, JSON.stringify([...ids]), storage);
}

/**
 * @param {string} key
 * @param {KeyValueStore} [storage]
 * @returns {string | null}
 */
function read(key, storage) {
  try {
    return (storage ?? localStorage).getItem(key);
  } catch (error) {
    console.warn("Beginner tips settings not readable:", error);
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @param {KeyValueStore} [storage]
 */
function write(key, value, storage) {
  try {
    (storage ?? localStorage).setItem(key, value);
  } catch (error) {
    console.warn("Beginner tips settings not saved:", error);
  }
}
