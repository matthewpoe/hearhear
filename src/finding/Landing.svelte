<script>
  /**
   * The welcome region (Stream D3): load a demo tune, then find its key. The
   * key prompt appears when a demo is waiting for a guess, or in free play
   * once there's about a phrase on the provisional C. It owns the piano's
   * warm-up (decision D19): preload on mount, unlock with the sound-check
   * chord on the first click anywhere.
   * @import { Key, Song } from "../types.js"
   */
  import { onMount } from "svelte";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, preload, unlock } from "../audio/index.js";
  import { DEMO_TUNES, loadDemo } from "./demoTunes.js";
  import { stopListening } from "./listen.js";
  import KeyPrompt from "./KeyPrompt.svelte";
  import GuessResult from "./GuessResult.svelte";

  /** Notes of free play before the prompt asks: about a phrase. */
  const PHRASE_NOTES = 8;

  /**
   * What the user last did with the key prompt. With the two store facts (is
   * the key provisional, is a demo awaiting its guess) it decides the view.
   * "ask": nothing yet; "dismissed": put off in free play; "reopened": asked
   * for the prompt again; "guessed": committed a key.
   * @type {"ask" | "dismissed" | "reopened" | "guessed"}
   */
  let intent = $state("ask");
  let soundBlocked = $state(false);

  const empty = $derived($song.notes.length === 0);
  const demo = $derived($ui.demoAwaitingGuess);

  /** @type {"none" | "prompt" | "find" | "result"} */
  const view = $derived.by(() => {
    if (empty) return "none";
    if (intent === "reopened") return "prompt";
    if (!$song.key.provisional) return intent === "guessed" ? "result" : "none";
    // Provisional: a demo always waits for its guess, even after an undo (D18).
    if (demo) return "prompt";
    if (intent === "dismissed") return "find";
    return $song.notes.length >= PHRASE_NOTES ? "prompt" : "none";
  });

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

  /** @param {Song} tune */
  function choose(tune) {
    loadDemo(tune);
    intent = "ask";
  }

  /**
   * Commit a guess. The demo flag stays set until the user leaves the demo
   * (D18), so undoing the guess hides the labels again.
   * @param {Pick<Key, "tonic" | "mode">} key
   */
  function commit({ tonic, mode }) {
    stopListening();
    song.rekey({ tonic, mode, provisional: false });
    intent = "guessed";
  }

  function dismiss() {
    intent = $song.key.provisional ? "dismissed" : "guessed";
  }
</script>

<section id="landing" class:empty aria-label="Welcome">
  {#if empty}
    <h2>Hear a tune. Find where home is.</h2>
    <p class="invite">
      Pick a song, listen, and guess which note feels like home. Your ear does the finding; Hear
      Hear makes every guess quick to test.
    </p>
  {:else}
    <h2>{$song.title}</h2>
  {/if}

  <div
    class="chooser"
    id={empty ? "song-chooser" : undefined}
    role="group"
    aria-labelledby="load-title"
  >
    <h3 id="load-title">{empty ? "Load a song" : "Load another song"}</h3>
    <ul>
      {#each DEMO_TUNES as { song: tune, blurb } (tune.id)}
        <li>
          <button type="button" onclick={() => choose(tune)}>
            <span class="title">{tune.title}</span>
            {#if empty}<span class="blurb">{blurb}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </div>

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
        onguess={commit}
        ondismiss={canDismiss ? dismiss : undefined}
        autofocus={demo || intent === "reopened"}
      />
    {/key}
  {:else if view === "find"}
    <div class="find">
      <button type="button" onclick={() => (intent = "reopened")}>Find the key</button>
    </div>
  {:else if view === "result"}
    <GuessResult guess={$song.key} onchange={() => (intent = "reopened")} />
  {/if}
</section>

<style>
  section {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .empty h2 {
    font-size: var(--text-xl);
  }
  .invite {
    max-width: 40rem;
    margin: 0;
    color: var(--ink-muted);
  }
  .chooser {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chooser button {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease);
  }
  .chooser button:hover {
    border-color: var(--ink);
  }
  .empty .chooser {
    display: grid;
    justify-items: start;
  }
  .empty .chooser button {
    width: 16rem;
    padding: var(--space-3);
    border-radius: var(--radius-md);
  }
  .title {
    font-weight: 500;
  }
  .blurb {
    color: var(--ink-muted);
    font-size: var(--text-sm);
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
