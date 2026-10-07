# Backlog

Improvements and ideas we'd build next: feature proposals, polish, Matthew's feedback items, and everything cut to the 8-hour line. Nothing here blocks the golden path. (Review findings we knowingly left unfixed live in `docs/deferred.md` instead.) This list feeds the rationale's "how I'd extend this" section.

## Cut to the 8-hour line (Matthew, Oct 7)

- **Record mode with rhythm guessing and duration editing.** Noodle mode ships; the theory for rhythm guessing is built and tested. **Prerequisite, Matthew's spec:** computer keys are tapped (held about 100 ms), not held like piano keys, so count a rest only after a full beat of silence. A tapped note reads as its full gap; a long note means holding the key. Add a test that taps Ode to Joy with 80–150 ms holds at its tempo and recovers its exact rhythm, and update Stream A's decision log.
- **The meter prompt** ("Does it lilt in 3 or march in 4?") with the click test, plus a count-in bar before the click.
- **The automated demo-video pipeline** (Playwright shot list, Tone.Recorder audio, ffmpeg mux, sizzle reel). Matthew records the walkthrough by hand instead.

## Theory and naming

- **Dominant sevenths named by what follows (option b).** A non-V dominant seventh is applied (V7/x, red) only when the next placed chord is its target; otherwise it keeps its plain numeral and table function (I7 tonic, IV7 subdominant), as in blues. Needs a contract change: `numeralOf` and `functionOf` take the following chord. The alpha uses context-free naming (option a).
- **Blues I7 and IV7** as tonic and subdominant colors, which follows from the item above.
- **Applied leading-tone chords** (vii°7/x) detected in `numeralOf`, alongside V7/x.
- **Real triplets** in the ABC writer, instead of abcjs approximations.

## Tutor

- **A Stop button** while a reply streams (the abort is already wired).
- **A per-reply check** that the hint level doesn't exceed what was asked, counted for the pedagogy eval.
- **A request-id middleware,** so 413 and 429 rejections carry an id too.

## Experience

- **The V–I landing hook from the dropdown** into the signature moment (the red square rounding into the blue circle).
- **Out-of-scale notes highlighted on the staff** during key finding.
- **Gently shaded likely chord-change points** in the chip row (downbeats, phrase ends).
- **A "Play a melody" card** in the empty state, beside "Load a song".
- **A synth fallback** that keeps sound working when the piano samples fail to load.
- **The selected note** shown on the staff; numeral annotations centered under their notes.
- **Glissando** across on-screen keys.

## Extensions from the PRD

Lyrics under the staff; a full Nashville chart view and slash chords; an idiom picker with idiom-specific vocabularies; intermediate and advanced levels; Web MIDI and microphone input; persistence; a third demo tune ("When the Saints Go Marching In").
