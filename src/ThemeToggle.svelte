<script>
  import { theme, setTheme } from "./theme.js";

  const dark = $derived($theme === "dark");
</script>

<button
  type="button"
  class="theme-toggle"
  aria-pressed={dark}
  onclick={() => setTheme(dark ? "light" : "dark")}
>
  <span class="dot" aria-hidden="true"></span>
  Dark mode
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .dot {
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid var(--ink);
    border-radius: 50%;
    transition: background var(--dur-fast) var(--ease);
  }
  [aria-pressed="true"] .dot {
    background: var(--ink);
  }
</style>
