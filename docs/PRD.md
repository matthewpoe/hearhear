# Hear Hear: Claude Code build prompt

Sep 26, 2026 · @Matthew Poe

## North Star

A delightful, fun, educational tool that helps me play the piano music I love by ear. It turbocharges my ear and instincts so I develop judgment quickly, while **I solve the hard problems myself**.

**Think in relationships, not pitches.** This is the idea underneath everything else. Music in Hear Hear is relative: 1 is wherever home is (movable do), melody is scale degrees, chords are numbers, and what I learn are intervals and shapes, not notes in a particular key. That's how jazz, Nashville, and classically trained musicians hear and carry a tune into any key, rather than reading literal notes off a page, and it's the habit this tool exists to build. Every surface reinforces it: the number row as the instrument, degree labels on the piano keys, Roman numerals and Nashville labels, function colors and shapes, and transpose, which changes the sound while everything I'm thinking about stays the same.

- **Shorten the feedback loop, not the thinking.** The tool makes testing a guess instant (hear it, compare it, change it). It does not make the guess for me.
- **Theory arrives just in time,** in the context of what I'm already doing: why the choice I made works, or a gentle nudge toward a more likely choice with the reasoning behind it.
- **Nudges, not verdicts.** Suggestions are candidates to audition. My ear decides.
- **Delight is a requirement,** not polish: it should be fun to sit down with.

The design test for every feature: does this make me do the ear work, or does it do the ear work for me? And does it teach me to think in relationships, or in fixed notes? If either answer is the wrong one, redesign it or cut it.

The primary user is me. Reviewers without musical training reach the same experience through demo mode.

Assume the reviewer cannot read notation. Every step must make sense by ear, with a playhead that lights each note on the staff and keyboard as it sounds.

## Context

You are helping me build a prototype for an Anthropic software engineering take-home. It responds to Theme 1, Exploration & Understanding; the brief asks for one theme. Theme 2's call for real control over iteration and refinement is a supporting point, not a second theme.

**The original take-home brief is attached to this prompt.** Read it end to end before planning. It is the source of truth for requirements, deliverables, and evaluation criteria; the summary below is a convenience. If this PRD conflicts with the brief, the brief wins: flag the conflict to me before building. Do not commit the brief to the repo.

What the brief requires:

- **Time:** target 1 to 2 hours, hard limit 8. They value depth over breadth and evaluate scoping.
- **Deployed prototype** reviewers can use immediately in a browser.
- **Self-contained evaluation:** reviewers must be able to use it with no data or domain expertise of their own. A demo mode is required.
- **GitHub repo** with the code. Code quality matters but is not the main criterion.
- **Design rationale** as a \~5 minute video plus a short written doc (I write and narrate these; the repo automates video capture, section 9).
- **AI transcripts** are submitted and judged on how I direct the AI, evaluate its output, and keep my own vision. Surface real tradeoffs to me rather than deciding silently, and keep the decisions log in the repo.

The brief's stated values are useful, trustworthy, and delightful. Delight matters here.

## How we work

All work goes in the hearhear project directory and the hearhear GitHub repo; never create files outside it. This doc is the PRD. Commit it as `docs/PRD.md`.

**Preflight, before Phase 0:** confirm with me that the hearhear repo is cloned locally, a Railway project exists, and Node, Python, uv, and ffmpeg are installed. Ask for anything missing rather than working around it.

**The Claude API key comes last.** Build all Claude integration as scaffolding first: the proxy, schema, streaming, limits, and tutor panel run in fixture mode, and the eval harness is built against fixtures. Do not ask for `ANTHROPIC_API_KEY` until Phase 2, when real exchanges are captured for demo mode and the evals run live. At that point, ask me for the key and confirm I've set a spend limit in the Anthropic Console.

**Definition of done:** the app is deployed and the golden path works there; `make check` and CI are green; the smoke test passes; the README, `DECISIONS.md`, and `docs/rationale-notes.md` are current; the sizzle reel and clips are rendered; and the final Fable review's high-severity findings are resolved or consciously deferred in `DECISIONS.md`.

