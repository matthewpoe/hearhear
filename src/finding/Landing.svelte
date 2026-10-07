<script>
  /**
   * The welcome region (Stream D3): load a demo tune, then find its key. With
   * no song it's a compact welcome with the song cards; once a song is on the
   * staff, the chooser moves to the masthead and this region holds only the
   * key question and the sound status, under the staff. The
   * key prompt appears when a demo is waiting for a guess, or in free play
   * once there's about a phrase on the provisional C. It owns the piano's
   * warm-up (decision D19): preload on mount, unlock with the sound-check
   * chord on the first click anywhere.
   * @import { Key } from "../types.js"
   */
  import { onMount } from "svelte";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, preload, unlock } from "../audio/index.js";
  import SongPicker from "../toolbar/SongPicker.svelte";
  import { stopListening } from "./listen.js";
  import KeyPrompt from "./KeyPrompt.svelte";

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

  /** @type {"none" | "prompt" | "find"} */
  const view = $derived.by(() => {
    if (empty) return "none";
    // A demo always waits for its guess, even after an undo (D18).
    if ($song.key.provisional && demo) return "prompt";
    if (intent === "dismissed") return "find";
    if (intent !== "ask") return "prompt";
    if (!$song.key.provisional) return "none";
    return $song.notes.length >= PHRASE_NOTES ? "prompt" : "none";
  });

  const soundNote = $derived(
    $audioStatus === "loading" || $audioStatus === "failed" || soundBlocked,
  );
  /** Nothing to show: no card, so the step column starts with the chords. */
  const quiet = $derived(!empty && view === "none" && !soundNote);

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
      await unlock();
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

<section id="landing" class:empty class:quiet aria-label="Welcome">
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

  {#if view === "prompt"}
    <!-- Remount per song, so easy mode ranks the homes of the tune now loaded. -->
    {#key $song.id}
      <KeyPrompt
        onkey={rekey}
        ondismiss={canDismiss ? () => (intent = "dismissed") : undefined}
        autofocus={(demo && intent === "ask") || intent === "reopened"}
      />
    {/key}
  {:else if view === "find"}
    <div class="find">
      <button type="button" onclick={() => (intent = "reopened")}>
        {$song.key.provisional ? "Find the key" : "Change the key"}
      </button>
    </div>
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .quiet {
    display: none;
  }
  h2 {
    margin: 0;
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
  .sound button,
  .find button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
</style>
