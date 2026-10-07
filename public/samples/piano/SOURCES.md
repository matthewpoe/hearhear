# Piano samples

**Salamander Grand Piano** by Alexander Holm (a Yamaha C5, recorded at 48 kHz/24 bit), licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/), which allows redistribution and modification with attribution.

- Taken from the MP3 renders Tone.js hosts at `https://tonejs.github.io/audio/salamander/` (repository `Tonejs/audio`, folder `salamander/`, whose README carries the author's licence note). Downloaded 2026-10-06.
- 17 notes, every minor third from C2 to C6: C, D#, F#, and A in octaves 2 to 5, plus C6. File names use `s` for sharp (`Ds4.mp3` is D#4). `Tone.Sampler` repitches the nearest sample for the notes between.
- **Changes made:** each file is cut to its first 4 seconds with a 1-second fade-out, and re-encoded as VBR MP3 (`ffmpeg -t 4 -af afade=t=out:st=3:d=1 -c:a libmp3lame -q:a 6`). About 0.5 MB in all, down from 1.3 MB.

Attribution: "Salamander Grand Piano" by Alexander Holm, CC BY 3.0, trimmed for Hear Hear.
