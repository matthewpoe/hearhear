<script>
  /**
   * Under the picker once a home is chosen. The labels reveal around it
   * (keyLabelMode turns confirmed) and follow the guess, right or wrong. It
   * says "You chose", never "Home is": the guess is a hunch to test. On a
   * demo, whose home is known, a match is confirmed and a mismatch gets a
   * gentle invitation to check by ear or keep the choice, never a "wrong"
   * and never the answer (guessFeedback.js). KeyPrompt's live region
   * announces the same words.
   * @import { Key } from "../types.js"
   * @import { Feedback } from "./guessFeedback.js"
   */
  import { tick } from "svelte";
  import { COPY, fill } from "./guessFeedback.js";

  /**
   * @type {{
   *   guess: Key,
   *   feedback: Feedback,
   *   oncheck: () => void,
   *   onkeep: () => void,
   * }}
   */
  let { guess, feedback, oncheck, onkeep } = $props();

  const invite = $derived(feedback === "mismatch" || feedback === "otherMode");

  /** @type {HTMLButtonElement | undefined} */
  let checkButton = $state();

  /** "Keep my choice" removes itself, so focus moves to the "Check it by ear" that stays. */
  async function keepChoice() {
    onkeep();
    await tick();
    checkButton?.focus();
  }
</script>

<div class="result">
  <p class="home">{fill(COPY.chose, guess)}</p>
  {#if invite}
    <p>{COPY[feedback === "otherMode" ? "otherMode" : "mismatch"]}</p>
    <p class="actions">
      <button type="button" onclick={oncheck}>{COPY.check}</button>
      <button type="button" onclick={keepChoice}>{COPY.keep}</button>
    </p>
  {:else}
    {#if feedback === "match"}
      <p class="home">{COPY.match}</p>
    {/if}
    <p>
      Next: find the chords. Click a note on the staff to try chords under it, or use the bottom row
      of keys (A to J) to play chords as you go.
    </p>
    <p>
      Not sure? <button type="button" bind:this={checkButton} onclick={oncheck}>{COPY.check}</button
      >
    </p>
  {/if}
</div>

<style>
  .result {
    display: grid;
    gap: var(--space-1);
    animation: arrive var(--dur-reveal) var(--ease);
  }
  p {
    margin: 0;
    color: var(--ink-muted);
  }
  .home {
    color: var(--ink);
    font-weight: 500;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
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
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(0.25rem);
    }
  }
</style>
