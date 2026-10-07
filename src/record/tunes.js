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
});
