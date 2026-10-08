<script>
  /**
   * The welcome region (Stream D3): load a demo tune, then find its key. With
   * no song it's a compact welcome with the song cards; once a song is on the
   * staff, the chooser moves to the masthead and this region holds only the
   * key question and the sound status, under the staff. The
   * key prompt appears when a demo is waiting for a guess, or in free play
   * once there's about a phrase on the provisional C. It owns the piano's
   * warm-up (decision D19): preload on mount, unlock with the sound-check
   * chord on the first click anywhere. Once a tune is loaded that first click
   * starts audio silently instead, so a C chord never sounds over a tune in
   * another key (say, a note click on a demo before the key guess).
   * @import { ChordSpec, Key, Song } from "../types.js"
   */
  import { onMount, tick } from "svelte";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, preload, resume, unlock } from "../audio/index.js";
  import SongPicker from "../toolbar/SongPicker.svelte";
  import { stopListening } from "./listen.js";
  import KeyPrompt from "./KeyPrompt.svelte";
  import { nextStep, rhythmSource } from "../steps/nextStep.js";
  import DroneSwitch from "../staff/DroneSwitch.svelte";
  import { describePlacement, placedChord, startingNote } from "../steps/chordFeedback.js";
  import { positionOf } from "../theory/index.js";
  import { whereOf } from "../chords/where.js";
  import { barRange } from "../staff/bars.js";
  import { mark } from "../staff/staffEvents.js";
  import { playWithVisuals } from "../staff/playback.js";
  import { recorder, shelf } from "../record/tunes.js";
  import { isUserTune } from "../record/take.js";
  import { guidedPath, tour } from "../guided/tour.js";
  import { lessonNote } from "../guided/steps.js";

  /** Notes of free play before the prompt asks: about a phrase. */
  const PHRASE_NOTES = 8;

  /**
   * What the user last did with the key prompt. With the two store facts (is
   * the key provisional, is a demo awaiting its guess) it decides the view.
   * "ask": nothing yet; "dismissed": put off with "Not now"; "reopened":
   * asked for the prompt again; "guessed": chose (or took back) a home, so
   * the prompt stays open to change or check it.
   * @type {"ask" | "dismissed" | "reopened" | "guessed"}
   */
  let intent = $state("ask");
  let soundBlocked = $state(false);

  const empty = $derived($song.notes.length === 0);
  const songId = $derived($song.id);
  const demo = $derived($ui.demoAwaitingGuess);

  /** A take is running: the key question waits for Stop. */
  const recording = $derived($recorder.status === "armed" || $recorder.status === "recording");

  /** @type {"none" | "prompt" | "find"} */
  const view = $derived.by(() => {
    if (empty || recording) return "none";
    // A demo always waits for its guess, even after an undo (D18).
    if ($song.key.provisional && demo) return "prompt";
    if (intent === "dismissed") return "find";
    if (intent !== "ask") return "prompt";
    // A demo reopened with its guess committed (switching back, or a reload)
    // shows the question as the guess left it: the chosen chip and the result.
    if (demo) return "prompt";
    if (!$song.key.provisional) return "none";
    // A recorded tune asks at once, however short: finding home comes next.
    return $song.notes.length >= PHRASE_NOTES || isUserTune(songId) ? "prompt" : "none";
  });

  /** The step path: Key, Rhythm, Chords, with the key current while its question shows. */
  const path = $derived(nextStep($song, { keyOpen: view === "prompt" }));

  /**
   * Step 3's suggested place to start: one specific note with no chord yet.
   * While the guided lesson runs it is the lesson's note instead (or none),
   * so the page points at one place.
   */
  const start = $derived.by(() => {
    if (path.current !== "chords") return null;
    const lesson = lessonNote(guidedPath, $tour, $song);
    return lesson === undefined ? startingNote($song) : lesson;
  });
  const startWords = $derived.by(() => {
    if (!start) return "";
    const { bar, beat } = positionOf(start.start, $song.meter);
    return bar >= 1 && beat === 1
      ? `the first note of bar ${bar}`
      : `the note at ${whereOf(start, $song.meter)}`;
  });

  // The start note wears a ring on the staff while it's the suggestion; a
  // mark stays through the staff's redraws (staffEvents.js).
  $effect(() => {
    const id = start?.id;
    if (!id) return;
    mark("is-start", [id]);
    return () => mark("is-start", []);
  });

  /**
   * What the chord the user just placed does, described, never graded
   * (chordFeedback.js). Set when one chord is placed; a new song, or that
   * chord taken away, clears it. The words are read from the song as it was
   * at the placement, in the current label style, so switching styles
   * renames the chord as it does on the chips.
   * @type {{ noteId: string, chord: ChordSpec, at: Song } | null}
   */
  let placed = $state(null);
  const placement = $derived.by(() => {
    if (!placed) return null;
    const said = describePlacement(placed.at, placed.noteId, placed.chord, $ui.labelStyle);
    return said && { noteId: placed.noteId, ...said };
  });
  let before = song.get();
  $effect(() =>
    song.subscribe((now) => {
      const was = before;
      before = now;
      const chordPlaced = placedChord(was, now);
      if (chordPlaced && !now.key.provisional) {
        placed = { ...chordPlaced, at: now };
        return;
      }
      const id = placed?.noteId;
      if (now.id !== was.id || !now.chords.some((c) => c.noteId === id)) placed = null;
    }),
  );

  /** "Hear it again": the placed chord's bar, as the song plays it. */
  function hearPlacement() {
    const now = song.get();
    const note = now.notes.find((n) => n.id === placement?.noteId);
    if (!note) return;
    playWithVisuals(barRange(now, note).range).catch((error) =>
      console.error("Playing the bar failed", error),
    );
  }

  /** A recorded tune's rhythm guess, taken as it is (the 3-vs-4 question is parked). */
  function confirmRhythm() {
    const now = song.get();
    song.rebar({ ...now.meter, provisional: false });
  }

  /**
   * A recorded tune with its raw take kept can be read again with the
   * player's Feel. This is how the playing is read, not the playback
   * switch: re-reading sets the song's swing to match, so that one follows.
   */
  const canReread = $derived(isUserTune($song.id) && shelf.take($song.id) !== null);
  /** @type {"straight" | "swing"} */
  const feel = $derived(($song.swing ?? 1) > 1 ? "swing" : "straight");
  const FEELS = /** @type {const} */ ([
    ["straight", "Straight"],
    ["swing", "Swing"],
  ]);
  /**
   * A feel waiting on the user's say: a re-read replaces the notes, so once
   * they've been edited by hand Feel asks first. The radios show the feel
   * chosen (the tune's own, or the one being asked about). Any change to the
   * song puts the question away, and with it the radios go back on the
   * tune's feel.
   * @type {"straight" | "swing" | null}
   */
  let pendingFeel = $state(null);
  let feelChoice = $derived(pendingFeel ?? feel);
  $effect(() => {
    void $song;
    pendingFeel = null;
  });

  /** @param {"straight" | "swing"} value */
  function chooseFeel(value) {
    if (recorder.edited()) pendingFeel = value;
    else if (!recorder.reread(value)) feelChoice = feel;
  }

  function keepEdits() {
    pendingFeel = null;
  }

  function confirmFeel() {
    const value = pendingFeel;
    pendingFeel = null;
    if (value && !recorder.reread(value)) feelChoice = feel;
  }

  /** A demo's prompt waits for its guess; anywhere else the user can put it off. */
  const canDismiss = $derived(!($song.key.provisional && demo));

  onMount(() => {
    warmUp();
    window.addEventListener("click", startSound, { capture: true, once: true });
    return () => window.removeEventListener("click", startSound, { capture: true });
  });

  async function warmUp() {
    try {
      await preload();
    } catch (error) {
      // audioStatus reports "failed"; the retry below calls warmUp again.
      console.error("Piano samples failed to load", error);
    }
  }

  async function startSound() {
    try {
      if ($song.notes.length > 0) await resume();
      else await unlock();
      soundBlocked = false;
    } catch (error) {
      console.error("Audio unlock failed", error);
      soundBlocked = true;
    }
  }

  // A new tune starts its key question fresh, wherever it was loaded from.
  $effect(() => {
    void songId;
    intent = "ask";
  });

  /** @type {HTMLButtonElement | undefined} */
  let reopenButton = $state();

  /** "Next: …" or "Not now": collapse the key step, keeping focus on its row. */
  async function collapseKey() {
    intent = "dismissed";
    await tick();
    reopenButton?.focus();
  }

  /**
   * Commit a guess, or take one back (a provisional key). The demo flag stays
   * set until the user leaves the demo (D18), so taking back or undoing a
   * guess hides the labels again.
   * @param {Key} key
   */
  function rekey(key) {
    stopListening();
    song.rekey(key);
    intent = "guessed";
  }
