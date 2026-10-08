/**
 * Staff events (Stream C owns): how other parts of the app talk to the staff
 * without importing its component. Clicks come out as note ids; highlights go
 * in as CSS classes toggled on the SVG elements mapped to each note id, so the
 * playhead and hover never re-render the staff.
 *
 * CONTRACT: exported names and shapes are frozen (see contracts/README.md).
 */

/** @typedef {{ noteId: string, anchorRect: DOMRect }} NoteClick */

/** @type {Set<(click: NoteClick) => void>} */
const clickHandlers = new Set();

/** @type {Map<string, Element[]>} */
let elementsByNote = new Map();

/**
 * Listen for clicks on melody notes (used by the chord dropdown to anchor itself).
 * @param {(click: NoteClick) => void} handler
 * @returns {() => void} unsubscribe
 */
export function onNoteClick(handler) {
  clickHandlers.add(handler);
  return () => clickHandlers.delete(handler);
}

/**
 * Called by the staff when a note is clicked.
 * @param {NoteClick} click
 */
export function emitNoteClick(click) {
  for (const handler of clickHandlers) handler(click);
}

/**
 * Called by the staff after each render with the SVG elements for each note id.
 * @param {Map<string, Element[]>} map
 */
export function registerNoteElements(map) {
  elementsByNote = map;
  for (const [className, ids] of marks) highlight(ids, className);
}

/** Marks that outlast a redraw: class name to note ids. */
const marks = new Map();

/**
 * Mark notes with a class that stays through redraws (a resize, a font load,
 * an edit) until it's marked again or cleared with an empty list: the key
 * step's hints, the chords step's start note, and the lesson's spotlit note.
 * @param {string} className
 * @param {string[]} noteIds
 */
export function mark(className, noteIds) {
  clearHighlight(className);
  if (noteIds.length === 0) marks.delete(className);
  else marks.set(className, noteIds);
  highlight(noteIds, className);
}

/**
 * Add a class to the given notes' SVG elements.
 * @param {string[]} noteIds
 * @param {string} className e.g. "is-playing", "is-hovered"
 */
export function highlight(noteIds, className) {
  for (const id of noteIds) {
    for (const el of elementsByNote.get(id) ?? []) el.classList.add(className);
  }
}

/**
 * Remove a class from every note.
 * @param {string} className
 */
export function clearHighlight(className) {
  for (const els of elementsByNote.values()) {
    for (const el of els) el.classList.remove(className);
  }
}
