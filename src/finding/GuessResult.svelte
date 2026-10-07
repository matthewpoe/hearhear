<script>
  /**
   * Under the picker once a home is chosen. The labels reveal around it
   * (keyLabelMode turns confirmed) and follow the guess, right or wrong.
   * Every guess gets the same next steps (decision D14): no buzzer, no
   * correction, and no "correct" either. The colors carry the consequence.
   * @import { Key } from "../types.js"
   */
  import { keyName } from "./keys.js";

  /** @type {{ guess: Key, oncheck: () => void }} */
  let { guess, oncheck } = $props();
</script>

<div class="result">
  <p class="home">Home is {keyName(guess)}.</p>
  <p>
    Next: find the chords. Click a note on the staff to try chords under it, or use the bottom row
    of keys (A to J) to play chords as you go.
  </p>
  <p>
    Not sure? <button type="button" onclick={oncheck}>Check it by ear</button>
  </p>
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
