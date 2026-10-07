# Final live screenshots

Taken 2026-10-07 from https://hearhear.up.railway.app, serving main at commit c6296e4 with the tutor in fixture mode. A Playwright script in headless Chromium drove each state from a fresh page load and took viewport shots. Each shot was then cut to a 256-color palette to keep the folder small.

Names follow `<WxH>-<theme>-<n>-<state>.png`. States 1 to 8 were taken at 1440x900 and 1280x800, in light and dark themes (32 files), plus one phone-width shot.

## What each shot shows

The state is the same at both sizes and in both themes.

- `*-1-landing.png`: the landing with beginner tips on. It shows the "Start here" tip, the guided-tour invitation and the two song cards.
- `*-2-ode-loaded.png`: Ode to Joy loaded with tips off. The key question is open, and no home is chosen yet.
- `*-3-wrong-guess.png`: C committed as home. The gentle invitation reads "Most ears hear home somewhere else in this tune", with "Check it by ear" and "Keep my choice" buttons and no verdict.
- `*-4-chord-dropdown.png`: D committed and the chord dropdown open at bar 4, beat 3. The options are V, ii, I, IV and vi, and each chip shows its shape, color and label.
- `*-5-v-i-drone-play.png`: V placed at bar 4 and I at bar 8, with Roman labels on and "Drone on home" switched on, during Play. The keyboard lights the drone.
- `*-6-tutor-reply.png`: a fixture tutor reply (a nudge) whose numbered listening steps render as an ordered list.
- `*-7-guided-tour.png`: the guided tour at step 3 of 8, "Find home by ear", in the strip on the keyboard dock.
- `*-8-accidental-menu.png`: the right-click accidental menu on G4 in bar 1, sitting below the note.
- `390x844-light-ode-loaded.png`: Ode to Joy loaded at phone width, in light theme.

## Checks at each state

Each shot recorded three checks: console errors (including page errors), CSP violations caught by a `securitypolicyviolation` listener, and axe violations from `@axe-core/playwright` once animations had settled.

| State             | 1440 light | 1440 dark | 1280 light | 1280 dark | 390 light |
| ----------------- | ---------- | --------- | ---------- | --------- | --------- |
| 1 landing         | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 |           |
| 2 ode-loaded      | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0 |
| 3 wrong-guess     | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 |           |
| 4 chord-dropdown  | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 |           |
| 5 v-i-drone-play  | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 |           |
| 6 tutor-reply     | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 |           |
| 7 guided-tour     | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 |           |
| 8 accidental-menu | 0 / 0 / 0  | 0 / 0 / 0 | 0 / 0 / 0  | 0 / 0 / 0 |           |

Each cell is console errors / CSP violations / axe violations. All 33 states came back clean.

## Problems found (not fixed here)

- **The guided tour's "Play the tune" can be ignored.** In step 2, a click on "Play the tune" within about a second of the step appearing does nothing, while the staff's Play is still disabled and shows "Loading the piano...". The step then waits until the viewer clicks again. A click after a second works. The shots wait one second before clicking.
- **The "Start here" tip covers part of a card.** On the landing it covers the text of the card below the song cards, so only "…ds under it." shows (all `*-1-landing.png`).
- **The wrong-guess invitation lands under the keyboard dock.** At both laptop sizes, choosing C leaves the invitation and its buttons below the dock until the viewer scrolls. The `*-3-wrong-guess.png` shots are scrolled to it.
- **Play scrolls the masthead out of view.** Play scrolls the page by about 17 px, which cuts off the masthead's top edge (all `*-5-v-i-drone-play.png`).
- **The staff's chord symbols use color and label only.** They are plain colored numerals (red V, blue I) with no shape. The label still carries the meaning, but the chips' shape pairing is missing. Bar 8's "I" also sits just under bar 4's degree row, so it reads as if it belongs to bar 4 (all `*-5-v-i-drone-play.png`).
- **The dropdown's "More below" fade overlaps an option.** The fade label sits on top of the partly visible next option, at 1440x900 (iii) and at 1280x800 (all `*-4-chord-dropdown.png`).
- **The tour strip covers the home chips at 1280x800.** At step 3 the strip and dock cover the home-note chips until the viewer scrolls or uses "Open the drone chords" (`1280x800-*-7-guided-tour.png`).
- **The staff is tiny at phone width.** At 390x844 the noteheads and the title are very small, and the dock takes about a third of the screen (`390x844-light-ode-loaded.png`).

Keyboard focus was checked once: Tab reaches the home-note chips with a 3 px solid outline.
