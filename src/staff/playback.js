/**
 * The one playback driver for anything that plays the song with visuals
 * (Stream C owns it; decision D10). The transport's Play button and the
 * key-finding tests (the drone test, for example) both call it, so the staff
 * playhead and the keyboard always follow the sound, whoever started it.
 *
 * While it plays it owns ui.playheadNoteId, the staff's "is-playing"
 * highlight, and ui.keyboardLights (melody neutral, chord tones in their
 * function color, the drone note as melody). Playback outranks hover: other
 * writers of keyboardLights clear only what they wrote.
 *
 * CONTRACT: exported names and shapes are frozen (see contracts/README.md).
 *
 * @import { Chord, HarmonicFunction } from "../types.js"
 * @import { PlaybackEvent, TickRange } from "../audio/index.js"
 * @import { KeyboardLights } from "../store/ui.js"
 */

import { drone as holdDrone, playPhrase, stop } from "../audio/index.js";
import { song } from "../store/song.js";
import { keyLabelMode, ui } from "../store/ui.js";
import { chordFunctions } from "./chordChips.js";
import { clearHighlight, highlight } from "./staffEvents.js";

const PLAYING = "is-playing";

/**
 * The playback that currently owns the visuals; a fresh object per call, so
 * an earlier call can tell it has been superseded.
 * @type {object | null}
 */
let owner = null;

/**
 * Play part of the song with the playhead and keyboard lights following.
 * Resolves when playback ends or is stopped, after clearing what it lit.
 * A new call stops the previous one; the earlier call then resolves without
 * touching anything the newer call owns (its drone, playhead, or lights).
 * @param {TickRange} range
 * @param {{
 *   chords?: { chord: Chord, voicing: number[] }[],
 *   drone?: number | null,
 * }} [options] chords replaces the song's chords for this playback (an empty
 *   array plays none); drone holds that MIDI note underneath until the end.
 * @returns {Promise<void>}
 */
export async function playWithVisuals(range, { chords, drone = null } = {}) {
  if (owner) stop();
  const run = {};
  owner = run;
  const owns = () => owner === run;

  const played = song.get();
  const playedChords = chords ? chords.map((c) => c.chord) : played.chords;
  // Hidden mode shows no function colors anywhere, the keyboard included.
  const hidden = keyLabelMode(played, ui.get()) === "hidden";
  /** @type {Map<string, HarmonicFunction>} computed once per play */
  const functions = hidden ? new Map() : chordFunctions({ ...played, chords: playedChords });
  const midiById = new Map(played.notes.map((n) => [n.id, n.midi]));
  const droneLight = drone === null ? [] : [drone];

  /** @type {KeyboardLights} */
  let lights = { source: "playback", chord: null, melody: droneLight };
  clearHighlight(PLAYING);
  ui.update({ playheadNoteId: null, keyboardLights: lights });

  /** @param {PlaybackEvent} event */
  const show = (event) => {
    if (!owns() || event.type === "end") return;
    if (event.type === "note" && event.noteId !== undefined) {
      const midi = midiById.get(event.noteId);
      if (midi === undefined) return;
      clearHighlight(PLAYING);
      highlight([event.noteId], PLAYING);
      lights = { ...lights, melody: [...droneLight, midi] };
      ui.update({ playheadNoteId: event.noteId, keyboardLights: lights });
    } else if (event.type === "chord" && event.chordId !== undefined && event.tones) {
      const fn = functions.get(event.chordId) ?? "other";
      lights = { ...lights, chord: { midi: event.tones, fn } };
      ui.update({ keyboardLights: lights });
    }
  };

  if (drone !== null) holdDrone(drone);
  try {
    await playPhrase(range, { ...(chords ? { chords } : {}), onEvent: show });
  } finally {
    if (owns()) {
      owner = null;
      if (drone !== null) holdDrone(null);
      clearHighlight(PLAYING);
      const current = ui.get();
      ui.update({
        playheadNoteId: null,
        ...(current.keyboardLights.source === "playback"
          ? { keyboardLights: { source: null, chord: null, melody: [] } }
          : {}),
      });
    }
  }
}
