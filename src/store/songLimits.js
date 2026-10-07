/**
 * A song's limits, in one place: its title length, tempo range and default,
 * note count and length, lyric length, and swing range, read from
 * contracts/song.schema.json so the app and the schema can't drift. The
 * tutor request model on the server is held to the same bounds by
 * server/tests/test_song_limits.py.
 */

import songSchema from "../../contracts/song.schema.json" with { type: "json" };

const { properties: SONG, $defs: DEFS } = songSchema;

/** A title's longest, in characters (code points, as JSON Schema counts). */
export const MAX_TITLE_CHARS = SONG.title.maxLength;

/** The tempo range, in quarter-note BPM. */
export const MIN_TEMPO = SONG.tempo.minimum;
export const MAX_TEMPO = SONG.tempo.maximum;

/** A new song's tempo, and a recording's with no beat to measure. */
export { DEFAULT_TEMPO } from "../theory/rhythm.js";

/** The most notes a song holds: a recording stops here. */
export const MAX_NOTES = SONG.notes.maxItems;

/** A note's longest, in ticks (twelve to the quarter). */
export const MAX_NOTE_TICKS = DEFS.note.properties.dur.maximum;

/** A note's lyric syllable's longest, in characters. */
export const MAX_LYRIC_CHARS = DEFS.note.properties.lyric.maxLength;

/** The swing ratio's range: 1 plays straight. */
export const MIN_SWING = SONG.swing.minimum;
export const MAX_SWING = SONG.swing.maximum;

/**
 * A string's length in characters as JSON Schema counts them (code points),
 * so an emoji counts once.
 * @param {string} text
 */
export const charCount = (text) => Array.from(text).length;

/**
 * A song's title: 1 to MAX_TITLE_CHARS characters, as the schema counts them.
 * The one title rule for rename, saved-song recall, and the snapshot's cut.
 * @param {unknown} title
 * @returns {title is string}
 */
export const isTitle = (title) =>
  typeof title === "string" &&
  title.length >= SONG.title.minLength &&
  charCount(title) <= MAX_TITLE_CHARS;
