<script>
  // Undo and Redo, plus Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z anywhere outside a
  // text field. While a take is armed or recording, both step aside, keys
  // too: a take isn't an undo step, and the record bar's Stop is the one
  // control then.
  import { song } from "../store/song.js";
  import { recorder } from "../record/tunes.js";
  import { historyShortcut } from "./historyShortcut.js";
  import explainers from "../../content/explainers.json" with { type: "json" };
  import Tip from "./Tip.svelte";

  const history = song.history;
  const recording = $derived($recorder.status === "armed" || $recorder.status === "recording");

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    const action = historyShortcut(event);
    if (!action) return;
    event.preventDefault();
    if (recording) return;
    if (action === "undo") song.undo();
    else song.redo();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if !recording}
  <div class="history" role="group" aria-label="History">
    <Tip id="undo-tip" text={explainers.options.undo} align="end">
      <button
        type="button"
        disabled={!$history.canUndo}
        aria-keyshortcuts="Meta+Z Control+Z"
        aria-describedby="undo-tip"
        onclick={() => song.undo()}>Undo</button
      >
    </Tip>
    <Tip id="redo-tip" text={explainers.options.redo} align="end">
      <button
        type="button"
        disabled={!$history.canRedo}
        aria-keyshortcuts="Shift+Meta+Z Shift+Control+Z"
        aria-describedby="redo-tip"
        onclick={() => song.redo()}>Redo</button
      >
    </Tip>
  </div>
{/if}

<style>
  .history {
    display: inline-flex;
    gap: var(--space-1);
  }
  button {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--ink-muted);
  }
  /* Disabled reads as disabled: no fill, a dashed outline, and faded (its outline still 3:1). */
  button:disabled {
    border-style: dashed;
    border-color: var(--ink-muted);
    background: transparent;
    color: var(--ink-muted);
    opacity: 0.65;
    cursor: not-allowed;
  }
</style>
