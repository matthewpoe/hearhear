<script>
  /**
   * "More": the tool row's overflow for rare actions (printing the lead
   * sheet), so the row stays one line. A disclosure, not an ARIA menu: Tab
   * moves through its buttons; Escape or a click outside closes it.
   */
  import { tick } from "svelte";
  import Tip from "./Tip.svelte";
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { CONTROLS } from "../lib/controls.js";

  /** @type {{ printable: boolean }} */
  let { printable } = $props();

  let open = $state(false);
  /** @type {HTMLElement | undefined} */
  let root = $state();
  /** @type {HTMLButtonElement | undefined} */
  let toggle = $state();

  /** @param {boolean} [refocus] */
  function close(refocus = false) {
    open = false;
    if (refocus) toggle?.focus();
  }

  /** @param {PointerEvent} event */
  function onWindowPointerDown(event) {
    if (open && root && !root.contains(/** @type {Node} */ (event.target))) close();
  }

  /** @param {KeyboardEvent} event */
  function onkeydown(event) {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      close(true);
    }
  }

  async function print() {
    close(true);
    await tick();
    window.print();
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="more" bind:this={root} {onkeydown}>
  <Tip id="more-tip" text={explainers.options.more} align="end">
    <button
      bind:this={toggle}
      type="button"
      class="toggle"
      aria-expanded={open}
      aria-controls="more-actions"
      aria-describedby="more-tip"
      onclick={() => (open = !open)}
    >
      More <span aria-hidden="true">▾</span>
    </button>
  </Tip>
  <div id="more-actions" class="panel" hidden={!open}>
    <Tip id="print-tip" text={explainers.options.print} align="end">
      <button type="button" aria-describedby="print-tip" disabled={!printable} onclick={print}
        >{CONTROLS.printLeadSheet}</button
      >
    </Tip>
  </div>
</div>

<style>
  .more {
    position: relative;
  }
  button {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    white-space: nowrap;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--ink-muted);
  }
  button:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 31;
    display: grid;
    gap: var(--space-1);
    min-width: 12rem;
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
  }
  .panel[hidden] {
    display: none;
  }
  .panel button {
    text-align: left;
  }
</style>
