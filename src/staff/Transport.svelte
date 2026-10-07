<script>
  // Play and Stop for the whole song. Playback events light the staff (the
  // playhead), set ui.playheadNoteId, and light the keyboard: chord tones in
  // their function color, the melody note neutral.
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { audioStatus, playPhrase, preload, stop } from "../audio/index.js";
  import { functionOf, numeralOf } from "../theory/index.js";
  import { clearHighlight, highlight } from "./staffEvents.js";

  /** @import { PlaybackEvent } from "../audio/index.js" */
  /** @import { Song } from "../types.js" */

  const PLAYING = "is-playing";

  let playing = $state(false);
  let failed = $state(false);
  const loading = $derived($audioStatus === "loading");
  const samplesFailed = $derived($audioStatus === "failed");

  /**
   * @param {PlaybackEvent} event
   * @param {Song} playedSong the song as it was when Play was pressed
   */
  function show(event, playedSong) {
    if (event.type === "end") return clearPlayhead();
    const lights = ui.get().keyboardLights;
    if (event.type === "note") {
      const note = playedSong.notes.find((n) => n.id === event.noteId);
      if (!note) return;
      clearHighlight(PLAYING);
      highlight([note.id], PLAYING);
      ui.update({ playheadNoteId: note.id, keyboardLights: { ...lights, melody: [note.midi] } });
    } else if (event.type === "chord") {
      const chord = playedSong.chords.find((c) => c.id === event.chordId);
      if (!chord || !event.tones) return;
      // Hidden mode shows no function colors anywhere, the keyboard included.
      const hidden = keyLabelMode(playedSong, ui.get()) === "hidden";
      const fn = hidden
        ? "other"
        : functionOf(numeralOf(chord, playedSong.key), playedSong.key.mode);
      ui.update({ keyboardLights: { ...lights, chord: { midi: event.tones, fn } } });
    }
  }

  function clearPlayhead() {
    clearHighlight(PLAYING);
    ui.update({ playheadNoteId: null, keyboardLights: { chord: null, melody: [] } });
  }

  async function play() {
    const playedSong = song.get();
    const toTick = Math.max(0, ...playedSong.notes.map((n) => n.start + n.dur));
    failed = false;
    playing = true;
    try {
      await playPhrase({ fromTick: 0, toTick }, { onEvent: (event) => show(event, playedSong) });
    } catch (error) {
      console.error("Playback failed", error);
      failed = true;
    } finally {
      playing = false;
      clearPlayhead();
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
