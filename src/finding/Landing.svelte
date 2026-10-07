<script>
  /**
   * The welcome region (Stream D3): load a demo tune, then find its key. The
   * key prompt appears when a demo is waiting for a guess, or in free play
   * once there's about a phrase on the provisional C.
   * @import { Key, Song } from "../types.js"
   */
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, preload, unlock } from "../audio/index.js";
  import { DEMO_TUNES, loadDemo, trueKeyOf } from "./demoTunes.js";
  import { stopListening } from "./listen.js";
  import KeyPrompt from "./KeyPrompt.svelte";
  import GuessResult from "./GuessResult.svelte";

  /** Notes of free play before the prompt asks: about a phrase. */
  const PHRASE_NOTES = 8;

  let guessed = $state(false);
  let reopened = $state(false);
  let dismissed = $state(false);
  let soundBlocked = $state(false);

  const empty = $derived($song.notes.length === 0);
  const awaiting = $derived(
    !empty &&
      $song.key.provisional &&
      ($ui.demoAwaitingGuess || ($song.notes.length >= PHRASE_NOTES && !dismissed)),
  );
  const showPrompt = $derived(awaiting || reopened);
  const showResult = $derived(!showPrompt && guessed && !$song.key.provisional);

  $effect(() => {
    warmUp();
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
    guessed = false;
    reopened = false;
    dismissed = false;
    startSound();
  }

  /** @param {Pick<Key, "tonic" | "mode">} key */
  function commit({ tonic, mode }) {
    stopListening();
    song.rekey({ tonic, mode, provisional: false });
    ui.update({ demoAwaitingGuess: false });
    guessed = true;
    reopened = false;
  }

  /** Free play can put the prompt off; a demo waits for its guess. */
  const dismiss = $derived(
    $ui.demoAwaitingGuess
      ? undefined
      : reopened
        ? () => (reopened = false)
        : () => (dismissed = true),
  );
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

  <div class="chooser" role="group" aria-labelledby="load-title">
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

  {#if showPrompt}
    <KeyPrompt onguess={commit} ondismiss={dismiss} autofocus={$ui.demoAwaitingGuess || reopened} />
  {:else if showResult}
    <GuessResult
      guess={$song.key}
      trueKey={trueKeyOf($song.id)}
      onchange={() => (reopened = true)}
    />
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
  .sound button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
</style>