- Start in plan mode. Propose the file structure and the Phase 0 contracts for my approval before writing code.
- At each real tradeoff, give me two or three options with one line each, recommend one, and wait for my choice. If you think this PRD is wrong, say so before building.
- Build in parallel workstreams (see Scope and build order), each as its own agent in its own git worktree against the Phase 0 contracts.
- Each stream merges to main as soon as its tests pass and the golden path still loads. Commit at each meaningful step so the history tells the story.
- Seed `DECISIONS.md` (date, decision, why, alternatives rejected) with the decisions already in this PRD, including rejected alternatives: microphone transcription, automatic Viterbi harmonization (replaced by per-note audition), HTMX (the client owns state), the on-screen keyboard or letter keys as primary input (replaced by the number row), plain quarter-note entry (replaced by rhythm guessing with manual fixes), nearest-note octave placement (replaced by fixed rows, so the same key always plays the same note), and plain JS modules (Svelte chosen for reactive views across one model, default escaping, scoped CSS, and built-in transitions). Streams log to `docs/decisions/<stream>.md`; I fold those in. Record every decision, including each time I overrule Claude or a Fable reviewer, and why.
- `TIMELOG.md` is mine. Agents do not write it. Keep docs/rationale-notes.md (seeded from planning) current as raw material under the brief's rationale headings: why this theme, what's non-obvious, decisions and tradeoffs, extensions, time spent. I write the rationale from it.
- Unit tests for the theory core only, run in Node: spelling, keyboard-to-degree mapping, Nashville formatting, rhythm guessing, numeral parsing, transpose, re-key, re-bar, fit, key ranking, voicing. Backend tests with pytest: request validation, limits, budget, and the partial-JSON stream parser. One Playwright smoke test walks the golden path in CI, with an axe accessibility check. No other UI tests.
- The README opens with a one-click link to the 90-second guided path, then five lines on what was cut and why.

**Fable adversarial reviews.** At each checkpoint below, spawn a fresh reviewer agent on Fable (`model: fable`) that has not seen how the work was produced. It reviews adversarially for correctness, security, readability, and fit with this PRD, and returns severity-ranked findings with proposed fixes. Show me the findings; I decide what to act on, and outcomes go in `DECISIONS.md`.

1. Phase 0 contracts, schema, and repo shell, before any stream starts.
2. The theory core API and its tests.
3. The tutor backend: proxy hardening, prompt-injection posture, and spend controls, before first deploy with a real key.
4. Each stream's diff before it merges.
5. The whole repo before submission, read as a demanding interviewer would and scored against the brief's evaluation criteria, with every deliverable it lists checked off.

**Use Claude Code dynamic workflows for the fan-out phases.** A workflow puts the orchestration in a script, runs agents in isolated worktrees, and can build adversarial review into the run itself. A workflow cannot pause for my input mid-run, so every stage that needs my sign-off is its own workflow:

1. **Phase 0** runs in the normal session, in plan mode, with me approving the contracts. No workflow.
2. **Build workflow (Phase 1):** one builder agent per stream, each in its own worktree, each followed by a Fable reviewer (`model: fable`) that reviews that stream's diff and returns severity-ranked findings as structured output. The run ends with every branch and every finding; I decide what merges.
3. **Green-check workflow:** run `make check` and keep fixing until it passes or two rounds in a row make no progress.
4. **Final review workflow:** independent Fable reviewers read the repo from separate angles (correctness, security, readability and DRY, accessibility, fit with the brief), cross-check each other's findings, and return one ranked, deduplicated list.

Name the model per stage: Fable for reviewers, the session model for builders. Use the `large` size guideline for the build workflow. Save the build and review workflows to `.claude/workflows/` so the orchestration is part of the repo and the transcript.

## Problem and positioning

The problem: help me with piano ear training. I work out a song's right-hand melody by ear, then sit at the piano trying chords to figure out which ones go where. The tool is a **teacher**, not a transcriber and not a composition assistant.

The core idea: Claude is a strong ear-training partner for theory and cultural grounding, and it is sometimes confidently wrong about music. So every suggestion comes back as structured data the app can **play**, and the user's ear is the verifier. Claude proposes and explains; the user listens and decides.

The teacher should rarely just give the answer. Good moves are pointing at where to listen, handing the user an A/B test, and explaining the theory once the user has chosen.

How this differs from existing tools (the rationale will name both):

- **ScoreCloud** transcribes what you play into lead sheets. We are not competing on transcription.
- **Hookpad Aria** is a generative model that writes chords for a melody. It composes toward a good song, is pop-trained, cannot explain itself, and cannot converse. We help the user hear what an existing song actually does.

## Architecture

**One source of truth.** A single song model drives the staff, the audio, the lead sheet export, and the Claude payload. Never let notation and playback keep separate data.

**Song model: absolute pitches plus a key hypothesis.**

- Song: key hypothesis (tonic and mode; starts as C major, marked provisional until the user confirms it), meter hypothesis (beats per bar, beat unit, `pickupTicks`), tempo, `version`.
- Melody: right hand only, monophonic. Each note has a stable `id`, an absolute `midi` pitch, and `start` and `dur` in integer ticks (12 per quarter note, so triplets are exact). Rests are gaps: "make it a rest" deletes the note but keeps the time.
- Chords: absolute, like the melody. Each chord is a spelled root, a Tonal chord type, and the `id` of the note whose onset it sits on. Roman numerals, function colors, and letter names are all derived from the chord plus the key hypothesis.
- Number-row input resolves to absolute pitch through the key at entry time. Numerals, colors, and chord work always follow the current key hypothesis.
- **Transpose** moves melody, chords, and tonic together. **Re-key** changes only the hypothesis and re-derives every label; the notes and chords the user heard never change. **Re-bar** changes only the meter hypothesis; bar lines move, notes do not.

