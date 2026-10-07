/**
 * The app's shelf of recorded tunes and its recorder, wired to the app's
 * stores, inputs, and storage (src/store/storage.js, the one swap point).
 */

import { song } from "../store/song.js";
import { ui } from "../store/ui.js";
import { songStorage } from "../store/storage.js";
import { onNoteEvent } from "../input/liveNotes.js";
import { stop } from "../audio/index.js";
import { createShelf } from "./shelf.js";
import { createRecorder } from "./recorder.js";
import { DEMO_TUNES } from "../finding/demoTunes.js";

/** The user's recorded tunes. */
export const shelf = createShelf(songStorage);
song.subscribe((current) => shelf.track(current));

/** Record mode. */
export const recorder = createRecorder({
  song,
  ui,
  shelf,
  onNoteEvent,
  open: (tune) => song.open(tune),
  stopAudio: stop,
  // Discard with nothing else to go back to opens the first demo, not an empty staff.
  fallback: () => DEMO_TUNES[0]?.song ?? null,
});
