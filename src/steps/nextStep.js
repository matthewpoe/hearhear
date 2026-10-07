/**
 * The next-step path in the lower-left panel: the three calls to action a
 * new user follows, in order. ① Song, ② Key, ③ Chords. One pure function
 * decides every step's status and which one is current; the panel only
 * renders it. The current step is expanded; done steps are a one-line
 * summary.
 *
 * Rhythm isn't a headline step: a demo's rhythm is given. A recorded tune
 * carries a provisional meter and tempo (record mode's guess), and the user
 * confirms it on the way into Chords, so step 3 reads "Rhythm, then chords"
 * until then. The 3-vs-4 meter question stays parked: confirming takes the
 * guess as it is.
 *
 * @import { Meter, Song } from "../types.js"
 */

import { displayNote } from "../theory/noteDisplay.js";

/** @typedef {"song" | "key" | "rhythm" | "chords"} StepId */
/** @typedef {"current" | "done" | "todo"} StepStatus */
/** @typedef {{ id: StepId, label: string, status: StepStatus, summary: string }} Step */
/** @typedef {{ keyOpen: boolean }} StepView what the panel shows: is the key question open */

/**
 * "4/4, set from the tune", or a recorded tune's guess.
 * @param {Meter} meter
 * @param {number} tempo
 */
export function meterSummary(meter, tempo) {
  const signature = `${meter.beatsPerBar}/${meter.beatUnit}`;
  return meter.provisional
    ? `${signature} at ${tempo} beats a minute? Check the guess`
    : `${signature}, set from the tune`;
}

/**
 * The Rhythm step's opening words: a recorded tune is "the recording";
 * notes typed in free play are "your notes".
 * @param {boolean} recorded the song is a tune the user recorded
 */
export function rhythmSource(recorded) {
  return recorded ? "The recording reads as" : "Your notes read as";
}

/**
 * Every step's status and summary, and the current step.
 * @param {Song} song
 * @param {StepView} view
 * @returns {{ steps: Step[], current: StepId }}
 */
export function nextStep(song, view) {
  const keyDone = !song.key.provisional;
  const rhythmDone = !song.meter.provisional;
  /** @type {StepId} */
  const current = view.keyOpen || !keyDone ? "key" : !rhythmDone ? "rhythm" : "chords";
  /** @param {StepId} id @param {boolean} done @returns {StepStatus} */
  const status = (id, done) => (id === current ? "current" : done ? "done" : "todo");
  const placed = song.chords.length;
  return {
    current,
    steps: [
      { id: "song", label: "Song", status: "done", summary: song.title },
      {
        id: "key",
        label: "Key",
        status: status("key", keyDone),
        summary: keyDone ? `${displayNote(song.key.tonic)} ${song.key.mode}` : "Where's home?",
      },
      // Step 3 is the rhythm's while a recorded tune's guess waits.
      current === "rhythm"
        ? {
            id: "rhythm",
            label: "Rhythm, then chords",
            status: "current",
            summary: meterSummary(song.meter, song.tempo),
          }
        : {
            id: "chords",
            label: "Chords",
            status: status("chords", false),
            summary:
              placed === 0
                ? "Click a note on the staff"
                : `${placed} chord${placed === 1 ? "" : "s"} placed`,
          },
    ],
  };
}
