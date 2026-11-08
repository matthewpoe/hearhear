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
   *   onnext?: () => void,
   * }}
   */
  let { guess, feedback, oncheck, onkeep, onnext } = $props();

  const invite = $derived(feedback === "mismatch" || feedback === "otherMode");

  /** "You chose {key} as home." in three parts, so the key can be large. */
  const [before, after] = $derived(COPY.chose.split("{key}"));
  const key = $derived(fill("{key}", guess));

  /** @type {HTMLButtonElement | undefined} */
  let checkButton = $state();

  /** @type {HTMLElement | undefined} */
  let card = $state();

  /** Bring the card into view above the keyboard dock, without moving focus. */
  export function show() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }

  /** "Keep my choice" removes itself, so focus moves to the "Check it by ear" that stays. */
  async function keepChoice() {
    onkeep();
    await tick();
    checkButton?.focus();
  }
</script>

<div class="result" bind:this={card}>
  <p class="home">
    <span class="eyebrow">{before.trim()}</span>
    <span class="key">{key}</span>
    <span class="visually-hidden">{after}</span>
  </p>
  {#if invite}
    <p>{COPY[feedback === "otherMode" ? "otherMode" : "mismatch"]}</p>
    <p class="actions">
      <button type="button" class="secondary" onclick={oncheck}>{COPY.check}</button>
      <button type="button" class="secondary" onclick={keepChoice}>{COPY.keep}</button>
    </p>
  {:else if feedback === "match"}
    <p class="verdict">{COPY.match}</p>
  {/if}
  <div class="actions">
    {#if onnext}
      <button type="button" class="primary" onclick={onnext}>Next: find the chords</button>
    {/if}
    {#if !invite}
      <span class="check">
        Not sure? <button type="button" class="link" bind:this={checkButton} onclick={oncheck}
          >{COPY.check}</button
        >
      </span>
    {/if}
  </div>
  <p class="hint">Then click a note on the staff, or play chords with the keys A to J.</p>
</div>

<style>
  .result {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-left: var(--band) solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    animation: arrive var(--dur-reveal) var(--ease);
  }
  p {
    margin: 0;
    color: var(--ink);
  }
  .home {
    display: grid;
  }
  .eyebrow {
    color: var(--ink-muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .key {
    color: var(--accent);
    font-size: 2rem;
    font-weight: 600;
    line-height: 1.15;
  }
  .verdict {
    font-weight: 500;
  }
  .hint {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    margin-top: var(--space-1);
  }
  .check {
    color: var(--ink-muted);
  }
  button {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-lg);
    font: inherit;
    cursor: pointer;
  }
  /* The step's one advance: --accent, what you do. */
  .primary {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 600;
  }
  .secondary {
    border: 1px solid var(--rule);
    background: var(--surface);
    color: var(--ink);
  }
  .link {
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(0.25rem);
    }
  }
</style>
