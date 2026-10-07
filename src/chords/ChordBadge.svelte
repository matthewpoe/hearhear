<script>
  // A chord's label with its function shape and color (never color alone).
  // Confirmed: filled. Tentative: outlined. Hidden: a neutral mark only, with
  // no label, color, or shape (decision D2). The shape is the shared
  // FunctionMark (D8); the color is functionInfo's token for the function.
  /** @import { ChordView } from "./chordView.js" */
  import FunctionMark from "../lib/FunctionMark.svelte";

  /** @type {{ view: ChordView }} */
  const { view } = $props();
</script>

{#if view.fn && view.color}
  <span
    class="badge {view.mode}"
    style:--c="var({view.color})"
    style:--c-soft="var({view.color}-soft)"
    style:--c-edge="var({view.color}-edge, var({view.color}))"
  >
    <span class="shape"><FunctionMark fn={view.fn} outline={view.mode === "tentative"} /></span>
    <span class="label"
      >{view.text}{#if view.sup}<sup>{view.sup}</sup>{/if}</span
    >
  </span>
{:else}
  <span class="badge hidden" aria-hidden="true"><span class="neutral"></span></span>
{/if}

<style>
  .badge {
    --c: var(--fn-other);
    --c-soft: var(--fn-other-soft);
    --c-edge: var(--fn-other);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 3rem;
    padding: var(--space-1) var(--space-2);
    border: var(--tentative-stroke) solid var(--c-edge);
    border-radius: var(--radius-sm);
    background: var(--c-soft);
    color: var(--ink);
    font-weight: 500;
    white-space: nowrap;
    transition:
      background-color var(--dur-reveal) var(--ease),
      border-color var(--dur-reveal) var(--ease);
  }
  .tentative {
    border-style: dashed;
    background: transparent;
  }
  .hidden {
    --c-soft: var(--surface);
    --c-edge: var(--rule);
    justify-content: center;
    min-height: 1.75rem;
  }
  .neutral {
    width: 1rem;
    height: 2px;
    border-radius: 1px;
    background: var(--ink-muted);
  }
  .shape {
    --mark-size: 1rem;
    display: inline-flex;
    flex: none;
    color: var(--c);
    transition: color var(--dur-reveal) var(--ease);
  }
  /* Edge the shape so yellow keeps 3:1 against its soft background. */
  .shape :global(.mark) {
    stroke: var(--c-edge);
    stroke-width: 1;
  }
  .tentative .shape {
    opacity: var(--tentative-opacity);
  }
  .tentative .shape :global(.mark) {
    stroke-width: 1.6;
  }
  sup {
    font-size: 0.7em;
  }
</style>
