<script>
  /**
   * The song toolbar: undo and redo, chord label style, transpose (new sound,
   * same numbers), and re-key (same sound, new numbers). Transpose and re-key
   * sit in separate, differently worded groups so the two never blur.
   */
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { KEY_CHOICES, melodyFits, preferFor, semitonesTo } from "./keys.js";
  import { historyShortcut } from "./historyShortcut.js";

  /** @type {{ value: import("../types.js").LabelStyle, label: string, example: string }[]} */
  const LABEL_STYLES = [
    { value: "roman", label: "Roman", example: "I IV V" },
    { value: "nashville", label: "Nashville", example: "1 4 5" },
    { value: "letters", label: "Letters", example: "C F G" },
    { value: "roman+letters", label: "Roman + letters", example: "I (C)" },
  ];
  const MODES = /** @type {const} */ (["major", "minor"]);

  const history = song.history;
  const mode = $derived(keyLabelMode($song, $ui));
  const hidden = $derived(mode === "hidden");
  const current = $derived(`${$song.key.tonic} ${$song.key.mode}`);

  // The picker follows the song's key until the user picks another home.
  let home = $derived(current);
  const homeUnchanged = $derived(home === current && !$song.key.provisional);

  /** @param {string} tonic */
  function playIn(tonic) {
    const now = song.get();
    const semitones = semitonesTo(now, tonic);
    if (semitones !== 0) song.transpose(semitones, { prefer: preferFor(tonic) });
    // Same pitch, other spelling (F# to Gb): nothing sounds different, so
    // re-spelling the key keeps every number and note where it was.
    else if (tonic !== now.key.tonic) song.rekey({ ...now.key, tonic });
  }

  function setHome() {
    const [tonic, homeMode] = home.split(" ");
    song.rekey({
      tonic,
      mode: /** @type {"major" | "minor"} */ (homeMode),
      provisional: false,
    });
  }

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

<section id="toolbar" class="toolbar" aria-label="Song tools">
  <div class="group" role="group" aria-label="History">
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

  <fieldset class="group">
    <legend>Chord labels</legend>
    <div class="choices">
      {#each LABEL_STYLES as style (style.value)}
        <label class="choice">
          <input
            type="radio"
            name="label-style"
            value={style.value}
            checked={$ui.labelStyle === style.value}
            onchange={() => ui.update({ labelStyle: style.value })}
          />
          {style.label}
          <span class="example" aria-hidden="true">{style.example}</span>
        </label>
      {/each}
    </div>
    <label class="choice">
      <input
        type="checkbox"
        checked={$ui.showDegrees}
        onchange={(e) => ui.update({ showDegrees: e.currentTarget.checked })}
      />
      Scale-degree numbers under the melody
    </label>
  </fieldset>

  <fieldset class="group" aria-describedby="transpose-hint">
    <legend>Play it in another key</legend>
    <p id="transpose-hint" class="hint">
      The whole tune moves higher or lower. Every number stays the same.
    </p>
    {#if hidden}
      <p class="hint reason">Opens once you've guessed where home is.</p>
    {:else}
      <p class="now" class:tentative={mode === "tentative"}>
        Now in {current}{mode === "tentative" ? " (a first guess)" : ""}
      </p>
    {/if}
    <div class="keys" role="group" aria-label="{$song.key.mode} keys">
      {#each KEY_CHOICES[$song.key.mode] as tonic (tonic)}
        <button
          type="button"
          class="key"
          disabled={hidden}
          aria-pressed={!hidden && tonic === $song.key.tonic}
          aria-label="Play in {tonic} {$song.key.mode}"
          onclick={() => playIn(tonic)}>{tonic}</button
        >
      {/each}
    </div>
    <div class="octaves" role="group" aria-label="Octave">
      <button type="button" disabled={!melodyFits($song, -12)} onclick={() => song.transpose(-12)}
        >Octave down</button
      >
      <button type="button" disabled={!melodyFits($song, 12)} onclick={() => song.transpose(12)}
        >Octave up</button
      >
    </div>
  </fieldset>

  <fieldset class="group rekey" aria-describedby="rekey-hint">
    <legend>Home is actually…</legend>
    <p id="rekey-hint" class="hint">
      The notes stay exactly as you hear them. Only home moves, so the numbers and colors change.
    </p>
    {#if hidden}
      <p class="hint reason">Make your first guess in the key question; this opens after.</p>
    {/if}
    <div class="row">
      <label class="visually-hidden" for="rekey-home">New home key</label>
      <select id="rekey-home" bind:value={home} disabled={hidden}>
        {#each MODES as m (m)}
          <optgroup label={m === "major" ? "Major" : "Minor"}>
            {#each KEY_CHOICES[m] as tonic (tonic)}
              <option value="{tonic} {m}">{tonic} {m}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
      <button type="button" disabled={hidden || homeUnchanged} onclick={setHome}>Set home</button>
    </div>
  </fieldset>
</section>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
  }
  div.group {
    flex-direction: row;
    border: none;
  }
  .rekey {
    border-style: dashed;
  }
  legend {
    padding: 0 var(--space-1);
    font-weight: 600;
  }
  .hint {
    max-width: 22rem;
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .reason {
    font-style: italic;
  }
  .now {
    margin: 0;
    font-size: var(--text-sm);
  }
  .now.tentative {
    opacity: var(--tentative-opacity);
  }
  .choices,
  .keys,
  .octaves,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .choice {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    cursor: pointer;
  }
  .example {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  button,
  select {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }
  button:hover:not(:disabled) {
    border-color: var(--ink-muted);
  }
  button:disabled,
  select:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .key {
    min-width: 2.75rem;
  }
  .key[aria-pressed="true"] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }
  @media (prefers-reduced-motion: reduce) {
    button,
    select {
      transition: none;
    }
  }
</style>
