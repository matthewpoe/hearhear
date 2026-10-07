<script>
  /**
   * "Is 1 really home?" The direct question comes first: the user names a key
   * (major or minor, on any of the twelve homes). "Not sure, help me find it"
   * opens the easy mode (KeyCandidates), a drone comparison by ear.
   * Starts on the current hypothesis, so "yes, 1 is home" is one click.
   * @import { Key } from "../types.js"
   */
  import { song } from "../store/song.js";
  import { TONICS, keyName } from "./keys.js";
  import ListenButton from "./ListenButton.svelte";
  import KeyCandidates from "./KeyCandidates.svelte";

  /**
   * @type {{
   *   onguess: (key: Pick<Key, "tonic" | "mode">) => void,
   *   ondismiss?: () => void,
   *   autofocus?: boolean,
   * }}
   */
  let { onguess, ondismiss, autofocus = false } = $props();

  const start = song.get().key;
  let mode = $state(start.mode);
  let tonicIndex = $state(Math.max(0, TONICS[start.mode].indexOf(start.tonic)));
  let helping = $state(false);
  const tonic = $derived(TONICS[mode][tonicIndex]);

  /** @type {HTMLElement | undefined} */
  let heading = $state();
  $effect(() => {
    if (autofocus) heading?.focus();
  });
</script>

<div class="prompt" role="group" aria-labelledby="key-prompt-title">
  <h3 id="key-prompt-title" bind:this={heading} tabindex="-1">
    Is 1 really home? What key do you think this is?
  </h3>
  <p class="lead">
    Listen for the note the tune wants to rest on. Your answer is a hunch, not a test: you can
    change it any time.
  </p>
  <ListenButton label="Hear the tune" />

  <fieldset class="modes">
    <legend>It sounds</legend>
    {#each ["major", "minor"] as option (option)}
      <label class="chip">
        <input type="radio" name="key-mode" value={option} bind:group={mode} />
        {option === "major" ? "Major (bright)" : "Minor (dark)"}
      </label>
    {/each}
  </fieldset>

  <fieldset class="tonics">
    <legend>Home is</legend>
    {#each TONICS[mode] as name, index (index)}
      <label class="chip">
        <input type="radio" name="key-tonic" value={index} bind:group={tonicIndex} />
        {name}
      </label>
    {/each}
  </fieldset>

  <div class="actions">
    <button type="button" class="commit" onclick={() => onguess({ tonic, mode })}>
      Make {keyName({ tonic, mode })} home
    </button>
    <button type="button" aria-expanded={helping} onclick={() => (helping = !helping)}>
      Not sure, help me find it
    </button>
    {#if ondismiss}
      <button type="button" class="quiet" onclick={ondismiss}>Not now</button>
    {/if}
  </div>

  {#if helping}
    <KeyCandidates {onguess} />
  {/if}
</div>

<style>
  .prompt {
    display: grid;
    gap: var(--space-3);
    justify-items: start;
  }
  h3 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .lead {
    margin: 0;
    color: var(--ink-muted);
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    float: left;
    margin-right: var(--space-2);
    padding: var(--space-1) 0;
    font-weight: 500;
  }
  .chip {
    position: relative;
    min-width: 2.75rem;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    text-align: center;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }
  .chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .chip:has(input:checked) {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }
  .chip:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .actions button {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .actions .commit {
    background: var(--ink);
    color: var(--paper);
  }
  .actions .quiet {
    border-color: transparent;
    color: var(--ink-muted);
  }
</style>
