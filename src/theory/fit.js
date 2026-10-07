/**
 * How well a chord fits the melody it would sit under.
 *
 * @import { Meter, Note, Song, ChordSpec } from "../types.js"
 */

import { analyzeNoteOverChord } from "./harmony.js";
import { positionOf, ticksPerBar } from "./meter.js";

/** How well each role sits under a chord, 0..1. Every triad tone is equally consonant. */
const ROLE_SCORE = { root: 1, third: 1, fifth: 1, seventh: 0.75, tension: 0.4, clash: 0 };

/**
 * Metric weight of an onset: the downbeat, then a mid-bar strong beat (beat 3
 * of 4/4, beat 4 of 6/8), then other beats, then offbeats.
 * @param {number} tick
 * @param {Meter} meter
 */
function beatStrength(tick, meter) {
  const beat = positionOf(tick, meter).beat - 1;
  if (beat === 0) return 1;
  if (!Number.isInteger(beat)) return 0.25;
  const { beatsPerBar } = meter;
  return beatsPerBar >= 4 && beatsPerBar % 2 === 0 && beat === beatsPerBar / 2 ? 0.75 : 0.5;
}

/**
 * Where a chord placed on `anchor` stops sounding: at the next placed chord,
 * or else at the end of the bar (or of the anchor note, if it is held over).
 * @param {Song} song
 * @param {Note} anchor
 */
function spanEnd(song, anchor) {
  const { bar } = positionOf(anchor.start, song.meter);
  const barEnd = song.meter.pickupTicks + bar * ticksPerBar(song.meter);
  const chorded = new Set(song.chords.map((c) => c.noteId));
  const nextChord = song.notes
    .filter((n) => chorded.has(n.id) && n.start > anchor.start)
    .reduce((min, n) => Math.min(min, n.start), Infinity);
  return Math.min(nextChord, Math.max(barEnd, anchor.start + anchor.dur));
}

/**
 * How well a chord fits the melody around a note: melody notes within the
 * chord's span, weighted by beat strength and duration.
 * @param {Song} song
 * @param {string} noteId the note the chord would sit on
 * @param {ChordSpec} chord
 * @returns {number} 0..1
 */
export function fit(song, noteId, chord) {
  const anchor = song.notes.find((n) => n.id === noteId);
  if (!anchor) return 0;
  const end = spanEnd(song, anchor);
  let total = 0;
  let score = 0;
  for (const note of song.notes) {
    if (note.start < anchor.start || note.start >= end) continue;
    const sounding = Math.min(note.start + note.dur, end) - note.start;
    const weight = sounding * beatStrength(note.start, song.meter);
    total += weight;
    score += weight * ROLE_SCORE[analyzeNoteOverChord(note.midi, chord).role];
  }
  return total > 0 ? score / total : 0;
}
