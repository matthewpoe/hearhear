<script>
  // A chord's label with its function shape and color (never color alone).
  // Confirmed: filled. Tentative: outlined. Hidden: letters only, no function.
  /** @import { ChordView } from "./chordView.js" */

  /** @type {{ view: ChordView }} */
  const { view } = $props();
</script>

<span class="badge fn-{view.fn ?? 'hidden'} {view.mode}">
  {#if view.shape}
    <svg class="shape" viewBox="0 0 16 16" aria-hidden="true">
      {#if view.shape === "circle"}
        <circle cx="8" cy="8" r="6" />
      {:else if view.shape === "triangle"}
        <polygon points="8,2 14.5,14 1.5,14" />
      {:else if view.shape === "square"}
        <rect x="2" y="2" width="12" height="12" />
      {:else}
        <rect x="1.5" y="1.5" width="13" height="13" rx="4" />
        <text x="8" y="12" text-anchor="middle">?</text>
      {/if}
    </svg>
  {/if}
  <span class="label"
    >{view.text}{#if view.sup}<sup>{view.sup}</sup>{/if}</span
  >
</span>

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
  .fn-tonic {
    --c: var(--fn-tonic);
    --c-soft: var(--fn-tonic-soft);
    --c-edge: var(--fn-tonic);
  }
  .fn-subdominant {
    --c: var(--fn-subdominant);
    --c-soft: var(--fn-subdominant-soft);
    --c-edge: var(--fn-subdominant-edge);
  }
  .fn-dominant {
    --c: var(--fn-dominant);
    --c-soft: var(--fn-dominant-soft);
    --c-edge: var(--fn-dominant);
  }
  .fn-hidden {
    --c-soft: var(--surface);
    --c-edge: var(--rule);
  }
  .tentative {
    border-style: dashed;
    background: transparent;
  }
  .shape {
    width: 1rem;
    height: 1rem;
    flex: none;
    fill: var(--c);
    stroke: var(--c-edge);
    stroke-width: 1;
    transition: fill var(--dur-reveal) var(--ease);
  }
  .tentative .shape {
    fill: none;
    stroke: var(--c-edge);
    stroke-width: var(--tentative-stroke);
    opacity: var(--tentative-opacity);
  }
  .shape text {
    fill: var(--fn-other-ink);
    stroke: none;
    font-size: 10px;
    font-weight: 700;
  }
  .tentative .shape text {
    fill: var(--c);
  }
  sup {
    font-size: 0.7em;
  }
</style>