**Input abstraction.** One internal note-event stream (pitch, start, end) that input sources feed interchangeably: the on-screen piano now, Web MIDI as the one stretch goal. Nothing downstream should care where notes came from.

**Libraries:** abcjs for notation and print (not its synth), Tonal for theory, Tone.js for all sound (its Transport drives the click test and synced visuals). Nothing else without asking.

**Claude integration.** The API key and system prompt live server-side in the FastAPI proxy. Every call forces a single tool (`tool_choice`), so the proxy is useless as general-purpose Claude and malformed output cannot reach playback. Stream the forced tool call: parse the accumulating `input_json_delta` with `pydantic_core.from_json(..., allow_partial=True)`, send `message` deltas to the client over SSE, then one final validated `suggestions` event. Use strict tool schemas if the SDK supports them, and validate regardless. Limits and hardening are under Engineering standards.

**Stack:** FastAPI on Railway serving the frontend and `/api/*`, Anthropic Python SDK, slowapi for rate limits. Frontend in plain JavaScript, no TypeScript; JSDoc types are fine. No HTMX: the client owns the song model, and Claude's responses land in it as data, not swapped HTML. No database, no login. All music theory runs in the browser, never in Python, so hover audition never waits on the network. Frontend framework: Svelte 5 with Vite, runes syntax only. Deploy with a multi-stage Dockerfile (Node build, then Python slim) and FastAPI serves `dist/` with SPA fallback. Code lives in a GitHub repo I own.

## Engineering standards

- **Boundaries.** `src/theory/` is pure functions: no DOM, audio, or store imports (enforce with ESLint `no-restricted-imports`). `src/audio/` owns the single AudioContext. `src/store/` owns the song. Components never compute theory inline.
- **One definition per concept.** `analyzeNoteOverChord` drives why labels, fit, the clash check, and evals. `functionOf` drives every color. Colors exist only as CSS custom properties in `tokens.css`. The eval harness runs in Node and imports `src/theory`, so no theory is ever duplicated in Python.
- **Contracts as JSON Schema** in `contracts/`. The proxy loads `tutor-tool.schema.json` as the tool `input_schema`, Pydantic validates requests, and JSDoc typedefs point at the same files. Never hand-copy a schema.
- **State.** The store is a plain JS module implementing the Svelte store contract (`subscribe`), so Node tests and evals use it without a framework. It changes only through named actions (`addNote`, `setDuration`, `setChord`, `rekey`, `transpose`, `rebar`), each bumping `version` and pushing onto an undo stack. Hover, selection, and playhead are UI state: they never bump the version or re-render the staff.
- **Audio latency.** Tone context with `latencyHint: "interactive"` and zero look-ahead for live key presses. Debounce hover audition (about 120 ms) and stop the previous audition before starting the next. Schedule playback on the Transport and sync visuals with `Tone.Draw`. Self-host trimmed piano samples (C2 to C6) and preload them.
- **Render cost.** abcjs re-renders only when the song changes. Playhead and highlights toggle CSS classes on SVG elements mapped by note id.
- **Proxy hardening.** Pydantic bounds: at most 400 notes, MIDI 21 to 108, message at most 1,000 characters, history at most 12 turns, body at most 64 KB. Cap `max_tokens`. Model and key from environment variables (`TUTOR_MODEL`, `ANTHROPIC_API_KEY`); ship `.env.example`, gitignore `.env`. Same-origin serving, no CORS middleware; Vite dev proxy locally.
- **Spend cap.** One uvicorn worker with `--proxy-headers`, so slowapi limits the real client IP. A daily token budget in memory, computed from `usage`. The true hard cap is a spend limit on the Anthropic Console workspace, since the in-memory counter resets on redeploy. Over budget returns 503 with friendly JSON, and the client falls back to cached lessons.
- **Prompt injection.** User text goes to Claude inside a `<student_message>` block that the system prompt treats as speech, not instructions. Claude's text renders only as text, never `innerHTML` or `{@html}`. Chord strings from Claude are parsed by the theory core and re-serialized, never interpolated into ABC or HTML.
- **Output validation.** Validate tool output server-side with Pydantic and client-side too: numerals parse, positions are in range, numeral and letter agree. Drop and count failures; one bad suggestion never breaks playback. Own a small, tested Roman numeral parser (accept `°` and `o`; lowercase is minor).
- **Errors.** Every async boundary (samples, API, stream) has visible loading, failed, and retry states. No empty catches.
- **Dependencies and readability.** Pin exact versions and install everything in Phase 0; streams ask before adding one. No UI kit, CSS framework, or state library. Small files named by concept, JSDoc on public theory, audio, and store functions, no dead code, no speculative abstractions.

