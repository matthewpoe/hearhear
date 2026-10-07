<script>
  /**
   * Choosing a demo tune. Two looks: the welcome's big cards while nothing is
   * loaded (`hero`), and a small labelled control in the masthead once a song
   * is on the staff, so the chooser never pushes the music down.
   * @import { Song } from "../types.js"
   */
  import { song } from "../store/song.js";
  import { DEMO_TUNES } from "../finding/demoTunes.js";

  /** @type {{ hero?: boolean }} */
  let { hero = false } = $props();

  /**
   * Opens a tune through `song.open`: this tab's saved copy (its key guess and
   * chords) if there is one, otherwise a fresh demo via its `fresh` hook.
   * @param {Song} tune
   */
  function choose(tune) {
    // The tune on the staff is already open; a click never wipes its edits.
    if (!hero && tune.id === $song.id) return;
    song.open(tune);
  }
</script>

{#if hero}
  <div class="hero" id="song-chooser" role="group" aria-labelledby="song-chooser-title">
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
{:else}
  <div class="picker" role="group" aria-labelledby="song-picker-label">
    <span id="song-picker-label" class="label">Song</span>
    {#each DEMO_TUNES as { song: tune } (tune.id)}
      <button type="button" aria-pressed={tune.id === $song.id} onclick={() => choose(tune)}>
        {tune.title}
      </button>
    {/each}
  </div>
{/if}

<style>
  .hero {
    display: grid;
    gap: var(--space-2);
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
  .title {
    font-weight: 500;
  }
  .blurb {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .picker {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }
  .label {
    margin-right: var(--space-1);
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .picker button {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .picker button[aria-pressed="true"] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
    cursor: default;
  }
</style>
