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
- **A Swing switch in the tool row, for every song.** It's on when the song's `swing` is above 1. `song.setSwing` turns it on (ratio 2) or off (the field is dropped) as one undoable step, so it persists and reaches the tutor snapshot. The staff's "Swing" marking follows. Rejected: a UI-only flag, which wouldn't persist or reach the tutor; and showing the switch only on swung songs, since Matthew wants a swung Ode to be possible.
- **Voice leading is back in the tool row,** beside Words and Swing, after Matthew found it hidden on the Chords card. Rejected: keeping it on the Chords card.
- **Print moved under a small "More" menu** so the row still fits one line at 1280 with all three switches showing. The row may wrap only while a status ("Loading the piano…", "Paused") sits beside Play, rather than overflow the page, which had pushed the guided tour's strip off screen. Rejected: shortening the label-style names, which are the system names the tooltips teach.
- **controls.json gains `swing` and `words`,** since the buttons read their labels from it. The tutor prompt doesn't name Voice leading, Swing, or Words, so the prompt is unchanged.
- **The big button matches Space:** Play while stopped, Pause while playing, Resume while paused. A small round Stop beside it ends playback or a pause and goes back to the top; it is disabled while stopped. "Paused." is announced to screen readers but not shown, so pausing doesn't wrap the row. Rejected: a reserved status slot, which takes width the row doesn't have at 1280; Stop only in More, which hides the one way to leave a pause.
- **A click on the already-focused control clears its keyboard flag.** No focusin fires in that case, so after Escape refocused More, a click left it keyboard-flagged and Space closed the menu.
- **The tool row's gaps tightened from 16 px to 8 px** so Stop fits on one line at 1280 on St. James. On phones the transport group wraps.
