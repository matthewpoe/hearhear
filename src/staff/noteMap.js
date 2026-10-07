/**
 * Map what abcjs drew back to the song model. abcjs gives each drawn note an
 * SVG group (`abselem.elemset`) and keeps its chord symbol as a child element
 * of type "chord" (`graphelem`). Notes come out in the same order songToAbc
 * wrote them, so the nth drawn note (rests excluded) is the nth NotePiece.
 *
 * @import { NotePiece } from "./abc.js"
 */

/**
 * The parts of abcjs's TuneObject this module reads.
 * @typedef {{
 *   el_type: string,
 *   rest?: unknown,
 *   abselem?: { elemset: Element[], children: { type: string, graphelem?: Element }[] },
 * }} DrawnElement
 * @typedef {{ lines: { staff?: { voices: DrawnElement[][] }[] }[] }} DrawnTune
 */

/**
 * @param {DrawnTune} tune the first TuneObject from abcjs.renderAbc
 * @param {NotePiece[]} pieces from songToAbc, for the same ABC
 * @returns {{ notes: Map<string, Element[]>, chords: Map<string, Element> }}
 *   SVG groups per note id, and the chord-symbol text element per chord id
 */
export function mapDrawnNotes(tune, pieces) {
  const drawn = tune.lines
    .flatMap((line) => line.staff ?? [])
    .flatMap((staff) => staff.voices.flat())
    .filter((el) => el.el_type === "note" && !el.rest);
  if (drawn.length !== pieces.length) {
    throw new Error(`abcjs drew ${drawn.length} notes; the song has ${pieces.length}`);
  }

  /** @type {Map<string, Element[]>} */
  const notes = new Map();
  /** @type {Map<string, Element>} */
  const chords = new Map();
  drawn.forEach((el, i) => {
    const { noteId, chordId } = pieces[i];
    const group = el.abselem?.elemset[0];
    if (!group) throw new Error(`abcjs drew no element for note ${noteId}`);
    notes.set(noteId, [...(notes.get(noteId) ?? []), group]);
    if (!chordId) return;
    const symbol = el.abselem?.children.find((child) => child.type === "chord")?.graphelem;
    if (!symbol) throw new Error(`abcjs drew no symbol for chord ${chordId}`);
    chords.set(chordId, symbol);
  });
  return { notes, chords };
}
