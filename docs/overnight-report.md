# Overnight report: Oct 7, 2026

Written for Matthew at the start of the morning. Live site: https://hearhear.up.railway.app (tutor in fixture mode).

## At a glance

- **Main is deployed, verified and stable.** The last code change is `01d3018`, tagged **`known-good-0752`**. This report's own docs-only merge gets the next `known-good-HHMM` tag. After every merge tonight, the live golden path passed against the deployed site.
- **Rollback:** `known-good-pre-overnight` (7577fd2) is the state you left. Every verified deploy since has its own `known-good-HHMM` tag (ET).
- **Nothing was reverted.** Every merge passed CI on both push and pull_request, passed a Fable gate or re-review with no new high, and passed the live check.
- **Checkpoint 3 PASSED** (0 high). Its three mediums were fixed and re-verified with live probes. Live mode is ready once you've done the hand checks below.

## Your hands-on list, in order

1. **Confirm the Anthropic Console spend limit** for the workspace and its amount. It's the only cap that survives redeploys and concurrency.
2. **Flip live mode:** set `TUTOR_MODE=live` on Railway. Before you flip, confirm:
   - `TUTOR_ACCESS_CODE` is the rotated passphrase, three or more words.
   - `TUTOR_DAILY_TOKEN_BUDGET` and `TUTOR_RATE_LIMIT` are at the defaults (500000; 10/minute;100/day), not the eval values.
   - Railway's edge replaces a client-sent `X-Forwarded-For`. To test, trip the 10/minute limit from one machine while sending a spoofed header, and check it still trips.
   - Railway's HTTP logs don't record the `X-Tutor-Access` header.

   After the flip, check:
   - `/api/health` reports `live`.
   - A request without the code gets 401.
   - A request with the code streams.

3. **Run the lesson capture:** `make capture-lessons` (key and passphrase from your shell; it confirms before sending). Commit `content/lessons/recorded/`. The guided tour and the recorded-lesson replay pick the lessons up automatically. Replay needs no passphrase, even in live mode.
4. **Run the live eval locally:** `make eval-live` (it runs `--limit 3` first and shows how to check the cost before the full 123 requests). Commit the results. The trust panel then shows real numbers.

Also waiting on your ear:

- **Ear-check page:** [`docs/overnight/ear-check.md`](overnight/ear-check.md). Pick one wrong-ish chord per song. The recommendation is Ode bar 8 beat 3, vi against I. Then replace the guided tour's placeholder content, currently marked **Draft**.
- **St. James:** check the verse-3 re-fit ([`docs/overnight/st-james-verse3.md`](overnight/st-james-verse3.md)) and decide the tempo. It's 76 to the quarter, so the half note in cut time is 38. That may be the "timing" you heard.

## What merged tonight (PRs, in order)

| PR  | What                                                                                                                                                       | Tag             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| #19 | Your review of PRs 8–11: server hint clamp, touch audition, dropdown kept on screen, sample credit, refusal copy, budget                                   | known-good-0216 |
| #22 | Trust panel placed under the tutor                                                                                                                         | known-good-0220 |
| #23 | Your review of PRs 12–22: nudge metric on the model's own restraint, eval strips the title, `make eval-live`, docs                                         | known-good-0223 |
| #24 | Tutor prompt revision (your six points), song title in the data tags, steps as a list, `withheld` separate from `dropped`                                  | known-good-0247 |
| #25 | St. James re-fit to verse 3 (one note split)                                                                                                               | known-good-0323 |
| #26 | `make capture-lessons`                                                                                                                                     | known-good-0328 |
| #27 | Usability round: staff first, one-click key, chord drones, A–J chord row, per-song memory, voice-leading switch                                            | known-good-0335 |
| #28 | Checkpoint 3 fixes: cut-off streams charged, in-flight cap (`TUTOR_MAX_CONCURRENT`, 503 busy), hidden key kept from the model                              | known-good-0347 |
| #29 | Docs: DECISIONS overnight section, rationale notes, deferred, backlog, ear-check page                                                                      | known-good-0413 |
| #30 | Second usability pass: gentle key feedback, first-click fixes, tour gating, tutor demo notice                                                              | known-good-0504 |
| #31 | Right-click a note to change its accidental (your stretch item)                                                                                            | known-good-0527 |
| #32 | Guided tour (Draft content) docked on the keyboard, recorded lessons replay without a passphrase                                                           | known-good-0605 |
| #33 | Play bar N / Play from bar N, and Drone on home; the prompt's listening steps use them                                                                     | known-good-0638 |
| #34 | Polish: tutor steps as a list, ♯/♭ everywhere, tour scrolls to its target                                                                                  | known-good-0659 |
| #35 | Final touches: the tour's Play waits for the piano, the guess result scrolls into view, dock clicks don't jump the page, the dropdown fade loses its label | known-good-0752 |

