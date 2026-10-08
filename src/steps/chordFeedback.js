/**
 * The Chords step: where to start, and what a placed chord does. The start
 * is one specific note: the first note on a downbeat with no chord yet (bar
 * 1's first note on a fresh tune). After a placement it describes the
 * relationship and what the chord does, never a verdict: no right or wrong,
 * and a rub is described, not flagged (rubs are sometimes the point, as in
 * the blues). The description reads theory's fit over the chord's whole
 * span, and analyzeNoteOverChord for the note it sits on. It never names a
 * chord to try: the next thing to try is a place, not an answer.
 *
 * @import { ChordSpec, LabelStyle, Note, Song } from "../types.js"
 */

import { analyzeNoteOverChord, fit, positionOf, spellMelody } from "../theory/index.js";
import { displayNote } from "../theory/noteDisplay.js";
import { chordView, labelText } from "../chords/chordView.js";

/** At or above this fit, the melody over the span sits inside the chord. */
const INSIDE = 0.75;
/** Below this, most of the span rubs. */
const RUBS = 0.4;

const ROLE_WORDS = { root: "root", third: "3rd", fifth: "5th", seventh: "7th" };

const DOES = {
  tonic: "home: settled, at rest.",
  subdominant: "a step away from home, moving somewhere.",
  dominant: "tension that wants to come home.",
  other: "a color from outside the key.",
};

/**
 * The note to suggest starting on: the first downbeat note with no chord,
 * else the first note with no chord, else null when every note has one.
 * @param {Song} song
 * @returns {Note | null}
 */
export function startingNote(song) {
  const chorded = new Set(song.chords.map((c) => c.noteId));
  const open = song.notes.filter((n) => !chorded.has(n.id));
  const downbeat = open.find((n) => {
    const { bar, beat } = positionOf(n.start, song.meter);
    return bar >= 1 && beat === 1;
  });
  return downbeat ?? open[0] ?? null;
}

/**
 * The chord just placed between two versions of a song: one chord set or
 * changed, with the melody untouched (so a load, a transpose, or a note edit
 * isn't a placement). Null otherwise, and for a chord removed.
 * @param {Song} before
 * @param {Song} after
 * @returns {{ noteId: string, chord: ChordSpec } | null}
 */
export function placedChord(before, after) {
  if (before.id !== after.id || before.notes !== after.notes) return null;
  const old = new Map(before.chords.map((c) => [c.noteId, `${c.root}${c.type}`]));
  const fresh = after.chords.filter((c) => old.get(c.noteId) !== `${c.root}${c.type}`);
  if (fresh.length !== 1) return null;
  const [chord] = fresh;
  return { noteId: chord.noteId, chord: { root: chord.root, type: chord.type } };
}

/**
 * What the placed chord does with the melody, in two short sentences: the
 * note it sits on, then the span and the chord's function. The chord is
 * named in the user's label style, as on the chips and the staff.
 * @param {Song} song
 * @param {string} noteId
 * @param {ChordSpec} chord
 * @param {LabelStyle} [labelStyle]
 * @returns {{ relation: string, does: string, kind: "inside" | "color" | "rub" } | null}
 */
export function describePlacement(song, noteId, chord, labelStyle = "roman") {
  const index = song.notes.findIndex((n) => n.id === noteId);
  if (index < 0) return null;
  const note = song.notes[index];
  const name = displayNote(spellMelody(song.notes, song.key)[index].replace(/-?\d+$/, ""));
  const { role } = analyzeNoteOverChord(note.midi, chord);
  const score = fit(song, noteId, chord);
  const kind = score >= INSIDE ? "inside" : score >= RUBS ? "color" : "rub";

  const onNote =
    role in ROLE_WORDS
      ? `The melody note (${name}) is this chord's ${ROLE_WORDS[/** @type {keyof typeof ROLE_WORDS} */ (role)]}.`
      : role === "clash"
        ? `The melody note (${name}) rubs a half step against this chord.`
        : `The melody note (${name}) adds a color over this chord.`;
  const span = {
    inside: "The melody under it stays inside the chord.",
    color: "Some notes under it pass outside the chord, as color.",
    rub: "Much of the melody under it rubs against the chord; sometimes that rub is the point.",
  }[kind];
  const view = chordView(chord, song.key, "confirmed", labelStyle);
  const does = `${labelText(view)}: ${DOES[/** @type {keyof typeof DOES} */ (view.fn)]}`;
  return { relation: `${onNote} ${span}`, does, kind };
}
