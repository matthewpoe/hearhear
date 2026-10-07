/**
 * The two ways to change key, kept distinct: transpose (same numbers, new
 * sound) and re-key (same sound, new numbers).
 *
 * @import { Key, Song } from "../types.js"
 */

import { Interval, Key as TKey, Note as TNote } from "tonal";
import { CONVENTIONAL_TONICS, chromaOf, degreeOf, mod, spellPitchClass } from "./pitch.js";

/**
 * Accidentals in a key signature: positive for sharps, negative for flats.
 * @param {string} tonic
 * @param {"major" | "minor"} mode
 */
const signature = (tonic, mode) =>
  mode === "major" ? TKey.majorKey(tonic).alteration : TKey.minorKey(tonic).alteration;

/**
 * Every tonic with a real key signature (seven accidentals at most), by mode
 * and pitch class: C# and Db major, D# and Eb minor, but never D# major.
 */
const KEY_SPELLINGS = Object.fromEntries(
  /** @type {const} */ (["major", "minor"]).map((mode) => {
    const names = [..."CDEFGAB"].flatMap((letter) => [letter, `${letter}#`, `${letter}b`]);
    /** @type {string[][]} */
    const byChroma = Array.from({ length: 12 }, () => []);
    for (const name of names) {
      if (Math.abs(signature(name, mode)) <= 7) byChroma[chromaOf(name)].push(name);
    }
    return [mode, byChroma];
  }),
);

/**
 * The name of a transposed key's tonic. By default, the spelling with fewer
 * accidentals in its key signature (Db major, not C#), and on an exact tie
 * F# major and Eb minor (CONVENTIONAL_TONICS). `prefer` picks the sharp or
 * flat key signature where both are real (C# major, D# minor); where only
 * one is (D major), it is used either way.
 * @param {number} chroma
 * @param {"major" | "minor"} mode
 * @param {"sharps" | "flats" | undefined} prefer
 */
function tonicFor(chroma, mode, prefer) {
  const direction = { sharps: 1, flats: -1 }[prefer ?? ""];
  const preferred = KEY_SPELLINGS[mode][chroma].find(
    (name) => Math.sign(signature(name, mode)) === direction,
  );
  return preferred ?? CONVENTIONAL_TONICS[mode][chroma];
}

/**
 * Move melody, chords, and tonic together by a number of semitones. The new
 * tonic is named by `tonicFor` (Db major by default, C# major with
 * `prefer: "sharps"`). Chord roots move by the same spelled interval, so
 * every numeral stays the same, except that a root that would come out with
 * a double flat takes the new key's conventional letter instead (Bb's bVI in
 * Db major is A, which reads #V). A double sharp stays: minor writes its
 * raised degrees that way (F##°7 is G# minor's #vii°7; as G°7 it would read
 * bi°7 and lose its dominant color). Whole octaves keep the tonic's spelling,
 * whatever `prefer` says.
 * @param {Song} song
 * @param {number} semitones
 * @param {{ prefer?: "sharps" | "flats" }} [options] which enharmonic key to
 *   name the new tonic with, where both are real keys
 * @returns {Song}
 */
export function transposeSong(song, semitones, { prefer } = {}) {
  if (prefer !== undefined && prefer !== "sharps" && prefer !== "flats") {
    throw new RangeError(`prefer must be "sharps" or "flats", not ${JSON.stringify(prefer)}`);
  }
  const { tonic, mode } = song.key;
  const newTonic =
    mod(semitones, 12) === 0 ? tonic : tonicFor(mod(chromaOf(tonic) + semitones, 12), mode, prefer);
  const key = { ...song.key, tonic: newTonic };
  const interval = Interval.distance(tonic, newTonic);
  /** @param {string} root */
  const move = (root) => {
    const moved = TNote.transpose(root, interval);
    return moved.includes("bb") ? spellPitchClass(chromaOf(moved), key) : moved;
  };
  return {
    ...song,
    key,
    notes: song.notes.map((n) => ({ ...n, midi: n.midi + semitones })),
    chords: song.chords.map((c) => ({ ...c, root: move(c.root) })),
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