## Screenshots

Final state at 1440×900 and 1280×800 in both themes, plus a 390×844 check: [`docs/overnight/screens/`](overnight/screens/).

There are 33 shots: 8 states × 2 sizes × 2 themes, plus the phone shot. Every state had 0 console errors, 0 CSP violations and 0 axe violations. The [screens README](overnight/screens/README.md) lists each shot and the per-state results. The states:

1. landing with beginner tips;
2. Ode to Joy loaded;
3. a wrong key guess with the gentle invitation;
4. the chord dropdown at bar 4 beat 3;
5. V and I placed with Drone on home during Play;
6. a tutor reply with its listening steps as a list;
7. the guided tour in the dock strip;
8. the right-click accidental menu.

## Decisions I made for you

Each is recorded in DECISIONS.md, under "Overnight, Oct 7" or the section named.

1. **Gentle feedback on a demo key guess.** Any guess used to be confirmed as fact. Now it reads "You chose D major as home." A demo with a known key adds either "That's the home most ears hear" or a gentle "listen again" invitation. It never says "wrong" and never names the answer. Both first-time walkthroughs hit this as a blocker. It amends D14.
2. **The tutor's listening steps name only controls the app has.** Your examples, "play bar N" and "hold the drone on 1", weren't possible at first. I built **Play bar N** and **Drone on home** (#33), and the prompt now uses your examples.
3. **The four usability streams merged as one integrated PR** (#27). Two pairs of streams rewrote the same files.
4. **#25 and #26 merged before #27,** because #27 was in a fix round and the other two were independent. The order was a priority, not a dependency.
5. **The guided tour is a strip on the keyboard dock,** not a floating panel. Its first review found the panel covering what each step asked you to click.
6. **Recorded lessons replay in live mode without the passphrase.** Your copy promises this. They're static files with no API cost, and the security review passed.
7. **Beginner tips stay on by default** (your call). Each tip shows only when its subject is on screen and counts as done when you act. The "Start here" tip covers the idle Chords card on the landing, because there's no clear spot at 1280 or 1440.
8. **Kept from the review rounds:** a request the API refuses before streaming charges nothing; a hidden-key snapshot also drops the title; the Draft badge stays on the guided tour.
9. **PR #23 kept history as it was pushed.** An agent hard-reset its branch after my push. I didn't force-push. There's a local backup branch, `backup/review-12-22-pre-scope`, to delete when convenient.

## Checkpoint 3 (security and spend, before live mode)

**PASS:** 0 high, 3 medium (fixed in #28), 6 low (accepted; listed in deferred.md). The re-review verified the fixes with live probes against a dummy-key server:

- a cut-off stream is now charged input + MAX_TOKENS;
- the in-flight cap returns 503 busy and releases on disconnect;
- a hidden-key prompt contains no key, pitches, letters or title.

The ungated lesson replay (#32) had its own security review: 0 high, 0 medium. Ids are validated, path traversal is refused, and the rate limit still applies first.

## Known gaps and what's deferred

From the final live pass:

- The masthead's top edge gets cut off after you pick a chord from the dropdown (the page scrolls 17 px) or click a label style (62 px).
- The "Start here" tip covers the idle Chords card on the landing.
- Staff chord symbols are colored numerals without the shape the chips have (D3). Bar 8's "I" sits just under bar 4's degree row.
- The phone layout is cramped: the staff draws small and the dock takes about a third of the screen.
- A key guess made within about half a second of loading a tune can still land under the dock.

Also open:

- **Accidentals on iOS:** no touch path for the right-click menu.
- **Audio warnings:** "AudioContext was not allowed to start" appears on first paint. It's harmless, but fixing it means reworking how samples are decoded.
- **Untested by ear:** the drone may re-attack for a moment when a chord is chosen from the dropdown with Drone on home on.
- **Placeholder content:** the guided tour (Draft), the lesson plan, and the ear-check picks.

The deferred review findings are in [`docs/deferred.md`](deferred.md), and the backlog is in [`docs/backlog.md`](backlog.md).

## How tonight ran (for the write-up)

- Dozens of agents in parallel worktrees: builders, Fable reviewers, fixers and walkthroughs, each with a stall watcher.
- Every stream went through a Fable merge gate, a fix round, and a re-review.
- Merges required CI green on both events for the exact head SHA.
- After each deploy, the e2e suite ran against the live URL and the deploy was tagged.
- Two first-time-user walkthroughs (a musician and a non-musician) and two live-site visual passes drove the last rounds of fixes.
- Rollback was never needed: nothing was reverted.
