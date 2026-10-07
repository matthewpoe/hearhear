# Key lights: gold melody, green drone

Format: **date — decision.** Why. _Rejected:_ alternatives.

Matthew asked for the melody on the keyboard to look better than gray, in the Mardi Gras palette: violet, green and a subtle gold.

- **2026-10-07 — Three interface colors, each for one job.** Violet is what you do: selected and pressed controls, primary actions, focus. Green is what you hear: the sound controls, and now the drone's keys. Gold (`--melody`) is the melody sounding now, on the piano key and on the staff's playing notehead. Function color (blue circle, yellow triangle, red square) stays the chord's alone. _Rejected:_ a green melody light (the coordinator's first suggestion), which Matthew overrode for gold, and which would also collide with the drone, now green.
- **2026-10-07 — Before this change, everything lit the same gray.** Shots taken mid-playback on main showed the melody key, held keys and the drone's three keys all in `--key-glow-melody` gray. Playback also wrote the drone into `keyboardLights.melody`, so the piano couldn't tell the two apart. `KeyboardLights` now has an optional `drone` list. `playback.js` and the chord dropdown write the drone there, and `melody` holds only the sounding note. The piano is the only reader. The drone test in `listening.spec.js` now checks for the `drone` class. _Rejected:_ having the piano work out the drone from `homeDrone`, which would miss the key finder's own test drones.
- **2026-10-07 — Each light has its own form, not just its own color.**
  - Melody and held keys get a gold fill that runs from champagne at the top (`--melody-soft`) to ochre (`--melody`, #c08a2c) where the labels sit. It has an inner glow, and white keys also get a soft outer glow. It lights in `--dur-fast` and fades out over 280ms on release.
  - Chord tones keep their flat function fill and shape mark. When the melody note is also a confirmed chord tone, the key keeps the chord fill and gets a gold ring.
  - Drone keys get a pale green tint and a green bar across the top.
  - Chord tones before a guess stay neutral gray, because any color would hint at the key.
  - _Rejected:_ a flat gold block, which is loud and reads like a function fill.
- **2026-10-07 — The gold is kept apart from subdominant yellow by luminance and form, and checked for color blindness.** `--melody` #c08a2c against `--fn-subdominant` #f4c430 is 1.85:1. Simulated with Machado 2009 at full severity, the gap is 1.89 for protanopia, 1.83 for deuteranopia and 1.79 for tritanopia. Under CVD both read as yellow-brown, so lightness and form carry the difference: subdominant is a bright flat fill with a triangle, and the melody is a darker gradient fill with a glow and no shape. Against the subdominant on-key edge #8a6a00 the gold is 1.67 (1.62 to 1.69 under CVD). That edge is only ever an outline, never a fill. The keys are ivory and black in both themes, so the gold fill is the same in both, and only the champagne top and the glow are retuned for the dark page. _Rejected:_ a lighter "metallic" gold near #e0c060, which would be about 1.1:1 against subdominant yellow.
- **2026-10-07 — Every lit key's labels pass 4.5:1.**
  - On the gold fill: `--key-black` is 5.7 (light) and 6.5 (dark).
  - On the champagne top: 13.6 and 13.4, though the labels sit lower, on the ochre.
  - On the drone tint: 13.7 and 15.7 on white keys, 10.1 and 8.0 on black keys.
  - The drone bar is 4.3 on its white-key tint and 5.7 on its black-key tint (3:1 needed).
  - The gold fill against an unlit ivory key is 2.4. The lit state is not the only cue: the staff's gold notehead marks the same note.
  - axe found 0 violations mid-playback in both themes, switched with the app's own Dark mode toggle.
- **2026-10-07 — Reduced motion keeps the fill and drops the glow and the fade.** With `prefers-reduced-motion: reduce`, `--dur-melody-out` and the other durations are 0, and the inner and outer glows are removed. The gold fill alone marks the note.
