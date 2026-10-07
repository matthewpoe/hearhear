<script>
  /**
   * "Play it in another key": transpose (new sound, same numbers), inside the
   * key question once a home is chosen, so all key handling sits in one box.
   * Re-keying (same sound, new numbers) is the box's "Choose a different
   * home"; the two are worded apart so they never blur. Keeps the id
   * "toolbar", which the transpose tip anchors to.
   */
  import { song } from "../store/song.js";
  import { KEY_CHOICES, melodyFits, preferFor, semitonesTo } from "../toolbar/keys.js";
  import { displayNote, spokenNote } from "../theory/noteDisplay.js";

  /** @param {string} tonic */
  function playIn(tonic) {
    const now = song.get();
    const semitones = semitonesTo(now, tonic);
    if (semitones !== 0) song.transpose(semitones, { prefer: preferFor(tonic) });
    // Same pitch, other spelling (F# to Gb): nothing sounds different, so
    // re-spelling the key keeps every number and note where it was.
    else if (tonic !== now.key.tonic) song.rekey({ ...now.key, tonic });
  }
</script>

<details id="toolbar" class="transpose">
  <summary>Play it in another key</summary>
  <div
    class="body"
    role="group"
    aria-label="Play it in another key"
    aria-describedby="transpose-hint"
  >
    <p id="transpose-hint" class="hint">
      The whole tune moves higher or lower, so it sounds different. Home moves with it, so every
      number stays the same.
    </p>
    <div class="keys" role="group" aria-label="{$song.key.mode} keys">
      {#each KEY_CHOICES[$song.key.mode] as tonic (tonic)}
        <button
          type="button"
          class="key"
          aria-pressed={tonic === $song.key.tonic}
          aria-label="Play in {spokenNote(tonic)} {$song.key.mode}"
          onclick={() => playIn(tonic)}>{displayNote(tonic)}</button
        >
      {/each}
    </div>
    <div class="keys" role="group" aria-label="Octave">
      <button type="button" disabled={!melodyFits($song, -12)} onclick={() => song.transpose(-12)}
        >Octave down</button
      >
      <button type="button" disabled={!melodyFits($song, 12)} onclick={() => song.transpose(12)}
        >Octave up</button
      >
    </div>
  </div>
</details>

<style>
  .transpose {
    justify-self: stretch;
    padding-top: var(--space-2);
    border-top: 1px solid var(--rule);
  }
  summary {
    font-weight: 500;
    cursor: pointer;
  }
  .body {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .hint {
    max-width: 34rem;
    margin: 0;
    color: var(--ink-muted);
  }
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  button {
    min-width: 2.75rem;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--ink-muted);
  }
  button:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .key[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
</style>
