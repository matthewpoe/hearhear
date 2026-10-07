<script>
  // One big Play/Stop, and beside it a segmented choice of what Play plays:
  // from the top, or this bar, the bar of the note the user last clicked or
  // focused (Play then reads "Play bar 4", the name the tutor's listening
  // steps use; names come from content/controls.json). The visuals (the
  // staff playhead, the keyboard lights) come from playWithVisuals, the one
  // playback driver with visuals (decision D10); this component only starts
  // and stops it.
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, preload, stop } from "../audio/index.js";
  import { onNoteClick } from "./staffEvents.js";
  import { barName, barPlace, songEnd } from "./bars.js";
  import { playWithVisuals } from "./playback.js";
  import Segmented from "../toolbar/Segmented.svelte";
  import Tip from "../toolbar/Tip.svelte";
  import { CONTROLS, withBar } from "../lib/controls.js";
  import explainers from "../../content/explainers.json" with { type: "json" };

  const GLOSS = explainers.options;

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

  /** What Play plays: the whole tune, or the place's bar alone. */
  let scope = $state(/** @type {"whole" | "bar"} */ ("whole"));
  const playsBar = $derived(scope === "bar" && place !== null);
  /** "Play", or "Play bar 4" while this bar is chosen (the name the tutor uses). */
  const playLabel = $derived(playsBar ? withBar(CONTROLS.playBar, where) : CONTROLS.play);
  const scopes = $derived([
    { value: "whole", label: CONTROLS.fromTop, tip: GLOSS.fromTop },
    {
      value: "bar",
      label: CONTROLS.thisBar,
      tip: place ? `${GLOSS.thisBar} Now: ${where}.` : GLOSS.thisBar,
      disabled: place === null,
    },
  ]);

  $effect(() => onNoteClick(({ noteId }) => (lastNoteId = noteId)));

  // Another song (or the same one reopened) starts from the top again.
  $effect(() => {
    void songId;
    lastNoteId = null;
    scope = "whole";
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
  <Tip id="play-tip" text={playing ? "Stops playback." : playsBar ? GLOSS.thisBar : GLOSS.fromTop}>
    <button
      type="button"
      class="control"
      aria-describedby="play-tip"
      onclick={playing ? stop : () => play(playsBar ? place?.bar : undefined)}
      disabled={!playing && (loading || samplesFailed || $song.notes.length === 0)}
    >
      <span class="icon" class:play={!playing} aria-hidden="true"></span>{playing
        ? "Stop"
        : playLabel}
    </button>
  </Tip>
  <Segmented
    name="play-scope"
    legend="What Play plays"
    options={scopes}
    value={playsBar ? "bar" : "whole"}
    onchange={(value) => (scope = value === "bar" ? "bar" : "whole")}
  />

  <p class="status" class:shown={loading || samplesFailed || failed} role="status">
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
    gap: var(--space-2);
  }
  /* Play is the sound control: filled --sound (tokens.css). */
  .control {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-width: 9.5rem;
    padding: var(--space-2) var(--space-4);
    border: 2px solid var(--sound);
    border-radius: var(--radius-lg);
    background: var(--sound);
    color: var(--sound-ink);
    font-weight: 600;
    cursor: pointer;
  }
  .control:disabled {
    border-color: var(--rule);
    background: var(--surface);
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .icon {
    width: 0.75rem;
    height: 0.75rem;
    background: currentColor;
  }
  .play {
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
  .status {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  /* Empty, the live region takes no room in the row. */
  .status:not(.shown) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
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
