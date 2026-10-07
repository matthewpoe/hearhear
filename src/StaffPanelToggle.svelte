<script>
  // The dark theme's staff panel, beside the Dark mode toggle. Absent in the
  // light theme, where the staff always draws on the light page.
  import { theme } from "./theme.js";
  import { staffPanel, setStaffPanel } from "./staffPanel.js";

  /** @type {{ value: import("./staffPanel.js").StaffPanel, label: string }[]} */
  const PANELS = [
    { value: "slate", label: "Slate" },
    { value: "paper", label: "Paper" },
  ];
</script>

{#if $theme === "dark"}
  <fieldset class="staff-panel">
    <legend>Staff</legend>
    <div class="segmented">
      {#each PANELS as panel (panel.value)}
        <label>
          <input
            type="radio"
            name="staff-panel"
            value={panel.value}
            checked={$staffPanel === panel.value}
            onchange={() => setStaffPanel(panel.value)}
          />
          {panel.label}
        </label>
      {/each}
    </div>
  </fieldset>
{/if}

<style>
  .staff-panel {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: none;
  }
  /* A legend can't be a flex item, so it floats beside the options. */
  legend {
    float: left;
    padding: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  /* "Staff:" on screen; the group's name stays "Staff". */
  legend::after {
    content: ":" / "";
  }
  .segmented {
    display: inline-flex;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  label {
    position: relative;
    padding: var(--space-1) var(--space-3);
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
    background: var(--accent);
    color: var(--accent-ink);
  }
  label:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: -3px;
  }
</style>
