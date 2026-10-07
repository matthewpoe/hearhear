<script>
  /**
   * A one-of-many choice in the staff's tool row: radios drawn as a
   * segmented control, each option with its own tooltip (the radio points to
   * it with aria-describedby). Arrow keys move between options, as radios do.
   */
  import Tip from "./Tip.svelte";

  /**
   * @typedef {{ value: string, label: string, tip: string, disabled?: boolean }} Option
   * @type {{
   *   name: string,
   *   legend: string,
   *   options: Option[],
   *   value: string,
   *   onchange: (value: string) => void,
   * }}
   */
  let { name, legend, options, value, onchange } = $props();
</script>

<fieldset class="segmented">
  <legend class="visually-hidden">{legend}</legend>
  {#each options as option (option.value)}
    <Tip id="{name}-{option.value}-tip" text={option.tip}>
      <label class:disabled={option.disabled}>
        <input
          type="radio"
          {name}
          value={option.value}
          checked={value === option.value}
          disabled={option.disabled}
          aria-describedby="{name}-{option.value}-tip"
          onchange={() => onchange(option.value)}
        />
        {option.label}
      </label>
    </Tip>
  {/each}
</fieldset>

<style>
  .segmented {
    display: inline-flex;
    margin: 0;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
  }
  label {
    position: relative;
    padding: var(--space-1) var(--space-2);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    white-space: nowrap;
    cursor: pointer;
  }
  .segmented :global(.tip + .tip > label) {
    border-left: 1px solid var(--rule);
  }
  .segmented :global(.tip:first-of-type > label) {
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  }
  .segmented :global(.tip:last-of-type > label) {
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  /* --accent is what you do (tokens.css): the chosen option. */
  label:has(input:checked) {
    background: var(--accent);
    color: var(--accent-ink);
  }
  label.disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  label:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 1px;
    z-index: 1;
  }
  /* A focus ring drawn on the violet fill flips to the fill's ink. */
  label:has(input:checked):has(input:focus-visible) {
    outline-color: var(--accent-ink);
    outline-offset: -4px;
  }
</style>
