<script>
  /**
   * An on/off setting in the staff's tool row: a role="switch" button drawn
   * as a switch (a track and a thumb), with its tooltip.
   */
  import Tip from "./Tip.svelte";

  /**
   * @type {{
   *   id: string,
   *   label: string,
   *   tip: string,
   *   checked: boolean,
   *   disabled?: boolean,
   *   onchange: () => void,
   * }}
   */
  let { id, label, tip, checked, disabled = false, onchange } = $props();
</script>

<Tip id="{id}-tip" text={tip}>
  <button
    {id}
    type="button"
    class="switch"
    role="switch"
    aria-checked={checked}
    aria-describedby="{id}-tip"
    {disabled}
    onclick={onchange}
  >
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
    {label}
  </button>
</Tip>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink);
    font-size: var(--text-sm);
    white-space: nowrap;
    cursor: pointer;
  }
  .switch:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .track {
    position: relative;
    flex: none;
    width: 1.9rem;
    height: 1.1rem;
    border: 2px solid currentColor;
    border-radius: 999px;
    transition: background var(--dur-fast) var(--ease);
  }
  .thumb {
    position: absolute;
    top: 50%;
    left: 2px;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: currentColor;
    transform: translateY(-50%);
    transition: left var(--dur-fast) var(--ease);
  }
  [aria-checked="true"] .track {
    border-color: var(--ink);
    background: var(--ink);
  }
  [aria-checked="true"] .thumb {
    left: calc(100% - 0.6rem - 2px);
    background: var(--paper);
  }
  @media (prefers-reduced-motion: reduce) {
    .track,
    .thumb {
      transition: none;
    }
  }
</style>
