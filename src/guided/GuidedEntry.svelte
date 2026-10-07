<script>
  // The way back into the guided walkthrough: one "Guided lesson" button in
  // the masthead, shown while it isn't running. On a first visit the
  // walkthrough starts on its own (tour.js), so there is no choice screen.
  import { tour, startTour } from "./tour.js";
</script>

{#if !$tour.running}
  <button id="guided-entry" type="button" class="entry" onclick={startTour}>Guided lesson</button>
{/if}

<style>
  button {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
</style>
