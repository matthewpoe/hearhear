<script>
  // Play and Stop for the whole song. The visuals (the staff playhead, the
  // keyboard lights) come from playWithVisuals, the one playback driver with
  // visuals (decision D10); this component only starts and stops it.
  import { song } from "../store/song.js";
  import { audioStatus, preload, stop } from "../audio/index.js";
  import { playWithVisuals } from "./playback.js";

  let playing = $state(false);
  let failed = $state(false);
  const loading = $derived($audioStatus === "loading");
  const samplesFailed = $derived($audioStatus === "failed");

  async function play() {
    const toTick = Math.max(0, ...song.get().notes.map((n) => n.start + n.dur));
    failed = false;
    playing = true;
    try {
      await playWithVisuals({ fromTick: 0, toTick });
    } catch (error) {
      console.error("Playback failed", error);
      failed = true;
    } finally {
      playing = false;
    }
  }
</script>

<div class="transport" role="group" aria-label="Playback">
  <!-- One button that toggles, so focus stays put when playback starts. -->
  <button
    type="button"
    class="control"
    onclick={playing ? stop : play}
    disabled={!playing && (loading || samplesFailed || $song.notes.length === 0)}
  >
    <span class="icon" class:play={!playing} aria-hidden="true"></span>{playing ? "Stop" : "Play"}
  </button>

  <p class="status" role="status">
    {#if loading}
      Loading the piano…
    {:else if samplesFailed}
      The piano sounds didn't load.
      <button type="button" class="link" onclick={preload}>Retry</button>
    {:else if failed}
      Playback stopped with an error.
      <button type="button" class="link" onclick={play}>Try again</button>
    {/if}
  </p>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .control {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .control:disabled {
    border-color: var(--rule);
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .icon {
    width: 0.7rem;
    height: 0.7rem;
    background: currentColor;
  }
  .play {
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
  .status {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--ink);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
