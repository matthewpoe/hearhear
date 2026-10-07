<script>
  // How the staff and chips label things: a segmented control for chord
  // labels, and a switch for scale-degree numbers under the melody.
  import { ui } from "../store/ui.js";

  /** @type {{ value: import("../types.js").LabelStyle, label: string, example: string }[]} */
  const LABEL_STYLES = [
    { value: "roman", label: "Roman", example: "I IV V" },
    { value: "nashville", label: "Nashville", example: "1 4 5" },
    { value: "letters", label: "Letters", example: "C F G" },
    { value: "roman+letters", label: "Roman + letters", example: "I (C)" },
  ];
</script>

<fieldset class="segmented">
  <legend class="visually-hidden">Chord labels</legend>
  {#each LABEL_STYLES as style (style.value)}
    <label title={style.example}>
      <input
        type="radio"
        name="label-style"
        value={style.value}
        checked={$ui.labelStyle === style.value}
        onchange={() => ui.update({ labelStyle: style.value })}
      />
      {style.label}
    </label>
  {/each}
</fieldset>

<button
  type="button"
  class="switch"
  role="switch"
  aria-checked={$ui.showDegrees}
  onclick={() => ui.update({ showDegrees: !$ui.showDegrees })}
>
  <span class="dot" aria-hidden="true"></span>
  Scale degrees
</button>

<style>
  .segmented {
    display: inline-flex;
    flex-wrap: wrap;
    margin: 0;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  label {
    position: relative;
    padding: var(--space-1) var(--space-2);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  label + label {
    border-left: 1px solid var(--rule);
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  label:has(input:checked) {
    background: var(--ink);
    color: var(--paper);
  }
  label:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: -3px;
  }
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
    border: 2px solid var(--ink);
    border-radius: 50%;
    transition: background var(--dur-fast) var(--ease);
  }
  [aria-checked="true"] .dot {
    background: var(--ink);
  }
</style>
