<script>
  // The "Words" switch: shows or hides the song's syllables on the lyric line
  // under the staff. It appears only when the song has words; on by default.
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { hasLyrics } from "./abc.js";

  const shown = $derived(hasLyrics($song));
</script>

{#if shown}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={$ui.showWords}
    title="Show the words under the staff"
    onclick={() => ui.update({ showWords: !$ui.showWords })}
  >
    <span class="dot" aria-hidden="true"></span>
    Words
  </button>
{/if}

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    border: 2px solid currentColor;
    border-radius: 50%;
    transition: background var(--dur-fast) var(--ease);
  }
  [aria-checked="true"] .dot {
    background: currentColor;
  }
</style>
