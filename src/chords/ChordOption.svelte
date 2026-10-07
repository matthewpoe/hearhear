<script>
  // One chord in the dropdown. Hover or focus previews it (the parent auditions
  // it and lights its tones); click or Enter chooses it. A tap reports itself
  // as "touch" so the parent can preview first and choose on a second tap.
  /** @import { ChordOption } from "./options.js" */
  /** @import { ChordView } from "./chordView.js" */
  import ChordBadge from "./ChordBadge.svelte";
  import { pointerTypeOf } from "./tap.js";

  /**
   * @type {{
   *   option: ChordOption,
   *   view: ChordView,
   *   current: boolean,
   *   detail?: string,
   *   tapped?: boolean,
   *   onpreview: (option: ChordOption, via: "hover" | "focus") => void,
   *   onunpreview: (via: "hover" | "focus") => void,
   *   onactivate: (option: ChordOption, pointerType: string) => void,
   * }}
   */
  const {
    option,
    view,
    current,
    detail,
    tapped = false,
    onpreview,
    onunpreview,
    onactivate,
  } = $props();

  // Not state: read once by the click that follows the press.
  let lastPointerType = "";

  /** @param {MouseEvent} event */
  function onclick(event) {
    const pointerType = pointerTypeOf(
      { detail: event.detail, pointerType: "pointerType" in event ? event.pointerType : "" },
      lastPointerType,
    );
    lastPointerType = "";
    onactivate(option, pointerType);
  }
</script>

<button
  type="button"
  class="option"
  class:tapped
  data-option={option.key}
  aria-label="{view.name}. {option.why}{current ? '. Current chord' : ''}{detail
    ? `. ${detail}`
    : ''}"
  onmouseenter={() => onpreview(option, "hover")}
  onmouseleave={() => onunpreview("hover")}
  onfocus={() => onpreview(option, "focus")}
  onblur={() => onunpreview("focus")}
  onpointerdown={(event) => (lastPointerType = event.pointerType)}
  {onclick}
>
  <ChordBadge {view} />
  <span class="why">{option.why}</span>
  {#if current}<span class="current">Current</span>{/if}
  {#if detail}<span class="detail">{detail}</span>{/if}
  <!-- The dropdown's live region announces this; the visible copy is for sight. -->
  {#if tapped}<span class="tap-again" aria-hidden="true">Tap again to choose</span>{/if}
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
    /* A quick second tap chooses; it must not double-tap-zoom instead. */
    touch-action: manipulation;
  }
  .option:hover,
  .option:focus-visible {
    border-color: var(--rule);
    background: var(--paper);
  }
  .option.tapped {
    border-color: var(--ink);
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
  .detail,
  .tap-again {
    grid-column: 1 / -1;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .tap-again {
    color: var(--ink);
    font-weight: 500;
  }
</style>
