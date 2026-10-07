/**
 * What a passage sounds like, as a list of timed cues: melody notes, chords,
 * and clicks. Pure (no Tone, no store) so the scheduling rules read in one
 * place: which chords sound, how they are voiced, and when the click accents.
 *
 * @import { Chord, Meter, Song } from "../types.js"
 * @import { TickRange } from "./index.js"
 */

import { TICKS_PER_QUARTER, ticksPerBar, ticksPerBeat, voice } from "../theory/index.js";

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

/**
 * Where a tick sounds under swing, in (fractional) ticks. Each quarter-note
 * beat, counted from the first downbeat, is stretched piecewise: its first
 * half (the on-beat eighth) lasts `ratio / (1 + ratio)` of the beat and its
 * second half the rest, so an off-beat eighth lands at about 2/3 of the beat
 * when the ratio is 2. On-beat ticks never move. Straight (ratio 1, or a meter
 * counted in eighths) returns the tick unchanged.
 *
 * Only the sixteenth grid swings: a tick off it (a triplet) keeps its place,
 * so triplets stay even, unless a grid point next to it moved past it; then it
 * moves just far enough to stay between them. With `dotted`, the beat holds a dotted eighth and a
 * sixteenth, and the sixteenth's tick (3/4 of the beat) moves to where the
 * off-beat eighth goes, so the figure plays like the swung pair (8/4 at ratio
 * 2), the way players phrase it. The map never runs backwards.
 * @param {number} tick
 * @param {Meter} meter
 * @param {number} ratio long:short
 * @param {{ dotted?: boolean }} [options]
 */
export function swingTick(tick, meter, ratio, { dotted = false } = {}) {
  if (ratio === 1 || meter.beatUnit !== 4) return tick;
  const beat = TICKS_PER_QUARTER;
  const half = beat / 2;
  const at = (((tick - meter.pickupTicks) % beat) + beat) % beat;
  const long = (beat * ratio) / (1 + ratio);
  /** Where a sixteenth-grid point of the beat sounds. */
  const grid = (/** @type {number} */ x) => {
    if (dotted && x === (beat * 3) / 4) return long;
    return x <= half ? (x * long) / half : long + ((x - half) * (beat - long)) / half;
  };
  if ((at * 4) % beat === 0) return tick - at + grid(at);
  // Off the grid: stay put, but between where the grid points around it went.
  const sixteenth = beat / 4;
  const below = Math.floor(at / sixteenth) * sixteenth;
  return tick - at + Math.min(Math.max(at, grid(below)), grid(below + sixteenth));
}

/**
 * The beats (by start tick) that hold a dotted eighth and a sixteenth: an
 * onset at 3/4 of the beat and none at the half. A run of sixteenths has an
 * onset at the half too, so it swings as a run.
 * @param {Cue[]} cues
 * @param {Meter} meter
 * @returns {Set<number>}
 */
function dottedBeats(cues, meter) {
  const beat = TICKS_PER_QUARTER;
  /** @type {Map<number, Set<number>>} beat start → onsets within it */
  const onsets = new Map();
  for (const cue of cues) {
    if (cue.kind === "click") continue;
    const at = (((cue.tick - meter.pickupTicks) % beat) + beat) % beat;
    const start = cue.tick - at;
    onsets.set(start, (onsets.get(start) ?? new Set()).add(at));
  }
  const dotted = new Set();
  for (const [start, ats] of onsets) {
    if (ats.has((beat * 3) / 4) && !ats.has(beat / 2)) dotted.add(start);
  }
  return dotted;
}

/**
 * A passage with every cue, and its range, moved to swung time (swingTick),
 * so the sound and the visual events that ride on the cues (the staff's
 * playhead, the keyboard lights) stay together. A straight song's passage
 * comes back as is.
 * @template {{ cues: Cue[], fromTick: number, toTick: number }} P
 * @param {P} passage
 * @param {Song} song
 * @returns {P}
 */
