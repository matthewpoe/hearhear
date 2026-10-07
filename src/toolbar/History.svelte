<script>
  // Undo and Redo, plus Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z anywhere outside a
  // text field.
  import { song } from "../store/song.js";
  import { historyShortcut } from "./historyShortcut.js";

  const history = song.history;

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    const action = historyShortcut(event);
    if (!action) return;
    event.preventDefault();
    if (action === "undo") song.undo();
    else song.redo();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="history" role="group" aria-label="History">
  <button
    type="button"
    disabled={!$history.canUndo}
    aria-keyshortcuts="Meta+Z Control+Z"
    onclick={() => song.undo()}>Undo</button
  >
  <button
    type="button"
    disabled={!$history.canRedo}
    aria-keyshortcuts="Shift+Meta+Z Shift+Control+Z"
    onclick={() => song.redo()}>Redo</button
  >
</div>

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
  button:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
</style>
