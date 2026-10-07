# Transport keys decisions

Stream: `feature/transport-keys`, from Matthew's request on Oct 7, 2026 (Space revised to "anywhere in the app should start the song playing from the top").

- **Space while stopped always plays from the top,** whatever the Play button's scope. While playing it pauses, and while paused it resumes from the note it stopped on. The Play button still follows "From the top" / "This bar" and always starts fresh. Rejected: Space following the scope (the first spec), which Matthew replaced.
- **Pause holds the playhead.** The note playback stopped on stays lit, and the row says "Paused. Space resumes.". Resuming replays that note, because the audio API starts on note boundaries.
- **Left while playing goes back to the start of the bar under the playhead. A second Left within 400 ms goes to the top.** Both jumps go through `playWithVisuals`, the same path as "Play bar N", so the playhead, the keyboard lights, and swing timing follow. While stopped, Left is left alone for the staff's note navigation.
- **One pure function routes every press** (`src/staff/transportKeys.js`, unit-tested). Space and Left are left to the page when:
  - a modifier is held;
  - `fieldOwnsKey` says a field owns the key;
  - the chord dropdown or the accidental menu is open;
  - a tune is being recorded;
  - focus is on a staff note;
  - for Space, a control (button, link, switch, radio, or piano key) has keyboard focus.
- **"Keyboard focus" is tracked by the transport, not read from `:focus-visible`.** A pointer press marks the next focus as mouse focus; a key press marks it as keyboard focus. Chrome counts a radio focused by clicking its label as `:focus-visible`, which would have made Space dead after clicking a label style. Rejected: `:focus-visible` alone.
- **The listener runs on window in the capture phase and takes Space's keyup too,** so a mouse-focused button or piano key doesn't also activate.
- **The shortcuts are in the Play button's tooltip** (`explainers.json` `options.playKeys`). They are not added to `controls.json`: the tutor's listening steps name on-screen controls, and a keyboard shortcut isn't one.