**Quality bar.** This code must be ship-ready and hold up in a demanding software interview: correct, clear over clever, readable by a stranger, idiomatic in each language. Professional-grade means correct, tested, and simple, not enterprise ceremony. No speculative layers; reviewers judge scoping too.

- **Tooling:** ESLint and Prettier for JS; Ruff (lint and format) and mypy in strict mode for Python; pre-commit hooks run them all.
- **CI on every push and PR (GitHub Actions):** lint, format check, type check, unit and backend tests, the smoke test, the build, `npm audit`, `pip-audit`, and secret scanning (gitleaks). Main stays green; protect it.
- **Reproducible setup:** `.nvmrc`, `.python-version`, lockfiles for both (`package-lock.json`, `uv.lock`), and a Makefile: `make dev`, `make test`, `make lint`, `make check`. A stranger goes from clone to running app in three commands.
- **Security headers:** a strict Content-Security-Policy (self only, no inline scripts), plus `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- **Accessibility:** everything works by keyboard with visible focus; piano keys and chord chips have accessible names; text meets WCAG AA contrast. Bauhaus yellow fails contrast as text on white, so yellow chips use dark text and an outline.
- **Logging:** structured server logs with request IDs and token usage. Never log API keys or the user's message text.
- **Git hygiene:** Conventional Commits; small, focused merges with a one-paragraph description each.
- **README:** what it is, the 90-second path link, a small architecture diagram, three-command setup, what was cut and why, and a link to `DECISIONS.md`. Add an MIT `LICENSE`.

## Core features

### 1. Melody entry

- **The number row is the instrument.** Keys 1 to 7 play scale degrees in the current key, so the key is irrelevant to the hands: 1 is always home. Shift raises a degree and Option/Alt lowers it. Read physical key codes, since Shift+3 arrives as "#" and Option+3 on a Mac as "£". Never use Cmd, which switches tabs, and pick a Windows flat key that doesn't open the browser menu. Chromatic notes are everyday in blues and New Orleans material, so the modifiers must feel good. In minor keys, 1 to 7 play natural minor, and the raised seventh at cadences is Shift+7. Rationale: folk and blues melodies move in natural minor, and the raised seventh mostly appears at cadences, so it belongs on a modifier rather than in the default scale.
- **Octaves:** fixed, like a piano: the same key always plays the same note. The number row is the home octave: 1 to 7, with 8, 9, and 0 continuing to 1, 2, and 3 above. The row underneath plays the octave below, each key under its number: Q is low 1, W low 2, through U, low 7, so the note just below home is low 7 on U, directly under 7. The row under that (A through J) plays two octaves below, lined up the same way. Every column is one scale degree: 1 over Q over A, 7 over U over J. I, O, P, K, and L are unused. Shift and Option/Alt work on both rows. The up and down arrows shift the whole two-row window an octave for tunes that sit higher or lower; with a note selected, they move that note an octave instead. Arrow keys never scroll the page. Rationale: nearest-note placement was rejected because the same key played different notes depending on what came before, which a pianist can't build muscle memory for.
- **Noodle mode by default:** every key press sounds and lights the matching key on the on-screen piano. Nothing is written until the user switches to record mode.
- **Record mode** writes notes to the staff with a rhythm guess. The most common gap between note starts is taken as the beat (a quarter note), and every other gap snaps to the nearest of half, one, one and a half, two, three, or four beats. A pause of more than half a beat after a key release becomes a rest, and the last note's length comes from its key release. No metronome is needed. The guess is shown, never trusted: one key reverts the take to plain quarter notes. To fix rhythm, right-click a note (suppressing the browser menu), or select it and press `[` to halve or `]` to double its length, `.` to add a dot, `/` to make it a rest, Backspace to delete. Duration keys stay off all three note rows so they never collide with note entry. Bundled demo tunes carry their rhythm pre-encoded.
- **The on-screen piano stays clickable** as secondary input and a teaching surface. Each key shows its degree number, and the labels move when the key changes.
- Ignore auto-repeat from held keys. All note keys (all three rows) are off whenever a text field has focus, so typing to the tutor never plays notes.
- **Desktop-first.** Touch works on the on-screen piano, but the number row assumes a physical keyboard.
- **Undo everywhere:** Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z undo and redo every song edit, so experimenting feels safe.
- Notes drop onto the staff as they are recorded.

**Key finding** is a first-class activity, not a setting:

- Nothing is asked up front. The key starts as C major, marked provisional, so the number keys play the white keys. Let the user noodle and let the melody emerge.
- After a phrase or so, a quiet prompt asks "Is 1 really home? What key do you think this is?" with major, minor, a specific key, or "Not sure, help me find it."
- The answer is a **hypothesis**: it replaces the provisional C. Two distinct actions change the key: re-key (same sound, new numbers: "home is actually 6") and transpose (same numbers, new sound: "play it in F").
- "Help me find it" runs playable tests: a **drone test** (hold a candidate tonic under the melody; this is what separates relative keys like C and A minor), a **last-note test**, and a **cadence test** (V-I in each candidate key under the ending).
- A deterministic pass ranks all 24 keys by Krumhansl-Schmuckler correlation and offers the top three to test, never as a verdict. Scale membership is an annotation ("F natural is outside D major"), not a filter, so a blue-note melody keeps its real key in the running. Those ambiguous moments are where to hand off to Claude.

**Meter finding** works the same way as key finding, and the two prompts arrive together once there's a phrase:

- "What time signature do you think this is?" with 4/4, 3/4, 6/8, or "Not sure, help me find it." The answer is a hypothesis.
- Changing it **re-bars** the melody: notes and durations stay put, bar lines move. It includes a pickup offset, since many tunes start before beat 1.
- "Help me find it" plays the melody over an accented click in 3 and then in 4, and asks which feels right. Chord changes landing on beat 1 are a strong cue, and a good nudge for Claude to offer.

### 2. Chord dropdown (the centerpiece; works with no API call)

- Click any melody note to place or change a chord there. While the dropdown is open, number keys audition chords by degree (5 plays V, 4 plays IV) and Enter commits, so numbers mean scale degrees everywhere in the app.
- The dropdown lists the likely suspects **for the current key and mode**. Major: I, IV, V, vi, ii, with iii rarer. Minor: i, iv, V, III, VI.
- **Audition on hover:** moving through the list plays each chord under the melody before committing. Audition plays the bar around the note, melody included. Chords use nearest-inversion voice leading in a fixed register below the melody, so A and B differ only in harmony, never in voicing or range. This is what makes the comparison trustworthy.
- **No pre-selection.** Order options by fit: melody notes within the chord's span, weighted by beat strength and duration. Theory hints are gentle cues ("often resolves home here") the user can ignore. The aim is building intuition, not handing over answers.
- **Show the why** on each option: whether the melody note is the chord's root, 3rd, 5th, or a tension over it.
- **Placement is its own skill.** Any note onset is clickable. In the alpha, chords sit on note onsets only; changing a chord under a held note is an extension. Optionally shade likely change points (downbeats, phrase ends) without deciding for the user.
- **"Something else…"** at the bottom opens an extended vocabulary (secondary dominants, borrowed chords, diminished passing chords) and is the doorway to asking Claude about unusual chords.

### 3. Claude tutor

- The client sends `toTutorSnapshot(song)`: a readable bar-by-bar view with spelled notes and durations, scale degrees, chords as both numeral and letter, the key and meter hypotheses, and the user's chord-label style, so Claude's explanations use the same notation (Nashville or Roman). Never raw MIDI numbers. Plus an optional question.
- **Tutor principles (server-side system prompt):** withhold by default; start at a nudge and escalate only when asked; state confidence; always invite the ear test ("play both and listen"); admit uncertainty plainly; challenge a too-neat hypothesis as readily as a wrong one; ground explanations in theory and idiom, in the context of what the user just did. Model the moves a good teacher makes: "count it in 3," "hold the tonic under it," "your hypothesis is suspiciously tidy." The melody is the right hand and chords are the left hand; never swap them. While beginner callouts are on, speak plainly and gloss every term.
- **Hint levels:** *nudge* (where to listen, what to test), *comparison* (two or three candidates to audition, no verdict), *answer* (Claude's best guess with the theory behind it). Default is nudge; the user asks for more.
- **Tool schema (sketch, finalize in Phase 0):** `hint_level`, `message`, `suggestions[]` each `{bar, beat, numeral, letter, confidence: low | medium | high, reason}`. The server attaches `snapshot_version`; it is not in the tool schema. The client checks that numeral and letter agree and drops suggestions that don't.
- Suggestions land on the grid as audition-able alternatives, never applied automatically.
- A longer "theory behind this" explanation is available on demand, especially for unusual chords. Cultural and idiomatic grounding is Claude's strength here.
- **Multi-turn:** a single text box under the grid lets the user agree, disagree ("I tried that and it sounds wrong"), or ask follow-ups. History lives in memory for the session. No persistence, no branching.
- **State sync:** every turn carries a fresh snapshot. Suggestions are tied to the version they were made against; stale ones are marked, never misplaced.
- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), set through `TUTOR_MODEL`. Stream explanation text so it never feels slow, and report its latency in the evals. Delight dies waiting.
- **Fallback:** when the live tutor is over budget or unreachable, say so plainly ("The live tutor is out of budget for today; the recorded lessons still work") and switch to the cached exchange.

### 4. Views and transposition

- Chord labels: Roman numerals, Nashville numbers (1 4 5 6m), letter names, or numerals plus letters. Nashville is a label style, not a separate mode; melody degrees stay plain under the staff while chord numbers live in shaped, colored chips, so the two never read as the same thing.
- Toggle scale-degree numbers under the melody. Degree labels use the octave dots of numbered musical notation (jianpu): a dot below means the octave below home, a dot above means the octave above. The same labels appear on the on-screen piano keys, each with the computer key that plays it.
- **Transpose** in one click to any conventional key (major: Db, Eb, F# or Gb by choice, Ab, Bb; minor: C#, D# or Eb by choice, F#, G#, Bb), for any song, library or user-entered.
- **Re-key** is a separate action: the notes stay put and the key interpretation changes ("this is actually D minor, not F"). Keep it clearly distinct from transposing.
- Octave up/down control beside the key picker. Default to the nearest octave that keeps the melody on the staff and keyboard.

### 5. Lead sheet export and Nashville labels

abcjs renders the lead sheet from the same model, including chord symbols at beat positions. Export is a print stylesheet and a button.

**Nashville labels:** chord chips, the lead sheet, and the tutor can all use Nashville numbers instead of Roman numerals.

- Chord notation: minor `m`, seventh as a superscript 7, major seventh `maj7`, diminished `°`, chromatic roots with a leading `b` or `#` (b7, #4°). Secondary dominants are plain numbers with their quality (a 6 with a superscript 7, going to 2m).
- Numbering counts from the current tonic in major and minor alike: 1m in a minor key, never the relative major's 6m. Rationale: chord 1 and melody degree 1 must always be the same note, which is the app's core idea. Players used to 6m charts adjust once.
- One formatter, `nashvilleOf`, in the theory core serves the chips, the lead sheet, and the tutor.
- A full Nashville chart view (one number per bar, split bars, diamonds, pushes, repeats) and slash chords are extensions, not in the alpha.

