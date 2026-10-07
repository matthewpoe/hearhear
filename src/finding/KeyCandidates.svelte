<script>
  /**
   * "Help me find it", the ear finder: the keyFinding explainer verbatim,
   * then rankKeys' top three homes as chords to play under the tune, in an
   * order shuffled per song so the likeliest isn't always first. Chords are
   * unnamed until one is chosen; choosing commits that key, exactly as its
   * home chip does, and names it. "Try three more" moves to the next three.
   * Opening moves focus to its heading; Close or Escape collapses it.
   * @import { Key } from "../types.js"
   */
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { song } from "../store/song.js";
  import { rankKeys } from "../theory/index.js";
  import { FINDER_SIZE, finderHomes } from "./finderHomes.js";
  import { keyName, sameHome } from "./keys.js";
  import ListenButton from "./ListenButton.svelte";

  /**
   * @type {{
   *   onpick: (home: Pick<Key, "tonic" | "mode">) => void,
   *   onclose: () => void,
   *   opener?: HTMLElement,
   * }}
   */
  let { onpick, onclose, opener } = $props();

  const { title, body } = explainers.keyFinding;
  // Ranked once when the finder opens, so the chords don't reshuffle under the user.
  const ranked = rankKeys(song.get().notes);
  const seed = song.get().id;

  let set = $state(0);
  const homes = $derived(finderHomes(ranked, seed, set));
  const sets = Math.ceil(ranked.length / FINDER_SIZE);
  /** Chord numbers run on across sets (4, 5, 6 after "Try three more"). */
  const first = $derived((set % sets) * FINDER_SIZE + 1);

  /** @param {Pick<Key, "tonic" | "mode">} home */
  const chosen = (home) => !$song.key.provisional && sameHome($song.key, home);

  /** @type {HTMLElement | undefined} */
  let root = $state();
  /** @type {HTMLElement | undefined} */
  let heading = $state();

  $effect(() => {
    heading?.focus();
  });

  /**
   * Escape closes the finder while focus is inside it or on what opened it.
   * @param {KeyboardEvent} event
   */
  function onkeydown(event) {
    if (event.key !== "Escape") return;
    const active = document.activeElement;
    if (root?.contains(active) || (opener && active === opener)) onclose();
  }
</script>

<svelte:window {onkeydown} />

<div
  id="key-finder"
  class="finder"
  role="group"
  aria-labelledby="key-finder-title"
  bind:this={root}
>
  <div class="top">
    <h3 id="key-finder-title" bind:this={heading} tabindex="-1">{title}</h3>
    <button type="button" class="close" onclick={onclose}>
      Close <span class="visually-hidden">the key finder</span>
    </button>
  </div>
  <p class="explainer">{body}</p>

  <p>Play the tune over each chord. Which one sounds like home?</p>
  <ol>
    {#each homes as home, index (`${set}-${index}`)}
      {@const n = first + index}
      <li class:chosen={chosen(home)}>
        <span class="name">
          Chord {n}{#if chosen(home)}: {keyName(home)}{/if}
        </span>
        <span class="tests">
          <ListenButton label="Play the tune over chord {n}" droneKey={home} />
          <button type="button" aria-pressed={chosen(home)} onclick={() => onpick(home)}>
            Chord {n} sounds like home
          </button>
        </span>
      </li>
    {/each}
  </ol>

  <p class="more">
    None of these sound like home?
    <button type="button" onclick={() => set++}>Try three more</button>
  </p>
</div>

<style>
  .finder {
    display: grid;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--paper);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  p {
    margin: 0;
    color: var(--ink-muted);
  }
  .explainer {
    max-width: 40rem;
    color: var(--ink);
  }
  ol {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  li.chosen {
    border-color: var(--ink);
  }
  .name {
    min-width: 6rem;
    font-weight: 500;
  }
  .tests {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: auto;
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  button[aria-pressed="true"] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }
  .close {
    border-color: transparent;
    color: var(--ink-muted);
  }
</style>