export function swingPassage(passage, song) {
  const ratio = song.swing ?? 1;
  if (ratio === 1 || song.meter.beatUnit !== 4) return passage;
  const beat = TICKS_PER_QUARTER;
  const dotted = dottedBeats(passage.cues, song.meter);
  const at = (/** @type {number} */ tick) => {
    const start = tick - ((((tick - song.meter.pickupTicks) % beat) + beat) % beat);
    return swingTick(tick, song.meter, ratio, { dotted: dotted.has(start) });
  };
  return {
    ...passage,
    fromTick: at(passage.fromTick),
    toTick: at(passage.toTick),
    cues: passage.cues.map((cue) => {
      if (cue.kind === "click") return cue; // clicks mark the beats, which never move
      return { ...cue, tick: at(cue.tick), dur: at(cue.tick + cue.dur) - at(cue.tick) };
    }),
  };
}

/** @param {Song} song */
export const secondsPerTick = (song) => 60 / (song.tempo * TICKS_PER_QUARTER);

/**
 * Melody notes sounding inside the range, clipped to it. A note held into the
 * range from before it comes in on the first tick with what remains of it,
 * the same way the chord already sounding does.
 * @param {Song} song
 * @param {TickRange} range
 * @returns {Cue[]}
 */
export function melodyCues(song, { fromTick, toTick }) {
  return song.notes
    .filter((n) => n.start < toTick && n.start + n.dur > fromTick)
    .map((n) => {
      const tick = Math.max(n.start, fromTick);
      return {
        kind: "note",
        noteId: n.id,
        tick,
        dur: Math.min(n.start + n.dur, toTick) - tick,
        tones: [n.midi],
      };
    });
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
 * Placements with a candidate in place of whatever chord sits at `atTick` (or
 * added there, if none does).
 * @param {Placement[]} placements in time order
 * @param {number[]} voicing
 * @param {number} atTick
 * @returns {Placement[]}
 */
export function withCandidate(placements, voicing, atTick) {
  const others = placements.filter((p) => p.tick !== atTick);
  return [...others, { tick: atTick, voicing }].sort((a, b) => a.tick - b.tick);
}

/**
 * Chord cues for a range. The chord already sounding when the range starts
 * comes in on its first tick; each chord holds until the next one or the end.
 * Chords without a voicing are voiced under `below` (theory's passageBelow),
 * leading from the chord before, so every chord in the passage shares a register.
 * @param {Placement[]} placements in time order
 * @param {TickRange} range
 * @param {number} below MIDI ceiling for the voicings
 * @returns {Cue[]}
 */
export function chordCues(placements, { fromTick, toTick }, below) {
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
 * Chord cues for an audition: the song's chords with a candidate at `atTick`
 * (decision D4). With "as-song", every other chord is voiced exactly as
 * playback voices the song (the passage is voiced first, then the candidate
 * is swapped in), so two auditions differ only in the candidate. With
 * "from-candidate", the chords after it voice-lead from the candidate. A
 * candidate outside the range does not sound.
 * @param {Placement[]} placements the song's chords, in time order
 * @param {number[]} voicing the candidate, MIDI
 * @param {TickRange} range
 * @param {{ atTick: number, neighbors?: "as-song" | "from-candidate" }} placement
 * @param {number} below MIDI ceiling for the voicings
 * @returns {Cue[]}
 */
export function auditionChordCues(
  placements,
  voicing,
  range,
  { atTick, neighbors = "as-song" },
  below,
) {
  if (atTick < range.fromTick || atTick >= range.toTick) return chordCues(placements, range, below);
  if (neighbors === "from-candidate") {
    return chordCues(withCandidate(placements, voicing, atTick), range, below);
  }
  const song = chordCues(placements, range, below);
  /** @type {Cue} */
  const candidate = { kind: "chord", tick: atTick, dur: 0, tones: voicing };
  const kept = song.filter((c) => c.tick !== atTick);
  const after = kept.find((c) => c.tick > atTick);
  candidate.dur = (after?.tick ?? range.toTick) - atTick;
  return [
    ...kept
      .filter((c) => c.tick < atTick)
      .map((c) => ({ ...c, dur: Math.min(c.dur, atTick - c.tick) })),
    candidate,
    ...kept.filter((c) => c.tick > atTick),
  ];
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
