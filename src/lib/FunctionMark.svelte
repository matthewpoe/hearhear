<script>
  /**
   * The Bauhaus shape for a harmonic function, so a lit chord tone never
   * relies on color alone: tonic circle, subdominant triangle, dominant
   * square, and a question mark for anything else. Drawn in currentColor;
   * `outline` is the tentative style. Shared by the piano, the chord chips,
   * and the staff; size it with --mark-size (default 0.625rem).
   * @type {{ fn: import("../types.js").HarmonicFunction, outline: boolean }}
   */
  const { fn, outline = false } = $props();
</script>

<svg class="mark" class:outline viewBox="0 0 10 10" aria-hidden="true">
  {#if fn === "tonic"}
    <circle cx="5" cy="5" r="4" />
  {:else if fn === "subdominant"}
    <polygon points="5,1 9.2,9 0.8,9" />
  {:else if fn === "dominant"}
    <rect x="1.2" y="1.2" width="7.6" height="7.6" />
  {:else}
    <text x="5" y="8.6" text-anchor="middle">?</text>
  {/if}
</svg>

<style>
  .mark {
    width: var(--mark-size, 0.625rem);
    height: var(--mark-size, 0.625rem);
    fill: currentColor;
    stroke: currentColor;
    stroke-width: 0;
  }
  .outline {
    fill: none;
    stroke-width: 1.6;
  }
  text {
    font: 700 9px var(--font);
    fill: currentColor;
    stroke: none;
  }
</style>
