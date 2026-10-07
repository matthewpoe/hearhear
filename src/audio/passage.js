/**
 * What a passage sounds like, as a list of timed cues: melody notes, chords,
 * and clicks. Pure (no Tone, no store) so the scheduling rules read in one
 * place: which chords sound, how they are voiced, and when the click accents.
 *
 * @import { Chord, Meter, Song } from "../types.js"
 * @import { TickRange } from "./index.js"
 */

import { TICKS_PER_QUARTER, ticksPerBar, ticksPerBeat, voice } from "../theory/index.js";

/** Voicing ceiling when a passage has no melody notes to sit under (middle C). */
const DEFAULT_BELOW = 60;

/**
 * @typedef {{ tick: number, dur: number, tones: number[] } & (
 *   | { kind: "note", noteId: string }
 *   | { kind: "chord", chordId?: string }
 *   | { kind: "click", accent: boolean }
 * )} Cue
 *
 * A chord placed at a tick. `voicing` is given for overrides and auditions;
 * otherwise the chord is voiced in passage order with theory's voice().
 * @typedef {{ tick: number, chordId?: string, chord?: Chord, voicing?: number[] }} Placement
 */

/** @param {Song} song */
export const secondsPerTick = (song) => 60 / (song.tempo * TICKS_PER_QUARTER);

/**
 * Melody notes that start inside the range, clipped to its end.
 * @param {Song} song
 * @param {TickRange} range
 * @returns {Cue[]}
 */
export function melodyCues(song, { fromTick, toTick }) {
  return song.notes
    .filter((n) => n.start >= fromTick && n.start < toTick)
    .map((n) => ({
      kind: "note",
      noteId: n.id,
      tick: n.start,
      dur: Math.min(n.dur, toTick - n.start),
      tones: [n.midi],
    }));
}

/**
 * Place chords at their notes' onsets, in time order. Chords on missing notes
 * are skipped.
 * @param {Song} song
 * @param {{ chord: Chord, voicing?: number[] }[]} chords
 * @returns {Placement[]}
 */
export function placeChords(song, chords) {
  const onset = new Map(song.notes.map((n) => [n.id, n.start]));
  return chords
    .filter(({ chord }) => onset.has(chord.noteId))
    .map(({ chord, voicing }) => ({
      tick: /** @type {number} */ (onset.get(chord.noteId)),
      chordId: chord.id,
      chord,
      voicing,
    }))
    .sort((a, b) => a.tick - b.tick);
}

/**
 * The song's chords with a candidate in place of whatever chord sits at
 * `atTick` (or added there, if none does).
 * @param {Song} song
 * @param {number[]} voicing
 * @param {number} atTick
 * @returns {Placement[]}
 */
export function withCandidate(song, voicing, atTick) {
  const others = placeChords(
    song,
    song.chords.map((chord) => ({ chord })),
  ).filter((p) => p.tick !== atTick);
  return [...others, { tick: atTick, voicing }].sort((a, b) => a.tick - b.tick);
}

/**
 * Chord cues for a range. The chord already sounding when the range starts
 * comes in on its first tick; each chord holds until the next one or the end.
 * Chords without a voicing are voiced under the passage's lowest melody note,
 * leading from the chord before, so every chord in the passage shares a register.
 * @param {Placement[]} placements in time order
 * @param {TickRange} range
 * @param {Cue[]} melody the passage's melody cues
 * @returns {Cue[]}
 */
export function chordCues(placements, { fromTick, toTick }, melody) {
  const below = melody.length ? Math.min(...melody.map((c) => c.tones[0])) : DEFAULT_BELOW;
  const sounding = placements.filter((p) => p.tick <= fromTick).at(-1);
  const inRange = placements.filter((p) => p.tick > fromTick && p.tick < toTick);
  const chosen = sounding ? [{ ...sounding, tick: fromTick }, ...inRange] : inRange;

  /** @type {number[] | null} */
  let previous = null;
  return chosen.map((p, i) => {
    const tones = p.voicing ?? voice(/** @type {Chord} */ (p.chord), previous, { below });
    previous = tones;
    const end = chosen[i + 1]?.tick ?? toTick;
    return { kind: "chord", chordId: p.chordId, tick: p.tick, dur: end - p.tick, tones };
  });
}

/**
 * One click per beat of the meter across the range, accented on each
 * downbeat. Beats are counted from the first downbeat (after the pickup), so
 * an anacrusis clicks unaccented and 6/8 clicks in eighths.
 * @param {Meter} meter
 * @param {TickRange} range
 * @returns {Cue[]}
 */
export function clickCues(meter, { fromTick, toTick }) {
  const beat = ticksPerBeat(meter);
  const bar = ticksPerBar(meter);
  const offset = (((meter.pickupTicks - fromTick) % beat) + beat) % beat;
  /** @type {Cue[]} */
  const cues = [];
  for (let tick = fromTick + offset; tick < toTick; tick += beat) {
    const accent = (((tick - meter.pickupTicks) % bar) + bar) % bar === 0;
    cues.push({ kind: "click", accent, tick, dur: 1, tones: [] });
  }
  return cues;
}
