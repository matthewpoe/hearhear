/**
 * Plays cue lists on Tone's Transport, one at a time. Starting a playback
 * stops the one before; visuals fire through Tone.Draw so they land with the
 * sound, not when the Transport schedules it. Completion (the `end` event and
 * the promise) runs on the audio clock instead, because Draw waits for an
 * animation frame and a background tab has none.
 *
 * @import { Engine, Pianos } from "./engine.js"
 * @import { Cue } from "./passage.js"
 * @import { PlaybackEvent } from "./index.js"
 */

import { hz } from "./engine.js";

const MELODY_VELOCITY = 0.8;
const CHORD_VELOCITY = 0.5; // the left hand sits under the tune
const ACCENT_HZ = 1568; // G6
const CLICK_HZ = 1047; // C6

/** @type {{ finish: () => void } | null} */
let session = null;

/**
 * @param {Cue} cue
 * @returns {PlaybackEvent | null}
 */
function eventOf(cue) {
  if (cue.kind === "note") return { type: "note", noteId: cue.noteId, tones: cue.tones };
  if (cue.kind === "chord") return { type: "chord", chordId: cue.chordId, tones: cue.tones };
  return null;
}

/**
 * @param {Engine} engine
 * @param {Pianos} pianos
 * @param {Cue} cue
 * @param {number} seconds the cue's length
 * @param {number} time audio-clock time to sound at
 */
function sound({ click }, pianos, cue, seconds, time) {
  if (cue.kind === "click") {
    click.triggerAttackRelease(cue.accent ? ACCENT_HZ : CLICK_HZ, 0.05, time, cue.accent ? 1 : 0.5);
    return;
  }
  const velocity = cue.kind === "note" ? MELODY_VELOCITY : CHORD_VELOCITY;
  pianos.phrase.triggerAttackRelease(cue.tones.map(hz), seconds, time, velocity);
}

/**
 * Schedule cues and start the Transport. Resolves when the last cue ends or
 * playback is stopped; either way `onEvent` gets a final `end`. Note and chord
 * events still waiting on an animation frame at the end are dropped.
 * @param {Engine} engine
 * @param {Pianos} pianos
 * @param {{ cues: Cue[], fromTick: number, toTick: number, secondsPerTick: number }} passage
 * @param {(event: PlaybackEvent) => void} [onEvent]
 * @returns {Promise<void>}
 */
export function play(engine, pianos, { cues, fromTick, toTick, secondsPerTick }, onEvent) {
  stopPlayback();
  const { Tone } = engine;
  const transport = Tone.getTransport();
  const draw = Tone.getDraw();
  const at = (/** @type {number} */ tick) => (tick - fromTick) * secondsPerTick;

  return new Promise((resolve) => {
    const mine = {
      finish() {
        if (session !== mine) return;
        session = null;
        transport.stop();
        transport.cancel();
        draw.cancel(0);
        pianos.phrase.releaseAll();
        onEvent?.({ type: "end" });
        resolve();
      },
    };
    session = mine;
    for (const cue of cues) {
      const event = eventOf(cue);
      transport.schedule((time) => {
        sound(engine, pianos, cue, cue.dur * secondsPerTick, time);
        if (event && onEvent) draw.schedule(() => onEvent(event), time);
      }, at(cue.tick));
    }
    // The Transport calls back look-ahead early; wait for the audio clock to
    // reach the end so the release doesn't cut the last notes short.
    transport.schedule((time) => {
      const wait = Math.max(0, time - Tone.getContext().currentTime) * 1000;
      setTimeout(() => mine.finish(), wait);
    }, at(toTick));
    transport.start();
  });
}

/** Stop whatever the Transport is playing, resolving its promise. */
export function stopPlayback() {
  session?.finish();
}
