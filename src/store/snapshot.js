/**
 * Build the tutor's view of the song: bar by bar, spelled pitches, scale
 * degrees, and chords as numeral, Nashville, and letter. Never MIDI numbers.
 * The shape is contracts/tutor-request.schema.json's `snapshot`; this is the
 * one place the camelCase song model crosses to the snake_case wire format.
 *
 * @import { Song, LabelStyle } from "../types.js"
 */

import {
  letterOf,
  melodyDegree,
  nashvilleOf,
  numeralOf,
  positionOf,
  rebar,
  spellMelody,
  ticksPerBeat,
} from "../theory/index.js";

const ACCIDENTAL = { "-1": "b", 0: "", 1: "#" };
/** The request contract's bound on `title` (MAX_TITLE_CHARS in server/hearhear/models.py). */
const MAX_TITLE_CHARS = 120;

/** Round to three places so fractional beats (triplets) serialize cleanly. */
const round = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;

/**
 * @param {Song} song
 * @param {{ labelStyle: LabelStyle, keyHidden?: boolean }} view `keyHidden` is
 *   true while key labels are hidden (`keyLabelMode` is "hidden"). The tutor then
 *   avoids naming the key, and the server withholds every suggestion.
 * The song's title rides along, trimmed to the contract's bound, so the tutor
 * can ground its teaching in the tune's tradition; it is left out when blank.
 */
export function toTutorSnapshot(song, { labelStyle, keyHidden = false }) {
  const { key, meter } = song;
  // By code point, so a cut never splits an astral character into a lone surrogate.
  const title = Array.from(song.title?.trim() ?? "")
    .slice(0, MAX_TITLE_CHARS)
    .join("");
  const beatTicks = ticksPerBeat(meter);
  const notesById = new Map(song.notes.map((n) => [n.id, n]));
  // Spelled in melodic context, as the staff spells them.
  const spelled = spellMelody(song.notes, key);
  const spellingById = new Map(song.notes.map((n, i) => [n.id, spelled[i]]));
  const chordByNote = new Map(song.chords.map((c) => [c.noteId, c]));

  const bars = rebar(song, meter).map(({ index, noteIds }) => {
    const notes = noteIds.map(
      (id) => /** @type {import("../types.js").Note} */ (notesById.get(id)),
    );
    return {
      bar: index,
      notes: notes.map((n) => {
        const pitch = /** @type {string} */ (spellingById.get(n.id));
        const { degree, accidental } = melodyDegree(n.midi, pitch, key);
        return {
          beat: round(positionOf(n.start, meter).beat),
          pitch,
          degree: `${ACCIDENTAL[accidental]}${degree}`,
          beats: round(n.dur / beatTicks),
        };
      }),
      chords: notes.flatMap((n) => {
        const chord = chordByNote.get(n.id);
        if (!chord) return [];
        return [
          {
            beat: round(positionOf(n.start, meter).beat),
            numeral: numeralOf(chord, key),
            nashville: nashvilleOf(chord, key),
            letter: letterOf(chord),
          },
        ];
      }),
    };
  });

  return {
    version: song.version,
    key: { tonic: key.tonic, mode: key.mode, provisional: key.provisional },
    meter: {
      beats_per_bar: meter.beatsPerBar,
      beat_unit: meter.beatUnit,
      pickup_beats: round(meter.pickupTicks / beatTicks),
      provisional: meter.provisional,
    },
    tempo: song.tempo,
    label_style: labelStyle,
    bars,
    key_hidden: keyHidden,
    ...(title ? { title } : {}),
  };
}
