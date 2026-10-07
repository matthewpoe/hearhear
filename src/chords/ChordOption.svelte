<script>
  // One chord in the dropdown. Hover or focus previews it (the parent auditions
  // it and lights its tones); click or Enter chooses it.
  /** @import { ChordOption } from "./options.js" */
  /** @import { ChordView } from "./chordView.js" */
  import ChordBadge from "./ChordBadge.svelte";

  /**
   * @type {{
   *   option: ChordOption,
   *   view: ChordView,
   *   current: boolean,
   *   detail?: string,
   *   onpreview: (option: ChordOption, via: "hover" | "focus") => void,
   *   onunpreview: (via: "hover" | "focus") => void,
   *   onchoose: (option: ChordOption) => void,
   * }}
   */
  const { option, view, current, detail, onpreview, onunpreview, onchoose } = $props();
</script>

<button
  type="button"
  class="option"
  data-option={option.key}
  aria-label="{view.name}. {option.why}{current ? '. Current chord' : ''}{detail
    ? `. ${detail}`
    : ''}"
  onmouseenter={() => onpreview(option, "hover")}
  onmouseleave={() => onunpreview("hover")}
  onfocus={() => onpreview(option, "focus")}
  onblur={() => onunpreview("focus")}
  onclick={() => onchoose(option)}
>
  <ChordBadge {view} />
  <span class="why">{option.why}</span>
  {#if current}<span class="current">Current</span>{/if}
  {#if detail}<span class="detail">{detail}</span>{/if}
</button>

<style>
  .option {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    width: 100%;
    padding: var(--space-2);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .option:hover,
  .option:focus-visible {
    border-color: var(--rule);
    background: var(--paper);
  }
  .why {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .current {
    font-size: var(--text-sm);
    font-weight: 500;
  }
  .detail {
    grid-column: 1 / -1;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
</style>