### 6. Demo mode (required by the brief)

- **Reviewers land on an invitation to a guided path,** not on empty cards. The path takes 60 to 90 seconds: hear the tune, guess where home is and confirm it with the drone test, meet a wrong-ish chord, audition two candidates, pick the one that lands (the V-I signature moment), then read Claude's short explanation of why. The reviewer clicks through and can interact at every step.
- Browsers block audio until the first click, so the first click should start something satisfying. Preload piano samples during the landing screen.
- Bundle public-domain tunes only (traditional folk, hymns, anything published in 1930 or earlier, which is US public domain as of 2026) or original melodies, with rhythm pre-encoded. Never bundle copyrighted songs.
- **First tune:** a simple Ode to Joy (Beethoven). Almost all quarter notes, easy to tap out, and its I and V harmony is ideal for the golden path and the signature moment.
- **Second tune:** "St. James Infirmary" (traditional; the 1929 published version is now US public domain, but encode only the melody, never a recording or a later arrangement). A minor-key New Orleans dirge, a different idiom from Ode to Joy, it exercises minor keys, the minor number row, and 1m Nashville numbering, and shows what the tutor adds beyond the dropdown.
- Each demo song ships with a wrong-ish chord guess and a cached Claude exchange: guess, critique, "that sounds wrong," revised suggestion. It shows Claude declining to just give the answer, offering an A/B test, then explaining after the user chooses.
- Cached exchanges are real captured output, not hand-authored perfect data. Live mode is available alongside, and demo mode works fully if the API is down.

