/**
 * The two ways to change key, kept distinct: transpose (same numbers, new
 * sound) and re-key (same sound, new numbers).
 *
 * @import { Key, Song } from "../types.js"
 */

import { Interval, Note as TNote } from "tonal";
import { CONVENTIONAL_TONICS, chromaOf, degreeOf, mod, spellPitchClass } from "./pitch.js";

/**
 * Move melody, chords, and tonic together by a number of semitones. The new
 * tonic takes its conventional name (Db, not C#, for a major key; F# major and
 * Eb minor by default); chord roots move by the same spelled interval, so
 * every numeral stays the same. Whole octaves keep the tonic's spelling.
 * @param {Song} song
 * @param {number} semitones
 * @returns {Song}
 */
export function transposeSong(song, semitones) {
  const { tonic, mode } = song.key;
  const newTonic =
    mod(semitones, 12) === 0
      ? tonic
      : CONVENTIONAL_TONICS[mode][mod(chromaOf(tonic) + semitones, 12)];
  const interval = Interval.distance(tonic, newTonic);
  return {
    ...song,
    key: { ...song.key, tonic: newTonic },
    notes: song.notes.map((n) => ({ ...n, midi: n.midi + semitones })),
    chords: song.chords.map((c) => ({ ...c, root: TNote.transpose(c.root, interval) })),
  };
}

/**
 * Change the key hypothesis only; notes and chords stay as heard and every
 * label re-derives. Chord roots keep their pitch but may change spelling:
 * re-keying to the enharmonic twin (F# major to Gb major) respells every root
 * with it, so every numeral stays the same; otherwise only a root the new key
 * can't name (G# in Gb major) takes the new key's spelling (Ab).
 * @param {Song} song
 * @param {Key} key
 * @returns {Song}
 */
export function rekeySong(song, key) {
  const enharmonic = chromaOf(key.tonic) === chromaOf(song.key.tonic);
  const interval = Interval.distance(song.key.tonic, key.tonic);
  /** @param {string} root */
  const respell = (root) => {
    if (enharmonic) return TNote.transpose(root, interval);
    if (Math.abs(degreeOf(root, key).accidental) > 1) return spellPitchClass(chromaOf(root), key);
    return root;
  };
  return { ...song, key, chords: song.chords.map((c) => ({ ...c, root: respell(c.root) })) };
}
