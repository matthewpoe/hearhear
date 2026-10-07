<script>
  /**
   * After a guess commits. The labels reveal around it (keyLabelMode turns
   * confirmed) and follow the guess, right or wrong. Every guess gets the same
   * next step, checking it by ear with the drone (decision D14): no buzzer, no
   * correction, and no "correct" either. The colors carry the consequence.
   * @import { Key } from "../types.js"
   */
  import { keyName } from "./keys.js";
  import ListenButton from "./ListenButton.svelte";

  /** @type {{ guess: Key, onchange: () => void }} */
  let { guess, onchange } = $props();

  /** @type {HTMLElement | undefined} */
  let heading = $state();
  $effect(() => heading?.focus());
</script>

<div class="result" role="group" aria-labelledby="guess-title">
  <h3 id="guess-title" bind:this={heading} tabindex="-1">Home is {keyName(guess)}.</h3>
  <p>The number row starts on {guess.tonic} now, and the colors follow your guess.</p>
  <p>
    Check it by ear: hold {guess.tonic} underneath the tune. Does the melody settle or itch? If it itches,
    home may be somewhere else.
  </p>
  <div class="actions">
    <ListenButton label="Check it by ear" droneKey={guess} />
    <button type="button" onclick={onchange}>Try another home</button>
  </div>
</div>

<style>
  .result {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
    animation: arrive var(--dur-reveal) var(--ease);
  }
  h3 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 500;
  }
  p {
    margin: 0;
    color: var(--ink-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .actions button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(0.25rem);
    }
  }
</style>
