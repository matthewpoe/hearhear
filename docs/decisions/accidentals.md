# Right-click accidentals

Format: **date — decision.** Why. _Rejected:_ alternatives.

- **2026-10-07 — A context menu on a staff note sets its accidental, relative to the note's letter.** Matthew's spec: right-click (ctrl-click on a Mac, long-press on touch) a note and pick ♯, ♭, ♮, 𝄪 or 𝄫 on the letter the staff shows, to add a sharp or flat forgotten at input. No dragging. Shift+F10 and the ContextMenu key open it on the focused note. The browser's own menu is replaced on notes only. _Rejected:_ steps relative to the current pitch (raise or lower a semitone), which Matthew passed over for "relative to its letter".
- **2026-10-07 — A choice sets the pitch, not the spelling.** The song stores absolute MIDI and the key spells it (DECISIONS.md, the song model), so the menu's D♯ is MIDI 63 and shows as E♭ in a key that spells 63 that way. Rather than add a per-note spelling override to the schema, the menu says so on the choices it affects ("Shows as E♭ in this key"), and the announcement names both ("D♯4, shown as E♭4"). The next open shows the note's new letter (E, with ♭ checked). _Rejected:_ a stored spelling per note (a schema change, and every re-key and transpose would have to carry it).
- **2026-10-07 — The pitch is the letter's natural in the note's written octave plus the accidental.** The written octave, not the MIDI octave, so C♭5 is B4 (71) and B♯3 is C4 (60). A choice that falls off the piano (A0 flat, C8 sharp) is shown disabled. `src/staff/accidentals.js` holds the pure parts, with tests.
- **2026-10-07 — `song.setPitch(noteId, midi)` is one undoable action.** It keeps the note's timing and chord and refuses a pitch outside MIDI 21–108, the range `validateSong` enforces (the schema's, wider than the input keyboard's C2–C6). Picking the accidental a note already has changes nothing and only plays it.
- **2026-10-07 — The menu lives in the staff, not in `staffEvents.js`.** The staff's event contract is frozen, and only the staff needs the menu, so `Staff.svelte` listens for `contextmenu` and owns `AccidentalMenu.svelte`. It reuses the chord dropdown's placement module (below the note, else above, never under the keyboard dock) and the same page-coordinate positioning.
- **2026-10-07 — A choice plays the new pitch once (a live note, 600 ms) and announces it politely.** Focus returns to the note, which keeps the staff's single tab stop.
- **2026-10-07 — Discoverable by tooltip, not a tip.** Each note carries an SVG `<title>`: "Click for chords · right-click to change the accidental". No beginner tip: none of the current tips is about editing notes, and a line about sharps doesn't fit the chord tip it would join.

## Known gaps

- iOS Safari doesn't fire `contextmenu` on a long-press, so on an iPhone or iPad there's no touch path yet. A long-press timer on notes would fix it.
