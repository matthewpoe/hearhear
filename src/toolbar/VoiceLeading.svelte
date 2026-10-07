<script>
  // The audition voicing switch (decision D4), with a (?) that opens the
  // beginner explainer. "as-song" is off: only the tested chord changes.
  // The explainer opens on its own line under the row (the root is
  // display: contents, so its parts are items of the staff header's row).
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { ui } from "../store/ui.js";

  const copy = explainers.voiceLeading;
  const on = $derived($ui.auditionVoicing === "from-candidate");
  let explainerOpen = $state(false);
</script>

<div class="voice">
  <span class="pair">
    <button
      type="button"
      class="switch"
      role="switch"
      aria-checked={on}
      onclick={() => ui.update({ auditionVoicing: on ? "as-song" : "from-candidate" })}
    >
      <span class="dot" aria-hidden="true"></span>
      Voice leading
    </button>
    <button
      type="button"
      class="help"
      aria-label={copy.title}
      aria-expanded={explainerOpen}
      aria-controls="voice-leading-explainer"
      onclick={() => (explainerOpen = !explainerOpen)}><span aria-hidden="true">?</span></button
    >
  </span>
  {#if explainerOpen}
    <div id="voice-leading-explainer" class="explainer">
      <h3>{copy.title}</h3>
      <p>{copy.body}</p>
      <p>{copy.off}</p>
      <p>{copy.on}</p>
    </div>
  {/if}
</div>

<style>
  .voice {
    display: contents;
  }
  .pair {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
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
  .help {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .help[aria-expanded="true"] {
    border-color: var(--ink);
  }
  .explainer {
    order: 1;
    flex-basis: 100%;
    display: grid;
    gap: var(--space-1);
    max-width: 48rem;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--paper);
    font-size: var(--text-sm);
  }
  h3 {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 500;
  }
  p {
    margin: 0;
  }
</style>
