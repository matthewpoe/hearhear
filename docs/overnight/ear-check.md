# Ear check: the wrong-ish chord in each demo

**Status: pending Matthew's ear check.**

Stream G's guided path needs one deliberate wrong-ish chord per demo: a chord that contains the melody note, so it fits on paper, but has the wrong job for the phrase, so a learner hears why the better chord wins. DECISIONS.md (Phase 1 plan, Oct 7) already places Ode's at bar 8 beat 3. This page lists 2–3 candidates per song for you to pick by ear.

Every claim below was checked against the song files with the app's own theory core (`fit`, `analyzeNoteOverChord`, `candidates`, `functionOf`): positions come from the notes' ticks (12 per quarter, 4/4; St. James has a one-beat pickup, bar 0). "Fit" is the score the dropdown sorts by, 0 to 1, with the context chord in the last column already placed. In every candidate the wrong-ish chord ties the better one or beats it, so the dropdown's ranking alone can't tell them apart. Only the ear can.

## Ode to Joy (D major)

| #   | Where        | Melody         | Wrong-ish                           | Better   | Fit (wrong / better) | Place first  | What you'll hear                                                                                                                 |
| --- | ------------ | -------------- | ----------------------------------- | -------- | -------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| O1  | bar 8 beat 3 | D4 (held half) | **vi**, Bm (B D F#), D is its third | **I**, D | 1.00 / 1.00          | V on bar 8.1 | The tune lands on home, but the chord swerves sad and sideways (a deceptive cadence), so the last note never feels like the end. |
| O2  | bar 8 beat 3 | D4 (held half) | **IV**, G (G B D), D is its fifth   | **I**, D | 1.00 / 1.00          | V on bar 8.1 | The tune lands, but the chord drifts away from home ("moving away"), so the song stops instead of finishing.                     |
| O3  | bar 4 beat 3 | E4 (held half) | **ii**, Em (E G B), E is its root   | **V**, A | 1.00 / 1.00          | none         | The first phrase should end on a question; with ii it ends soft and vague, with no pull back to the opening.                     |

Notes:

- O1 and O2 are the spot DECISIONS.md names. Hear them after V on bar 8 beat 1 (the "3 2" of "3 2 1"), so the audition plays V, then the candidate.
- At bar 8 beat 1 (E4, dotted quarter), with I placed on beat 3, the dropdown ranks **ii** (0.95) a hair above **V** (0.92): the D passing on beat 2½ clashes a little with A major. Not a candidate here, but if the guided path asks the learner to choose the chord before the landing, the top suggestion won't be V. Worth knowing for Stream G.

## St. James Infirmary (E minor)

| #   | Where                  | Melody           | Wrong-ish                          | Better             | Fit (wrong / better) | Place first  | What you'll hear                                                                                                           |
| --- | ---------------------- | ---------------- | ---------------------------------- | ------------------ | -------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| S1  | bar 4 beat 1 ("there") | B4 (whole bar)   | **i**, Em (E G B), B is its fifth  | **V**, B (B D# F#) | 1.00 / 1.00          | i on bar 5.1 | The line hangs on a question at the half-way point, but the chord already answers it, so the middle sounds like an ending. |
| S2  | bar 8 beat 1 ("bare")  | E4 (dotted half) | **VI**, C (C E G), E is its third  | **i**, Em          | 1.00 / 1.00          | V on bar 7.4 | The mournful tune lands home, but the chord brightens to major and swerves, so the end sounds unfinished and oddly sunny.  |
| S3  | bar 4 beat 1 ("there") | B4 (whole bar)   | **III**, G (G B D), B is its third | **V**, B           | 1.00 / 1.00          | i on bar 5.1 | A bright major chord where the blues wants tension: the phrase relaxes instead of leaning back toward home.                |

Notes:

- Spelling: V in E minor is B major with D#; the app places the plain triad, not B7.
- For S1 and S3, i on bar 5 beat 1 is there so bar 4's chord stops at the bar line and the next phrase starts back home, which is what makes the half cadence audible.
- S1 is the classic half cadence (Em ... B7 in most performances). S2 is the minor-key twin of O1, a different song showing the same idea.

## How to audition one

In the deployed app, https://hearhear.up.railway.app:

1. **Load the song.** Click its card under "Load a song" (or its button next to "Song" in the masthead once a song is open). The tune opens on the provisional C with key labels hidden. If the tab already holds your earlier edits to that song, they come back; clear stray chords as in step 5.
2. **Commit the key.** In "What key is this tune in?":
   - Ode to Joy: leave "It sounds" on **Bright (major)** and click the **D** chip under "Home note".
   - St. James: click **Dark (minor)** first, then the **E** chip.

   One click commits; labels and colors appear.

3. **Place the context chord** from the "Place first" column. Click that note on the staff to open the chord dropdown, then press its letter key (below) or click the chord. Enter or a click commits.
4. **Open the candidate's note.** Click the note at the "Where" bar and beat. The dropdown ("Chord at bar …") lists the likely chords, best fit first.
5. **Compare.** Hover the wrong-ish option, then the better one: each hover plays that bar with the candidate under the note, and any chord already placed earlier in the same bar plays before it. Number keys 1–7 audition by degree too (5 auditions V). Then commit one by pressing its letter key with the dropdown open, and press **Play** for the whole tune. To swap, reopen the note and press the other letter; Backspace or Delete clears the chord on the selected note.

The letter keys (the A–J row, set to chords by default) place the diatonic chord on each degree:

| Key   | A   | S   | D   | F   | G   | H   | J    |
| ----- | --- | --- | --- | --- | --- | --- | ---- |
| Major | I   | ii  | iii | IV  | V   | vi  | vii° |
| Minor | i   | ii° | III | iv  | V   | VI  | VII  |

So for O1: open bar 8 beat 1, press **G** (V); open bar 8 beat 3, hover vi then I, press **H** (vi), Play; reopen and press **A** (I), Play.

For S1 and S3, the hover audition plays only bar 4, so the previous bar's chord isn't heard. For S2, V sits in bar 7, so the bar 8 audition doesn't include it either. For all three, commit each option and press **Play** to hear it in context.

## How to pick

Your call. My read for a non-musician:

- **Ode: O1 (vi at bar 8 beat 3).** The deceptive cadence is the most obvious "that didn't land" in the whole set, and it's where DECISIONS.md already put it. Choosing I then gives the V-I landing the guided path is built around. O2 is subtler; some ears hear IV-to-the-end as an "amen" and not as wrong.
- **St. James: S1 or S2.** S2 is easier to hear (a bright major chord on the last, saddest word), but it teaches the same lesson as O1. S1 teaches a second idea, that the middle of a tune should ask a question and not answer it, but it's quieter: an Em under "there" sounds calm rather than wrong until the next phrase starts on Em again. If the two demos should show different ideas, pick S1; if each should be as obvious as possible, pick S2.
