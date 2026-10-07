/**
 * Name the chord a four-voice setting sounds at one instant. Dataset tooling:
 * this reads the reference chords out of a published harmonization, so they
 * are never written from memory.
 *
 * @import { AbcNote } from "./abc.js"
 * @import { ChordSpec } from "../../src/types.js"
 */

import { Chord, Note } from "tonal";

/** The song schema's chord types, in order of preference when a sonority fits two. */
const TYPES = [
  "M",
  "m",
  "7",
  "dim",
  "m7",
  "maj7",
  "m7b5",
  "dim7",
  "aug",
  "sus4",
  "sus2",
  "6",
  "m6",
];

/** @param {string[]} names */
const chromaSet = (names) => [...new Set(names.map((n) => Note.chroma(n)))].sort().join(",");

/**
 * The notes sounding at `tick` across all voices: struck then or held over it.
 * @param {Record<string, AbcNote[]>} voices
 * @param {number} tick
 */
export function soundingAt(voices, tick) {
  return Object.values(voices).flatMap((notes) =>
    notes.filter((n) => n.start <= tick && tick < n.start + n.dur),
  );
}

/**
 * The chord a set of sounding notes spells, or null when they don't spell one
 * (a passing or suspended tone on the beat, or too few notes to tell). A
 * seventh chord may omit its fifth, as four-part writing often does; a triad
 * must be complete. When a sonority reads two ways (Em7 or G6), the reading
 * whose root is in the bass wins, then the earlier type in TYPES.
 * @param {AbcNote[]} sounding
 * @returns {ChordSpec | null}
 */
export function chordOf(sounding) {
  if (!sounding.length) return null;
  const heard = chromaSet(sounding.map((n) => n.name));
  const bass = sounding.reduce((low, n) => (n.midi < low.midi ? n : low));
  const roots = [...new Set(sounding.map((n) => n.name))];
  /** @type {{ chord: ChordSpec, rank: number }[]} */
  const readings = [];
  for (const root of roots) {
    TYPES.forEach((type, order) => {
      const tones = Chord.getChord(type, root).notes;
      const withoutFifth = tones.length === 4 ? tones.filter((_, i) => i !== 2) : null;
      const exact = chromaSet(tones) === heard;
      const partial = withoutFifth !== null && chromaSet(withoutFifth) === heard;
      if (!exact && !partial) return;
      const inBass = Note.chroma(root) === Note.chroma(bass.name);
      readings.push({
        chord: { root, type },
        rank: (exact ? 0 : 1000) + (inBass ? 0 : 100) + order,
      });
    });
  }
  readings.sort((a, b) => a.rank - b.rank);
  return readings[0]?.chord ?? null;
}
