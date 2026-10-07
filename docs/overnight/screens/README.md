# Final live screenshots

Taken 2026-10-07 from https://hearhear.up.railway.app, serving main at commit 01d3018 (tag known-good-0752) with the tutor in fixture mode. Before the run, the live bundle (`assets/index-DmXtEjpk.js`) stayed the same for a minute and already had PR #35's change. A Playwright script in headless Chromium drove each state from a fresh page load and took viewport shots. It waits for the staff to render before acting on it. Each shot was then cut to a 256-color palette to keep the folder small.

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

## Problems found and their status

An earlier pass at c6296e4 found eight problems. PR #35 fixed five of them, and this pass checked each one again at 01d3018.

**Fixed:**

- **The guided tour's "Play the tune" could be ignored.** Clicked the moment step 2 appeared, it now waits for the piano and advances to step 3. The script no longer waits first (`*-7-guided-tour.png`).
- **The wrong-guess invitation landed under the keyboard dock.** The result now scrolls into view on its own, and the shots are not scrolled by the script (`*-3-wrong-guess.png`). One edge case remains. A guess made before the staff finishes rendering, within about half a second of loading the tune, is scrolled into view before the staff pushes the card down, so it still ends up under the dock.
- **The dropdown's "More below" fade overlapped an option.** The fade has no text now (`*-4-chord-dropdown.png`).
- **The tour strip covered the home chips at 1280x800.** Step 3 now scrolls the key card above the strip. The first row of chips is clear, and the B♭/B row sits just above the strip (`1280x800-*-7-guided-tour.png`).

**Still present:**

- **The masthead's top edge is cut off in the V and I shots.** The cause is not Play or a dock click. Picking a chord from the dropdown at bar 8 scrolls the page by 17 px, and clicking the Roman label scrolls it by 62 px (all `*-5-v-i-drone-play.png`).
- **The "Start here" tip covers part of a card.** On the landing it covers the text of the card below the song cards, so only "…ds under it." shows (all `*-1-landing.png`).
- **The staff's chord symbols use color and label only.** They are plain colored numerals (red V, blue I) with no shape. The label carries the meaning, so nothing relies on color alone, but the shape pairing that the chips have is missing. Bar 8's "I" also sits just under bar 4's degree row, so it reads as if it belongs to bar 4 (all `*-5-v-i-drone-play.png`).
- **The staff is tiny at phone width.** At 390x844 the noteheads and the title are very small, and the dock takes about a third of the screen (`390x844-light-ode-loaded.png`).

Keyboard focus was checked once, at c6296e4: Tab reaches the home-note chips with a 3 px solid outline.
