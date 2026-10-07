<script>
  /**
   * After a guess commits. The labels reveal around it (keyLabelMode turns
   * confirmed) and follow the guess, right or wrong. A wrong guess in a demo
   * gets no buzzer and no correction: the next step is the drone test, so the
   * user's ear finds the itch.
   * @import { Key } from "../types.js"
   */
  import { keyName, sameHome } from "./keys.js";
  import ListenButton from "./ListenButton.svelte";

  /** @type {{ guess: Key, trueKey: Key | null, onchange: () => void }} */
  let { guess, trueKey, onchange } = $props();

  const offHome = $derived(trueKey !== null && !sameHome(guess, trueKey));

  /** @type {HTMLElement | undefined} */
  let heading = $state();
  $effect(() => heading?.focus());
</script>

<div class="result" role="group" aria-labelledby="guess-title">
  <h3 id="guess-title" bind:this={heading} tabindex="-1">Home is {keyName(guess)}.</h3>
  <p>The number row starts on {guess.tonic} now, and the colors follow your guess.</p>
  {#if offHome}
    <p>
      Want to check it by ear? Hold this note underneath. Does the melody settle or itch? If it
      itches, home may be somewhere else.
    </p>
  {:else}
    <p>Next, click a note on the staff and try a chord under it.</p>
  {/if}
  <div class="actions">
    <ListenButton label="Hold {guess.tonic} underneath" droneKey={guess} />
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
