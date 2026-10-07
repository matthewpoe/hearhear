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
   * @import { Key } from "../types.js"
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
  import DegreesSwitch from "../toolbar/DegreesSwitch.svelte";
  import { recorder } from "../record/tunes.js";
  import { isUserTune } from "../record/take.js";

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

  /** A recorded tune's rhythm guess, taken as it is (the 3-vs-4 question is parked). */
  function confirmRhythm() {
    const now = song.get();
    song.rebar({ ...now.meter, provisional: false });
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

  /** "Next: find the chords" or "Not now": collapse the key step, keeping focus on its row. */
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

<section id="landing" class:empty aria-label={empty ? "Welcome" : "Next step"}>
  {#if empty}
    <h2>Hear a tune. Find where home is.</h2>
    <p class="invite">
      Pick a song, listen, and guess which note feels like home. Your ear does the finding; Hear
      Hear makes every guess quick to test.
    </p>
    <SongPicker hero />
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
          <span class="num" aria-hidden="true">{i + 1}</span>
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
              <DegreesSwitch />
            </span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}

  {#if view === "prompt"}
    <!-- Remount per song, so easy mode ranks the homes of the tune now loaded. -->
    {#key $song.id}
      <KeyPrompt
        onkey={rekey}
        ondismiss={canDismiss ? collapseKey : undefined}
        autofocus={(demo && $song.key.provisional && intent === "ask") || intent === "reopened"}
      />
    {/key}
  {:else if path.current === "rhythm"}
    <div class="rhythm" role="group" aria-labelledby="rhythm-title">
      <h2 id="rhythm-title">Does this rhythm sound right?</h2>
      <p>
        {rhythmSource(isUserTune($song.id))}
        {$song.meter.beatsPerBar}/{$song.meter.beatUnit} at {$song.tempo} beats a minute. Press Play and
        tap along: do the bar lines fall where the beat feels strongest?
      </p>
      <button type="button" onclick={confirmRhythm}>Sounds right</button>
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
  .rhythm {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }
  .rhythm h2 {
    font-size: var(--text-lg);
  }
  .rhythm p {
    max-width: 40rem;
    margin: 0;
    color: var(--ink-muted);
  }
  .sound button,
  .rhythm button {
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