### 7. Evals

A small, honest eval of the tutor. It backs the "ear as verifier" claim with numbers and reports how far to trust the chosen model. I plan to spend real time here.

- **Dataset (owned by Stream H):** 5 to 10 public-domain melodies with reference chords from published public-domain harmonizations, checked by my ear. Include hard cases: blue notes, secondary dominants, relative-key ambiguity, waltz time.
- **Metrics:**
  - Schema validity and internal consistency (numeral and letter agree).
  - Hit rate: how often the reference chord appears among Claude's suggestions at each change point, measured at the comparison level.
  - Clash rate from `analyzeNoteOverChord`.
  - Key identification accuracy.
  - Pedagogy adherence at the nudge level: does the reply avoid giving the answer? Rule-checked where possible, model-graded otherwise.
  - Latency, p50 and p95.
- **Baseline:** the deterministic dropdown's top-ranked chord. The interesting question is where Claude beats the rules, which should be the hard cases.
- **Runs:** compare models and prompt versions. Results go in a JSON file and a table in the repo.
- **Trust panel:** a small "How much should you trust the tutor?" view beside the tutor reads the latest results JSON. It makes the brief's "trustworthy" value visible.
- The harness runs in Node, imports `src/theory`, and calls the same proxy endpoint and schema as the app, so it tests what reviewers use.

### 8. Sound check and beginner callouts

Hear Hear must make sense to someone who is not a musician, with sound on or off.