</script>

<section id="landing" class:empty aria-label={empty ? "Pick a song" : "Next step"}>
  {#if empty}
    <!-- Step 1 leads: what the app is for, then the song list. -->
    <p class="welcome">Hear a tune. Find where home is.</p>
    <p class="invite">
      Pick a song, listen, and guess which note feels like home. Your ear does the finding; Hear
      Hear makes every guess quick to test.
    </p>
    <h2><span class="num" aria-hidden="true">1</span> Pick a song</h2>
    <SongPicker hero />
    <p class="invite">You can record your own once you get the hang of it.</p>
  {/if}

  <div class="sound" role="status">
    {#if $audioStatus === "loading"}
      <p>Warming up the piano…</p>
    {:else if $audioStatus === "failed"}
      <p>The piano sounds didn't load.</p>
      <button type="button" onclick={warmUp}>Try loading them again</button>
    {:else if soundBlocked}
      <p>The browser kept the sound off.</p>
      <button type="button" onclick={startSound}>Turn sound on</button>
    {/if}
  </div>

  {#if !empty && !recording}
    <!-- The next big-picture question. The current step opens below; a done
         step is one line, and the key's can be reopened. -->
    <ol class="path" aria-label="Steps">
      {#each path.steps as step, i (step.id)}
        <li class={step.status} aria-current={step.status === "current" ? "step" : undefined}>
          <span class="num" aria-hidden="true">{step.status === "done" ? "✓" : i + 1}</span>
          <span class="name">{step.label}</span>
          <span class="summary">{step.summary}</span>
          {#if step.id === "key" && view !== "prompt"}
            <button
              type="button"
              class="reopen"
              bind:this={reopenButton}
              onclick={() => (intent = "reopened")}
            >
              {$song.key.provisional ? "Find the key" : "Change the key"}
            </button>
            <!-- The settings that count from home stay reachable with the key
                 collapsed: a drone left on keeps sounding. -->
            <span class="key-tools" role="group" aria-label="Hear it from home">
              <DroneSwitch />
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  <!-- Feel: how a recorded tune's take is read, Straight or Swing. It shows
       in the Rhythm step and stays in the Chords step, so after any take
       (Start over, a phrase) the choice is still there to change. -->
  {#snippet feelControl()}
    {#if canReread}
      <fieldset class="feel" aria-describedby="feel-gloss">
        <legend>Feel <span class="gloss">— how your playing is read</span></legend>
        <div class="segmented">
          {#each FEELS as [value, label] (value)}
            <label class:checked={feelChoice === value}>
              <input
                type="radio"
                name="record-feel"
                {value}
                bind:group={feelChoice}
                onchange={() => chooseFeel(value)}
              />
              {label}
            </label>
          {/each}
        </div>
        {#if pendingFeel}
          <div class="feel-confirm" role="status">
            <p>Re-reading your recording replaces your note edits and chords.</p>
            <button type="button" onclick={confirmFeel}>
              Re-read as {pendingFeel === "swing" ? "Swing" : "Straight"}
            </button>
            <button type="button" onclick={keepEdits}>Keep my edits</button>
          </div>
        {/if}
        <p id="feel-gloss" class="gloss">
          Swing writes long-short pairs as even eighths that play back swung. Straight writes them
          as you played them, dotted where they're uneven. Undo takes a change back.
        </p>
      </fieldset>
    {/if}
  {/snippet}

  {#if view === "prompt"}
    <!-- Remount per song, so easy mode ranks the homes of the tune now loaded. -->
    {#key $song.id}
      <KeyPrompt
        onkey={rekey}
        ondismiss={canDismiss ? collapseKey : undefined}
        next={$song.meter.provisional ? "rhythm" : "chords"}
        autofocus={(demo && $song.key.provisional && intent === "ask") || intent === "reopened"}
      />
    {/key}
  {:else if !recording && path.current === "rhythm"}
    <!-- While a take records the steps wait for Stop, as the key question
         does (Feel can't re-read a take that is still being played). -->
    <div class="rhythm" role="group" aria-labelledby="rhythm-title">
      <h2 id="rhythm-title">Does this rhythm sound right?</h2>
      <p>
        {rhythmSource(isUserTune($song.id))}
        {$song.meter.beatsPerBar}/{$song.meter.beatUnit} at {$song.tempo} beats a minute. Press Play and
        tap along: do the bar lines fall where the beat feels strongest?
      </p>
      {@render feelControl()}
      <button type="button" onclick={confirmRhythm}>Sounds right</button>
    </div>
  {:else if !recording && path.current === "chords"}
    <div id="chords-step" class="chords-step" role="group" aria-labelledby="chords-step-title">
      <h2 id="chords-step-title">Start placing chords</h2>
      {#if start}
        <p class="start">
          Try a chord under <strong>{startWords}</strong>: click it on the staff, then hover or tap
          each chord to hear it under the tune.
        </p>
      {/if}
      {@render feelControl()}
      <div class="placement" role="status">
        {#if placement}
          <p>{placement.relation}</p>
          <p class="does">{placement.does}</p>
          <button type="button" onclick={hearPlacement}>Hear it again</button>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-top: var(--band) solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  /* Nothing to say (while a take records, the steps and questions wait for
     Stop): no empty card. It comes back with the first thing it shows. */
  section:not(:has(> :global(:not(.sound)), > .sound:not(:empty))) {
    display: none;
  }
  .path {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }
  .path li {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-muted);
  }
  .path li + li::before {
    content: "→";
    margin-right: var(--space-1);
    color: var(--ink-muted);
  }
  .num {
    display: inline-grid;
    place-items: center;
    width: 1.4rem;
    height: 1.4rem;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .path .current {
    color: var(--ink);
  }
  /* The current step is what you do now: --accent. */
  .current .num {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .name {
    font-weight: 600;
  }
  .done .name,
  .current .name {
    color: var(--ink);
  }
  /* On phones the steps stack, one per line. */
  @media (max-width: 40rem) {
    .path {
      flex-direction: column;
    }
    .path li + li::before {
      display: none;
    }
  }
  .key-tools {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
  }
  .reopen {
    padding: 0 var(--space-1);
    border: none;
    background: none;
    color: var(--ink);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  h2 {
    margin: 0;
    color: var(--accent);
    font-size: var(--text-xl);
    font-weight: 500;
  }
  .welcome {
    margin: 0;
    color: var(--ink);
    font-size: var(--text-xl);
    font-weight: 600;
    line-height: 1.2;
  }
  .invite {
    max-width: 40rem;
    margin: 0;
    color: var(--ink-muted);
  }
  .sound {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .sound:empty {
    display: none;
  }
  .sound p {
    margin: 0;
    color: var(--ink-muted);
  }
  .chords-step {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }
  .chords-step h2 {
    font-size: var(--text-lg);
  }
  .chords-step p {
    max-width: 40rem;
    margin: 0;
  }
  .start strong {
    color: var(--accent);
    font-weight: 600;
  }
  .placement {
    display: grid;
    gap: var(--space-1);
    justify-items: start;
  }
  .placement:empty {
    display: none;
  }
  .does {
    color: var(--ink-muted);
  }
  .placement button {
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--sound);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  /* Step 3's suggested note: a dashed accent ring, apart from the lesson's
     pulsing spotlight. */
  :global(#staff .is-start .abcjs-notehead) {
    stroke: var(--accent);
    stroke-width: 5px;
    stroke-dasharray: 3 2;
    paint-order: stroke;
  }
  .empty h2 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .empty h2 .num {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .rhythm {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }
  .feel {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    border: none;
  }
  .feel-confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .feel-confirm p {
    flex-basis: 100%;
    color: var(--ink);
  }
  .feel legend {
    padding: 0;
    font-weight: 500;
  }
  .gloss {
    color: var(--ink-muted);
    font-size: var(--text-sm);
    font-weight: 400;
  }
  .segmented {
    display: inline-flex;
    justify-self: start;
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .segmented label {
    position: relative;
    padding: var(--space-1) var(--space-3);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .segmented label + label {
    border-left: 1px solid var(--ink);
  }
  .segmented label.checked {
    background: var(--ink);
    color: var(--paper);
  }
  .segmented input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .segmented label:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .rhythm h2 {
    font-size: var(--text-lg);
  }
  .rhythm p,
  .feel p {
    max-width: 40rem;
    margin: 0;
    color: var(--ink-muted);
  }
  .sound button,
  .rhythm button,
  .feel-confirm button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .sound button {
    border: 2px solid var(--sound);
  }

  /* The landing's song cards (SongPicker's hero list, styled from here so the
     picker's own file stays untouched): violet tiles with a violet band. */
  section :global(#song-chooser button) {
    border-color: var(--accent-soft);
    border-left: var(--band) solid var(--accent);
    background: var(--accent-soft);
  }
  section :global(#song-chooser button:hover) {
    border-color: var(--accent);
  }
  section :global(#song-chooser .title) {
    color: var(--accent);
    font-weight: 700;
  }
</style>
