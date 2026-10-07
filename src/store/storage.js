/**
 * Where this app remembers songs: the one swap point for the storage
 * backend. Matthew chose sessionStorage (each tab keeps its own songs, and
 * closing the tab forgets them). Everything that remembers songs reads this:
 * per-song memory (persist.js) and the list of the user's recorded tunes
 * (src/record/tunes.js). Return window.localStorage here to keep songs and
 * recordings across tabs and restarts.
 *
 * Only songs go through here; the tutor passphrase keeps its own tab-only
 * storage, by Matthew's rule, and must never move to localStorage.
 *
 * @returns {Storage}
 */
export const songStorage = () => window.sessionStorage;
