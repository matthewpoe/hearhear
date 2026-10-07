<script>
  /**
   * Choosing a song, or recording one. Two looks: the welcome's big cards
   * while nothing is loaded (`hero`): the demo tunes under "Load a song", and
   * "Record a tune" plus the user's own tunes under "Play a melody". Once a
   * song is on the staff, a compact control in the masthead: one select,
   * grouped "Demo tunes" and "Your tunes", so any number of tunes fits on one
   * line, and a Record button beside it.
   * @import { Song } from "../types.js"
   */
  import { song } from "../store/song.js";
  import { DEMO_TUNES } from "../finding/demoTunes.js";
  import { recorder, shelf } from "../record/tunes.js";

  /** @type {{ hero?: boolean }} */
  let { hero = false } = $props();

  const tunes = shelf.list;
  const rec = recorder;
  /** A take running: switching songs waits for Stop. */
  const busy = $derived($rec.status === "armed" || $rec.status === "recording");
  /** The open song, when it is in neither list (an empty or untitled song). */
  const listed = $derived(
    DEMO_TUNES.some(({ song: t }) => t.id === $song.id) || $tunes.some((t) => t.id === $song.id),
  );

  /**
   * Opens a demo through `song.open`: this tab's saved copy (its key guess and
   * chords) if there is one, otherwise a fresh demo via its `fresh` hook.
   * @param {Song} tune
   */
  function choose(tune) {
    // The tune on the staff is already open; a click never wipes its edits.
    if (!hero && tune.id === $song.id) return;
    song.open(tune);
  }

  /** @param {Event} event */
  function onSelect(event) {
    const id = /** @type {HTMLSelectElement} */ (event.currentTarget).value;
    const demo = DEMO_TUNES.find(({ song: t }) => t.id === id);
    if (demo) choose(demo.song);
    else recorder.openTune(id);
  }
</script>

{#if hero}
  <div class="hero">
    <div class="shelf" id="song-chooser" role="group" aria-labelledby="song-chooser-title">
      <h3 id="song-chooser-title">Load a song</h3>
      <ul>
        {#each DEMO_TUNES as { song: tune, blurb } (tune.id)}
          <li>
            <button type="button" onclick={() => choose(tune)}>
              <span class="title">{tune.title}</span>
              <span class="blurb">{blurb}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
    <div class="shelf" id="record-chooser" role="group" aria-labelledby="record-chooser-title">
      <h3 id="record-chooser-title">Play a melody</h3>
      <ul>
        <li>
          <button
            type="button"
            class="record-card"
            disabled={busy}
            onclick={() => recorder.record()}
          >
            <span class="title"><span class="dot" aria-hidden="true"></span>Record a tune</span>
            <span class="blurb">Noodle on your keyboard. Hear Hear writes it down for you.</span>
          </button>
        </li>
        {#each $tunes as tune (tune.id)}
          <li>
            <button type="button" onclick={() => recorder.openTune(tune.id)}>
              <span class="title">{tune.title}</span>
              <span class="blurb">Your tune</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{:else}
  <div class="picker" role="group" aria-labelledby="song-picker-label">
    <label id="song-picker-label" class="label" for="song-select">Song</label>
    <select id="song-select" value={$song.id} onchange={onSelect} disabled={busy}>
      {#if !listed}
        <option value={$song.id} disabled>{$song.title}</option>
      {/if}
      <optgroup label="Demo tunes">
        {#each DEMO_TUNES as { song: tune } (tune.id)}
          <option value={tune.id}>{tune.title}</option>
        {/each}
      </optgroup>
      {#if $tunes.length > 0}
        <optgroup label="Your tunes">
          {#each $tunes as tune (tune.id)}
            <option value={tune.id}>{tune.title}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
    <button
      type="button"
      class="record"
      disabled={busy}
      aria-label="Record a tune"
      onclick={() => recorder.record()}
    >
      <span class="dot" aria-hidden="true"></span>Record
    </button>
  </div>
{/if}

<style>
  .hero {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-4);
  }
  .shelf {
    display: grid;
    gap: var(--space-2);
    align-content: start;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .hero button {
    display: grid;
    gap: var(--space-1);
    width: 16rem;
    max-width: 100%;
    height: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease);
  }
  .hero button:hover {
    border-color: var(--ink);
  }
  .hero button:disabled {
    cursor: default;
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .blurb {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  /* The recording red: see src/record/RecordBar.svelte. */
  .dot {
    display: inline-block;
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--fn-dominant);
  }
  .picker {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
  }
  .label {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  select {
    max-width: min(18rem, 60vw);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--ink-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
  }
  .record {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .record:hover:not(:disabled) {
    border-color: var(--ink);
  }
  select:disabled,
  .record:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
