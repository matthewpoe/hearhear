# Key box layout

Format: **date — decision.** Why. _Rejected:_ alternatives.

Matthew said the key box after choosing D major "looks like a jumble of text" and asked that the decision points and calls to action be easy to skim.

- **2026-10-07 — Before a choice: one question, two ways in, one picker.** The heading asks the question in large type. Under it are two cards, side by side on a wide screen, each with a small-caps eyebrow. "By eye" gives a reader one line to look for: "The staff's sharps and flats, and the note phrases rest on." "By ear" has "Help me find it" as a filled green button, because it plays the tune over chords: `--sound` is what you hear. The mode and home controls sit together in one tinted picker. Their labels, "It sounds" and "Home note", are small-caps eyebrows on their own line above the chips. _Rejected:_ a tooltip for the reader's clue. Cut to one line, the clue no longer needs one, and a tooltip would hide the by-eye path's only content.
- **2026-10-07 — After a choice: a result card with one primary action.**
  - **The card:** a "You chose" eyebrow, the key in large violet type ("D major"), and the feedback line under it ("That's the home most ears hear in this tune.").
  - **The primary action:** a single violet `--accent` button, "Next: find the chords". It advances the step path, as "Done: on to chords" did, and replaces it.
  - **Secondary:** "Not sure? Check it by ear" is a text link beside the button, and one small hint line says where the chords are. The two-way cards go away once a home is chosen, and "Check it by ear" opens the same finder.
  - **The re-key explanation** is one small hint line under the chips. The chip group points to it with `aria-describedby`, and the "Major unless you pick Dark" note joins the same line.
  - **Drone, Scale degrees and "Play it in another key"** sit below the card as secondary controls.
  - **Placement:** the card stays below the picker, so picking a chip never moves the chips out from under the pointer.
  - _Rejected:_ the result card above the picker, which shifts the chips on every click.
- **2026-10-07 — The full sentence stays in the DOM.** "You chose D major as home." is still one paragraph's text. It is built from the copy in `content/explainers.json` as an eyebrow, the key, and a visually hidden "as home." Screen readers and tests get the same words, and the large key is only styling.
- **2026-10-07 — Every hook is kept, except the advance button's name.**
  - **Unchanged:** `#key-prompt`, `#key-prompt-title`, `[aria-controls='key-finder']` (before a choice, as before), the "Home note" group, the "It sounds" radios, `#rekey-hint`, `#toolbar` (the transpose details), `#key-finder` and the step path.
  - **Renamed:** "Done: on to chords" is now "Next: find the chords". `layout.spec.js` and `golden-path.spec.js` use the new name.
  - **Test fix:** two non-exact `"Next"` locators in `guided-path.spec.js` now use `exact: true`, so they don't also match the new button.
  - **Style:** the current step's number in the step path is violet now, not ink.
