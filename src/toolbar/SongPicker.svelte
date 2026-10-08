<script>
  /**
   * Choosing a song, or recording one. Two looks: the welcome's big cards
   * while nothing is loaded (`hero`): the demo tunes under "Load a song", and
   * "Record a tune" plus the user's own tunes under "Play a melody". Each demo
   * card draws its opening bars as a gold contour (contour.js): the melody's
   * shape, never its pitches or key, since the user finds home by ear. Once a
   * song is on the staff, a compact control in the masthead: one select,
   * grouped "Demo tunes" and "Your tunes", so any number of tunes fits on one
   * line, and a Record button beside it.
   * @import { Snippet } from "svelte"
   * @import { Song } from "../types.js"
   */
  import { song } from "../store/song.js";
  import { DEMO_TUNES } from "../finding/demoTunes.js";
  import { contour } from "../finding/contour.js";
  import { recorder, shelf } from "../record/tunes.js";

  /**
   * `foot`: the welcome's own words, under the demo cards.
   * @type {{ hero?: boolean, foot?: Snippet }}
   */
  let { hero = false, foot } = $props();

  /** Each demo card's melody shape: its opening bars, in no key (contour.js). */
  const SHAPES = new Map(DEMO_TUNES.map(({ song: t }) => [t.id, contour(t)]));
  /** The contour's backdrop: five faint staff lines. */
  const STAFF = [0, 1, 2, 3, 4].map((i) => 8 + i * 10);

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
          {@const shape = SHAPES.get(tune.id)}
          <li>
            <button type="button" class="tune" onclick={() => choose(tune)}>
              {#if shape}
                <!-- The tune's shape, decorative: the blurb says what it is. -->
                <svg
                  class="contour"
                  viewBox="0 0 {shape.width} {shape.height}"
                  aria-hidden="true"
                  focusable="false"
                >
                  {#each STAFF as y (y)}
                    <line class="staff-line" x1="0" x2={shape.width} y1={y} y2={y} />
                  {/each}
                  <path class="thread" d={shape.path} />
                  {#each shape.dashes as d, i (i)}
                    <line class="note" x1={d.x} x2={d.x + d.w} y1={d.y} y2={d.y} />
                  {/each}
                </svg>
              {/if}
              <span class="title">{tune.title}</span>
              <span class="blurb">{blurb}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
    {@render foot?.()}
    <div class="shelf" id="record-chooser" role="group" aria-labelledby="record-chooser-title">
      <h3 id="record-chooser-title">Play a melody</h3>
      <ul>
        <li>
          <button
            type="button"
            id="record-card"
            class="record-card"
            disabled={busy}
            onclick={() => recorder.record()}
          >
            <span class="rec" aria-hidden="true"><span class="dot"></span></span>
            <span class="words">
              <span class="title">Record a tune</span>
              <span class="blurb">Noodle on your keyboard. Hear Hear writes it down for you.</span>
            </span>
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
      id="record-button"
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
    display: grid;
    gap: var(--space-3);
    min-width: 0;
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
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Recording's cards are wider: two to a row on a laptop, one on a phone. */
  #record-chooser ul {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
  }
  /* Cards are what you do: a violet band, and a violet edge and shadow on
     hover. They don't move: a card that lifts under the pointer is a moving
     target (and made the e2e clicks wait for it to settle). */
  .hero button {
    display: grid;
    align-content: start;
    gap: var(--space-1);
    width: 100%;
    height: 100%;
    padding: var(--space-2) var(--space-3) var(--space-3);
    border: 1px solid var(--rule);
    border-top: var(--band) solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .hero button:hover:not(:disabled),
  .hero button:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 6px 18px -10px var(--accent);
  }
  .hero button:disabled {
    cursor: default;
  }
  .hero .title {
    color: var(--accent);
    font-size: 1.125rem;
    font-weight: 500;
    line-height: 1.25;
  }
  /* The tune's shape: gold, the melody's color, over faint staff lines. */
  .contour {
    display: block;
    width: 100%;
    max-width: 15rem;
    height: auto;
    margin-bottom: var(--space-2);
    overflow: visible;
  }
  .staff-line {
    stroke: var(--rule);
    stroke-width: 1;
  }
  .thread {
    fill: none;
    stroke: var(--melody);
    stroke-width: 1.25;
    stroke-linejoin: round;
    opacity: 0.55;
  }
  .note {
    stroke: var(--melody);
    stroke-width: 6;
    stroke-linecap: round;
  }
  /* Recording: a red dot in a ring, like a recorder's button. */
  .hero .record-card {
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-3);
    border-top: 1px solid var(--rule);
    border-left: var(--band) solid var(--fn-dominant);
  }
  .hero .record-card:hover:not(:disabled),
  .hero .record-card:focus-visible {
    border-left-color: var(--fn-dominant);
  }
  .rec {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border: 2px solid var(--rule);
    border-radius: 50%;
    background: var(--paper);
  }
  .rec .dot {
    width: 1.1rem;
    height: 1.1rem;
  }
  .words {
    display: grid;
    gap: var(--space-1);
  }
  .record-card .title {
    color: var(--ink);
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
