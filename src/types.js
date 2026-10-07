/**
 * Shared JSDoc types. The song shapes mirror contracts/song.schema.json, which
 * is the source of truth; content validation checks real files against it.
 *
 * @typedef {{ tonic: string, mode: "major" | "minor", provisional: boolean }} Key
 * @typedef {{ beatsPerBar: number, beatUnit: 4 | 8, pickupTicks: number, provisional: boolean }} Meter
 * @typedef {{ id: string, midi: number, start: number, dur: number }} Note
 * @typedef {{ root: string, type: string }} ChordSpec   A chord with no placement.
 * @typedef {ChordSpec & { id: string, noteId: string }} Chord
 * @typedef {{
 *   schemaVersion: 1, id: string, title: string, key: Key, meter: Meter,
 *   tempo: number, version: number, notes: Note[], chords: Chord[]
 * }} Song
 *
 * Scale degree relative to the key. `octave` is 0 for the home octave (the
 * number row), -1 below (Q–U), -2 two below (A–J), +1 above (8, 9, 0).
 * @typedef {{ degree: 1|2|3|4|5|6|7, accidental: -1 | 0 | 1, octave: number }} ScaleDegree
 *
 * @typedef {"tonic" | "subdominant" | "dominant" | "other"} HarmonicFunction
 * @typedef {"root" | "third" | "fifth" | "seventh" | "tension" | "clash"} NoteRole
 * @typedef {"roman" | "nashville" | "letters" | "roman+letters"} LabelStyle
 */

export {};
