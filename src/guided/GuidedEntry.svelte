<script>
  // The way into the guided tour (Stream G): "Take the guided tour" in the
  // masthead, and a "Show me how" invitation across the top of the empty
  // landing. The tour itself runs in the strip on the keyboard dock
  // (GuidedPath.svelte).
  import { song } from "../store/song.js";
  import { tour, startTour } from "./tour.js";

  const empty = $derived($song.notes.length === 0);
</script>

{#if !$tour.running}
  <button id="guided-entry" type="button" class="entry" onclick={startTour}>
    {$tour.index > 0 ? "Resume the guided tour" : "Take the guided tour"}
  </button>
  {#if empty}
    <div class="invite" role="group" aria-label="Guided tour invitation">
      <p>New here? In about two minutes, hear a tune, find its home, and hear a chord land.</p>
      <button type="button" class="primary" onclick={startTour}>Show me how</button>
    </div>
  {/if}
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
  .primary {
    background: var(--ink);
    color: var(--paper);
  }
  /* The invitation takes a line of its own in the masthead's wrapping row,
     lined up with the workspace below it (App.svelte: 80rem less its
     padding, centred). */
  .invite {
    flex: 1 0 100%;
    max-width: calc(80rem - 2 * var(--space-4));
    margin-inline: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  p {
    margin: 0;
  }
</style>