- **Sound check first.** The landing screen asks the reviewer to turn their sound on and plays a short, pleasant chord on the first click, which also unlocks browser audio.
- **Every audible cue has a visual twin:** the playhead, key lighting, function shapes and colors, and on-screen text saying what each test is listening for. A reviewer with sound off can still follow.
- **Beginner callouts,** on by default for a first visit and the guided path, point at each part in plain words: "These number keys are notes. 1 is home." "Hover a chord to hear it under the tune." "Blue circle means home; red square means tension." Every term gets a plain gloss. One toggle turns callouts off, remembered in `localStorage` as a per-viewer convenience. Callouts are data (`content/callouts.json`) anchored to element IDs, dismissible, and keyboard accessible.
- **Small screens:** the guided path works by touch on the on-screen piano. Below tablet width, a short note says the full tool is best with a desktop keyboard and links the video.

### 9. Demo video capture

The brief asks for a self-recorded video of about five minutes. The repo automates a sizzle reel and per-beat clips with synced sound; I talk over them in my own words, then click through the live app myself.

- `make demo-video` drives the app with Playwright through a scripted shot list and records 1080p video of each beat.
- Playwright's video has no audio, and audio is the product. Record the app's sound in the browser with `Tone.Recorder` during each beat, then mux it with ffmpeg so every clip has synced sound.
- Shot list, one clip per beat plus a stitched rough cut with plain title cards, sized to leave room for narration: (1) cold open on the V-I landing; (2) the beginner tour with callouts; (3) noodling on the number row, then recording; (4) key and meter finding with the drone test; (5) chord audition in the dropdown; (6) the tutor declining to give the answer, offering an A/B test, then explaining; (7) transpose and Nashville labels; (8) the trust panel and eval results.
- The main output is a sizzle reel of two to three minutes, cut from the clips, that I talk over before clicking through the live app. A 45-second cut of it goes at the top of the README, as an MP4 with a GIF fallback.
- `docs/video/shots.md` holds the shot list with a suggested narration line per beat, which I rewrite in my own words.
- Raw clips and renders live in a gitignored `media/` directory; only the sizzle ships in the repo.

## Visual design

Sophisticated Bauhaus primaries, rounded corners, generous whitespace. Educational and fun without being cheesy. **Every color earns its place by conveying an idea.**

