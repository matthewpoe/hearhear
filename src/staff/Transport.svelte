<script>
  // Play and Stop for the whole song, or from the bar of the note the user
  // last clicked or focused ("Play from bar 4", with "Play bar 4" for that bar
  // alone, which the tutor's listening steps point to). The visuals (the
  // staff playhead, the keyboard lights) come from playWithVisuals, the one
  // playback driver with visuals (decision D10); this component only starts
  // and stops it.
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, preload, stop } from "../audio/index.js";
  import { onNoteClick } from "./staffEvents.js";
  import { barName, barPlace, songEnd } from "./bars.js";
  import { playWithVisuals } from "./playback.js";

  /** @typedef {import("../audio/index.js").TickRange} TickRange */

  let playing = $state(false);
  let failed = $state(false);
  /** The note last clicked or focused on the staff, which outlasts the dropdown's selection. */
  let lastNoteId = $state(/** @type {string | null} */ (null));
  /** What the last press played, for "Try again". */
  let lastRange = /** @type {TickRange | null} */ (null);
  /** Bumped by every press, so an earlier playback ending leaves `playing` alone. */
  let presses = 0;
  const loading = $derived($audioStatus === "loading");
  const samplesFailed = $derived($audioStatus === "failed");
  // With no place (or its note deleted), Play plays it all.
  const place = $derived(barPlace($song, $ui.selectedNoteId ?? lastNoteId));
  const where = $derived(place ? barName(place.number) : "");
  const songId = $derived($song.id);

  $effect(() => onNoteClick(({ noteId }) => (lastNoteId = noteId)));

  // Another song (or the same one reopened) starts from the top again.
  $effect(() => {
    void songId;
    lastNoteId = null;
  });

  // Arrowing along the staff's notes moves the place too.
  $effect(() => {
    /** @param {FocusEvent} event */
    const onFocus = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const noteId = target?.closest("#staff [data-note-id]")?.getAttribute("data-note-id");
      if (noteId) lastNoteId = noteId;
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  });

  /** @param {TickRange | null} [range] the whole song when omitted */
  async function play(range) {
    const mine = ++presses;
    lastRange = range ?? null;
    failed = false;
    playing = true;
    try {
      await playWithVisuals(range ?? { fromTick: 0, toTick: songEnd(song.get()) });
    } catch (error) {
      console.error("Playback failed", error);
      if (mine === presses) failed = true;
    } finally {
      if (mine === presses) playing = false;
    }
  }
</script>

<div class="transport" role="group" aria-label="Playback">
  <!-- One button that toggles, so focus stays put when playback starts. -->
  <button
    type="button"
    class="control"
    onclick={playing ? stop : () => play(place?.fromBar)}
    disabled={!playing && (loading || samplesFailed || $song.notes.length === 0)}
  >
    <span class="icon" class:play={!playing} aria-hidden="true"></span>{playing
      ? "Stop"
      : place
        ? `Play from ${where}`
        : "Play"}
  </button>
  {#if place}
    <button
      type="button"
      class="small"
      onclick={() => play(place.bar)}
      disabled={loading || samplesFailed}
    >
      Play {where}
    </button>
    <button type="button" class="small" onclick={() => play()} disabled={loading || samplesFailed}>
      Play from the top
    </button>
  {/if}

  <p class="status" role="status">
    {#if loading}
      Loading the piano…
    {:else if samplesFailed}
      The piano sounds didn't load.
      <button type="button" class="link" onclick={preload}>Retry</button>
    {:else if failed}
      Playback stopped with an error.
      <button type="button" class="link" onclick={() => play(lastRange)}>Try again</button>
    {/if}
  </p>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
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
  .small {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .control:disabled,
  .small:disabled {
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
