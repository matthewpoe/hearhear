# Rationale notes

Raw material for the written rationale and the video talk track, organized under the brief's headings. Seeded from planning conversations with Claude (Sep 26, Sep 27, and Oct 6, 2026). The build session keeps this file current; I write the rationale from it.

## Why this theme

- Theme 1, Exploration & Understanding. The brief asks for one theme. Hear Hear is a teacher: it helps me build a deep, durable understanding of harmony by ear, which is the brief's "explainer for a technical concept" made interactive and audible.
- Theme 2's "real control over iteration, variation, and refinement" is a supporting point, not a second theme: every suggestion is something I audition, compare, and change, never a generate button.
- It's a real problem of mine. I've been doing recurring ear-training sessions with Claude, working songs out at the piano by ear ("Heart with No Companion," "Christmas Angel," "Make Me Down a Pallet on Your Floor"). Hear Hear is the tool I wanted during those sessions.

## What's non-obvious

- **Think in relationships, not pitches.** The core idea. Hear Hear treats music as relative: 1 is wherever home is (movable do), melody is scale degrees, chords are numbers, and what you learn are intervals and shapes rather than notes in a particular key. That's how jazz, Nashville, and classically trained musicians carry a tune into any key, instead of reading literal notes off a page. Every surface reinforces it: the number row, degree labels on the keys, Roman numerals and Nashville labels, function colors, and transpose, which changes the sound while everything you're thinking about stays the same.
- **A teacher, not a transcriber or a composer.** Existing tools either transcribe what you play (ScoreCloud) or generate chords for a melody (Hookpad Aria). Hear Hear helps you hear what an existing song actually does, and makes you do the hearing.
- **The ear is the verifier.** Claude is a strong theory and cultural tutor and is sometimes confidently wrong about music; I saw both in my own sessions (it once swapped left and right hands, and once set up an A/B test where one chord's voicing sat much lower, so the comparison tested register instead of harmony). So every Claude suggestion comes back as structured data the app can play, and my ear decides. Cheap human verification of model output, in a domain where it's fun.
- **Shorten the feedback loop, not the thinking.** The tool makes testing a guess instant (hear it, compare it, change it). It never makes the guess for me. Default tutor behavior is a nudge, not an answer.
- **The number row is the instrument.** Keys 1 to 7 play scale degrees, so the key is irrelevant to my hands and I enter relationships, not pitches. That's how I already think about these songs, and it builds relative hearing into the input itself.
- **Evals back the trust claim.** A small eval measures how often the tutor's suggestions contain the real chord, whether it withholds the answer at nudge level, and its latency; a trust panel in the app shows the results.

## Key decisions and tradeoffs

- **Cut microphone transcription.** My first idea was a tool that listens to me play and writes a lead sheet. An adversarial review showed rhythm is the hard problem, piano through a laptop mic is messy, and ScoreCloud already does it well. Transcription was the least novel part, so it went.
- **Pivoted to teaching after rereading the brief.** The brief values depth over breadth and requires reviewers to evaluate it without domain expertise. A notation-centered tool fails that test; an audible, guided one passes.
- **Suggestions are auditioned, not applied.** The chord dropdown plays each candidate under the melody on hover, with fixed-register voice leading so A and B differ only in harmony. That voicing rule comes directly from a failed A/B test in one of my sessions.
- **Key and meter finding are activities, not settings.** I noodle first; after a phrase, the app asks "Is 1 really home?" and offers playable tests (drone, last note, cadence; a 3-vs-4 click for meter). Algorithmic key ranking offers candidates, never verdicts, because it's wrong in exactly the interesting cases, like blue notes in a major-key folk tune.
- **Number row over an on-screen keyboard or letter keys.** Mousing a melody is slow and doesn't feel like a piano; letter keys tie input to a key. The number row does neither. Octaves are fixed rows, like a piano: the number row is home (8, 9, 0 continue upward), Q–U is the octave below, A–J two below, and the arrows shift the whole window. Nearest-note placement was rejected because the same key played different notes depending on context, so no muscle memory could form.
- **Rhythm is guessed, then fixed by hand.** Record mode takes the most common gap between notes as the beat and snaps the rest; the guess is shown, never trusted, and one key reverts to quarter notes. Plain quarter-note entry was rejected as too slow; real-time swing capture stays a stretch goal.
- **Duration edits ripple** like a text editor, so halving never leaves a stray rest and doubling never overlaps (Phase 0 decision).
- **Minor keys:** the number row plays natural minor, with the raised seventh on Shift+7, because folk and blues melodies move in natural minor and the raised seventh mostly appears at cadences. Nashville numbers count from the minor tonic (1m, not 6m) so chord 1 and melody degree 1 are always the same note.
- **Color and shape carry meaning.** Bauhaus primaries map to harmonic function (blue circle tonic, yellow triangle subdominant, red square dominant, after Kandinsky's 1923 Bauhaus survey). Nothing is colorful without a reason; color is always paired with a shape and a label.
- **Stack:** FastAPI on Railway (my familiar deploy) serving a Svelte frontend; all music theory runs in the browser so audition never waits on the network. Rejected HTMX because the client must own the song model, and plain JS modules because one model drives many views.
- **Claude Opus 5.5 for the tutor**, the model I'd use for this conversation outside the product. Tool use with a schema, streamed explanations, server-side key and system prompt, a forced tool call, rate limits, and a hard spend cap.
- **Demo tunes are public domain:** Ode to Joy (major, I and V, the golden path) and St. James Infirmary (a minor-key New Orleans dirge, published 1929, now public domain). No copyrighted songs, including the ones from my own sessions.
- **Process:** parallel workstreams in Claude Code workflows against agreed contracts, Fable adversarial reviews at each checkpoint, and a decision log that records every time I overrule Claude or a reviewer.

## Extensions (cut for depth over breadth)

- Microphone input and Web MIDI input
- Real-time rhythm capture with swing handling
- An idiom picker with idiom-specific chord vocabularies (folk, blues, ragtime, pop)
- A full Nashville chart view, and slash chords
- Intermediate and advanced experience levels
- More demo tunes ("When the Saints Go Marching In" was next)
- Persistence

## Time spent

- Planning with Claude in claude.ai: Sep 26 and 27 and Oct 6, 2026 (to be totaled).
- Build, deploy, and iteration: tracked in TIMELOG.md (my hands-on time, not agent wall-clock time).