- **Keyboard and staff stay black and white.**
- **Color and shape mean harmonic function,** using Kandinsky's 1923 Bauhaus pairing: **tonic** is a blue circle (home, rest), **subdominant** a yellow triangle (moving away), **dominant** a red square (tension that wants to resolve). Chord chips carry shape, color, and label, so nothing relies on color alone.
- Colors come from `functionOf(numeral, mode)`, backed by `contracts/functions.json`. Tonic: I, vi, iii; i, III. Subdominant: IV, ii, iv, bVI, bVII; iv, VI, VII, ii°. Dominant: V, vii°, v, and every secondary dominant or leading-tone chord (VI7, II7, I7 going to IV, #iv°), so they stand out where red is unexpected. Anything unlisted is neutral gray with a "?" chip that invites asking Claude.
- **Layout:** the staff is the center of the page, the keyboard sits at the bottom, the tutor text box sits under the chord grid.
- **Empty state is the onboarding:** an invitation to the guided demo, and below it a blank staff with two rounded cards, "Play a melody" and "Load a song." They disappear once there is content. No tutorial overlay.
- **The keyboard teaches too:** hovering a chord option lights its tones on the keyboard in its function color. During playback the keyboard lights the melody note and the current chord's tones together: chord tones in their function color, the melody note in a neutral highlight. The keyboard spans C2 to C6, matching the samples and all three note rows, so the chord register and the melody are both visible.
- **Voice:** curious and warm, never a quiz. Key prompt: "Is 1 really home? What key do you think this is?" Drone test: "Hold this note underneath. Does the melody settle or itch?" Meter test: "Does it lilt in 3 or march in 4?" Wrong choices get no buzzer; the user just hears them.
- **Contextual hints:** one at a time, tied to the moment ("hear how the red pulls back to blue?" after the first V-I), dismissible, never more than one on screen.
- **Type and motion:** Jost, a free geometric sans in the Futura tradition. Notes drop onto the staff with a short ease; keys sink and glow in their function color; soft transitions when chords land. No confetti, no mascot. Respect `prefers-reduced-motion`.

**Signature moment:** the V-I landing. When the user picks the chord that resolves, the phrase replays and the red square's corners round into the blue circle as it lands (about 400 ms), with the keyboard lighting in function colors. This moment gets the extra polish hour.

## Scope and build order

Build so the app is usable and demoable at every step. The deterministic loop comes before Claude, so the tool works without the API.

**Golden path** (must work, deployed, before anything else): one demo tune loaded, a key hypothesis with the drone test, the chord dropdown with audition, and one Claude exchange (live or cached).

**Cut lines** (my time, not agent time):

| By | Ships |
| --- | --- |
| 2 hours | Golden path, deployed |
| 4 hours | Guided demo path, number-row entry with rhythm guessing and duration editing, undo, meter prompt, chord-label toggles including Nashville, transpose and re-key, multi-turn tutor, eval v1 and trust panel, sound check and beginner callouts, demo video capture and sizzle reel |
| 8 hours | Lead sheet export, contextual hints, eval expansion, signature-moment polish, and last-take capture only if time allows |

**Phase 0: foundation (serial, short).** One agent, with my approval at the end. It delivers:

- The app shell with one empty component per stream, global tokens, and every dependency installed and pinned, plus linters, formatters, type checking, pre-commit hooks, and a green CI pipeline.
- The song schema and JSON fixtures of the two demo tunes.
- The store, implemented (not just defined): actions, undo, `version`, `toTutorSnapshot(song)`.
- Working stubs for theory and audio that return plausible values, not errors.
- Contracts in `contracts/`: the theory API (`spell`, degreeToMidi, `parseNumeral`, `numeralOf`, nashvilleOf, guessRhythm, `functionOf`, `chordTones`, `analyzeNoteOverChord`, `candidates`, `fit`, `rankKeys`, `voice`, `rebar`); the audio API (`playPhrase(range, {chords, onEvent})` with `onEvent` fired via `Tone.Draw`, `auditionChord`, `drone`, `playWithClick(range, beatsPerBar)`, `stop`); staff events (`noteClick({noteId, anchorRect})`, `highlight(noteIds, className)`); the tutor tool schema with fixture responses; `functions.json`.
- A deployed skeleton on Railway with `/api/health`. Every later merge redeploys. Turn off Railway's Serverless (app sleeping) setting so reviewers never wait through a cold start, and plan for the service to stay up on a paid plan through the review window, which may run weeks past submission.

After Phase 0, only a file's owning stream edits it.

**Phase 1: parallel workstreams.** Each runs as its own agent in its own git worktree, owns its own directory, and changes a contract only by asking me.

| Stream | Owns | Codes against |
| --- | --- | --- |
| A. Theory core | Everything in the theory API, including one `analyzeNoteOverChord` for why labels, fit, clash, and evals; unit tests. Pure JS, no DOM | Song schema |
| B. Audio | Samples and preload, audio unlock, phrase playback with events, audition, drone, click | Audio API, fixtures |
| C. Staff and export | abcjs rendering (letters above, numerals as annotations below, degrees as a lyric line), note-to-SVG map, playhead and highlight classes, colored chord symbols, print stylesheet | Store, theory stubs, staff events |
| D1. Input | Two-row degree entry with modifiers and octave window, noodle and record modes with rhythm guessing, clickable on-screen piano with degree labels, duration editing, undo | Store, audio stubs |
| D2. Chord dropdown | Candidates, audition on hover, why labels, keyboard lighting | Store, theory and audio stubs, staff events |
| D3. Finding and onboarding | Key and meter prompts with drone, last-note, cadence, and click tests; re-bar UI; landing and empty state; sound check and beginner callouts; guided-path runner; contextual hints | Store, theory and audio stubs, G's script as data |
| E. Tutor backend | FastAPI proxy, system prompt, forced tool, streaming, validation, rate limit, budget, fixture mode | Tutor schema |
| F. Tutor panel | Conversation UI, suggestions landing as alternatives, snapshot versioning, trust panel | Tutor fixtures, store |
| G. Demo content | Demo tunes with rhythm, wrong-ish guesses, cached exchanges, guided-path script as data | Song schema |
| H. Evals | Eval dataset, Node harness, metrics, results JSON and table | Tutor schema, song schema, theory core |

**Known risk for Stream C:** abcjs probably can't color individual chord symbols from ABC. Render first, then map each chord's SVG element to its model chord and add a class. Prove this in the first 15 minutes.

**Phase 2: end to end (serial, short).** Streams have already merged as they went green. Ask me for the API key (see How we work), walk the golden path, then the guided path, capture real Claude exchanges for demo mode, run the evals live, fix deploy issues, then run demo capture (Stream I: Playwright shot scripts, Tone.Recorder audio, ffmpeg mux, rough cut, sizzle, shot list doc). Stream I's scripts can be written in Phase 1 against the guided-path script; they run once everything has merged.

**Phase 3: iterate** on the deployed app. Most of my time should go here.

**Stretch:** only if it proves straightforward. First, last-take capture: Enter keeps the last phrase played in noodle mode, using the same rhythm guesser, and a swing toggle snaps swung pairs to straight eighths. Then Web MIDI input.

**Cut from the alpha, for depth over breadth (list them in the rationale as extensions):** microphone input, letter-name entry, the DAW-style piano mapping (A S D F as white keys), metronome play-along, an idiom picker with idiom-specific vocabularies, a full Nashville chart view, intermediate and advanced experience levels, a third demo tune ("When the Saints Go Marching In"), persistence.
