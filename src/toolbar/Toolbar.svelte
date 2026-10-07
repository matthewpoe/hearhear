<script>
  /**
   * Transpose (new sound, same numbers) and re-key (same sound, new numbers),
   * collapsed under "Change key or transpose" so the staff stays on top.
   * The two sit in separate, differently worded groups so they never blur.
   * Undo, redo, and chord labels live in the staff header.
   */
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { KEY_CHOICES, melodyFits, preferFor, semitonesTo } from "./keys.js";
  import { displayNote, spokenNote } from "../theory/noteDisplay.js";

  const MODES = /** @type {const} */ (["major", "minor"]);

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
</script>

<section id="toolbar" class="toolbar" aria-label="Song tools">
  <details>
    <summary>Change key or transpose</summary>
    <div class="groups">
      <fieldset class="group" aria-describedby="transpose-hint">
        <legend>Play it in another key</legend>
        <p id="transpose-hint" class="hint">
          The whole tune moves higher or lower. Every number stays the same.
        </p>
        {#if hidden}
          <p class="hint reason">Opens once you've guessed where home is.</p>
        {:else}
          <p class="now" class:tentative={mode === "tentative"}>
            Now in {displayNote(current)}{mode === "tentative" ? " (a first guess)" : ""}
          </p>
        {/if}
        <div class="keys" role="group" aria-label="{$song.key.mode} keys">
          {#each KEY_CHOICES[$song.key.mode] as tonic (tonic)}
            <button
              type="button"
              class="key"
              disabled={hidden}
              aria-pressed={!hidden && tonic === $song.key.tonic}
              aria-label="Play in {spokenNote(tonic)} {$song.key.mode}"
              onclick={() => playIn(tonic)}>{displayNote(tonic)}</button
            >
          {/each}
        </div>
        <div class="octaves" role="group" aria-label="Octave">
          <button
            type="button"
            disabled={!melodyFits($song, -12)}
            onclick={() => song.transpose(-12)}>Octave down</button
          >
          <button type="button" disabled={!melodyFits($song, 12)} onclick={() => song.transpose(12)}
            >Octave up</button
          >
        </div>
      </fieldset>

      <fieldset class="group rekey" aria-describedby="rekey-hint">
        <legend>Home is actually…</legend>
        <p id="rekey-hint" class="hint">
          The notes stay exactly as you hear them. Only home moves, so the numbers and colors
          change.
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
                  <option value="{tonic} {m}">{displayNote(tonic)} {m}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
          <button type="button" disabled={hidden || homeUnchanged} onclick={setHome}
            >Set home</button
          >
        </div>
      </fieldset>
    </div>
  </details>
</section>

<style>
  /* Closed, it's one item in the staff header's row; open, it takes a line. */
  .toolbar:has(details[open]) {
    flex-basis: 100%;
  }
  summary {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  details[open] summary {
    display: inline-block;
    margin-bottom: var(--space-2);
  }
  .groups {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-3);
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
  .keys,
  .octaves,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
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
