/**
 * Which keys the toolbar offers, and how far to move the melody to reach one.
 *
 * @import { Song } from "../types.js"
 */

import { Note } from "tonal";

/**
 * The PRD's conventional keys, by pitch class. Where two spellings are both
 * common (F# and Gb major, D# and Eb minor) both are offered.
 */
export const KEY_CHOICES = {
  major: ["C", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"],
  minor: ["C", "C#", "D", "D#", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"],
};

/** The on-screen piano and the samples span C2 to C6. */
export const LOWEST_MIDI = 36;
export const HIGHEST_MIDI = 84;

/**
 * Whether every melody note stays on the keyboard after moving by `semitones`.
 * An empty melody has nothing to move, so it never fits.
 * @param {Song} song
 * @param {number} semitones
 */
export function melodyFits(song, semitones) {
  if (song.notes.length === 0) return false;
  return song.notes.every(
    (n) => n.midi + semitones >= LOWEST_MIDI && n.midi + semitones <= HIGHEST_MIDI,
  );
}

/**
 * The spelling transposeSong should name the new tonic with: a sharp or flat
 * tonic asks for its own side; a natural tonic is already the conventional
 * name, so it needs no preference.
 * @param {string} tonic
 * @returns {"sharps" | "flats" | undefined}
 */
export function preferFor(tonic) {
  if (tonic.includes("#")) return "sharps";
  if (tonic.includes("b")) return "flats";
  return undefined;
}

/**
 * How far to move the song to play it in `tonic`: the smallest move, up or
 * down, that keeps the melody on the keyboard, or the smallest move at all
 * when no octave fits. 0 means the tonic is the same pitch (an enharmonic
 * respelling, or the current key).
 * @param {Song} song
 * @param {string} tonic
 * @returns {number} semitones
 */
export function semitonesTo(song, tonic) {
  const up = (((Number(Note.chroma(tonic)) - Number(Note.chroma(song.key.tonic))) % 12) + 12) % 12;
  const moves = [up, up - 12, up + 12, up - 24].sort((a, b) => Math.abs(a) - Math.abs(b));
  return moves.find((move) => melodyFits(song, move)) ?? moves[0];
}
