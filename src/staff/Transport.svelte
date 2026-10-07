<script>
  // One big Play/Pause/Resume and a small Stop, and beside them a segmented
  // choice of what Play plays:
  // from the top, or this bar, the bar of the note the user last clicked or
  // focused (Play then reads "Play bar 4", the name the tutor's listening
  // steps use; names come from content/controls.json). The visuals (the
  // staff playhead, the keyboard lights) come from playWithVisuals, the one
  // playback driver with visuals (decision D10); this component only starts
  // and stops it. It also owns the app-wide keys (transportKeys.js): Space
  // plays from the top, pauses, and resumes; Left while playing goes back to
  // the bar's start, and a quick second Left to the top.
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, preload, stop } from "../audio/index.js";
  import { clearHighlight, highlight, onNoteClick } from "./staffEvents.js";
  import { barName, barPlace, barRange, songEnd } from "./bars.js";
  import { focusKind, transportAction } from "./transportKeys.js";
  import { fieldOwnsKey } from "../lib/fieldOwnsKey.js";
  import { recorder } from "../record/tunes.js";
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
  /** What is playing now, for pause and the Left-arrow jumps. */
  let current = /** @type {TickRange | null} */ (null);
  /** Where Space paused, to resume from there; the paused note stays lit. */
  let paused = $state(/** @type {{ range: TickRange, noteId: string | null } | null} */ (null));
  /** When Left was last pressed during playback, for the double press. */
  let lastLeftMs = -Infinity;
  /** A Space the transport took on keydown: its keyup is taken too. */
  let spaceTaken = false;
  /** The last input was a key (not a pointer), and so moved the focus that followed. */
  let lastInputKeyboard = false;
  /** The keyboard moved focus to where it is now (Tab, arrows, or a key's action). */
  let focusByKeyboard = false;
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
    paused = null;
  });

  // With no place left (its note deleted, the song switched), "This bar" has
  // nothing to point at: back to the top, so a later note click never turns
  // Play into "Play bar N" unasked.
  $effect(() => {
    if (place === null) scope = "whole";
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
    paused = null;
    current = range ?? { fromTick: 0, toTick: songEnd(song.get()) };
    try {
      await playWithVisuals(current);
    } catch (error) {
      console.error("Playback failed", error);
      if (mine === presses) failed = true;
    } finally {
      if (mine === presses) {
        playing = false;
        // Paused: the playhead holds on the note it stopped at.
        if (paused?.noteId) {
          highlight([paused.noteId], "is-playing");
          ui.update({ playheadNoteId: paused.noteId });
        }
      }
    }
  }

  /** Pause: stop, remembering the note under the playhead. */
  function pause() {
    const noteId = ui.get().playheadNoteId;
    const note = song.get().notes.find((n) => n.id === noteId);
    const range = current ?? { fromTick: 0, toTick: songEnd(song.get()) };
    paused = { range: { fromTick: note?.start ?? range.fromTick, toTick: range.toTick }, noteId };
    stop();
  }

  /** Resume from the paused note. */
  function resume() {
    const from = paused?.range;
    clearHighlight("is-playing");
    play(from);
  }

  /** Back to the start of the bar under the playhead, playing on to the same end. */
  function barStart() {
    const now = song.get();
    const note = now.notes.find((n) => n.id === ui.get().playheadNoteId);
    const range = current ?? { fromTick: 0, toTick: songEnd(now) };
    const fromTick = note ? barRange(now, note).range.fromTick : range.fromTick;
    play({ fromTick, toTick: range.toTick });
  }

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    lastInputKeyboard = true;
    if (event.defaultPrevented || song.get().notes.length === 0) return;
    if (event.code === "Space" && (loading || samplesFailed)) return;
    const target = event.target instanceof Element ? event.target : null;
    const now = performance.now();
    const status = $recorder.status;
    const action = transportAction({
      code: event.code,
      modified: event.metaKey || event.ctrlKey || event.altKey || event.shiftKey,
      fieldOwnsKey: fieldOwnsKey(target, event.code),
      focus: focusKind(target, focusByKeyboard),
      menuOpen:
        ui.get().selectedNoteId !== null || document.querySelector('[role="menu"]') !== null,
      recording: status === "armed" || status === "recording",
      playing,
      paused: paused !== null,
      sinceLastLeftMs: now - lastLeftMs,
    });
    if (!action) return;
    if (event.code === "ArrowLeft") lastLeftMs = now;
    // Taken: the focused button, piano key, or page scroll doesn't get it too.
    event.preventDefault();
    event.stopPropagation();
    if (event.code === "Space") spaceTaken = true;
    if (event.repeat) return;
    if (action === "play-top") play();
    else if (action === "pause") pause();
    else if (action === "resume") resume();
    else if (action === "bar-start") barStart();
    else play({ fromTick: 0, toTick: current?.toTick ?? songEnd(song.get()) });
  }

  /** @param {KeyboardEvent} event */
  function onKeyup(event) {
    if (event.code !== "Space" || !spaceTaken) return;
    spaceTaken = false;
    // A button activates on Space's keyup; this Space was the transport's.
    event.preventDefault();
    event.stopPropagation();
  }

  /** @param {PointerEvent} event */
  const onPointerDown = (event) => {
    lastInputKeyboard = false;
    // A click on the control that already has focus fires no focusin, so
    // clear its keyboard flag here (say, More refocused by Escape, then clicked).
    const active = document.activeElement;
    if (active && event.target instanceof Node && active.contains(event.target)) {
      focusByKeyboard = false;
    }
  };

  /** Stop: end playback, or a pause, and go back to the top. */
  function stopAll() {
    const wasPaused = paused !== null;
    paused = null;
    if (wasPaused) {
      clearHighlight("is-playing");
      ui.update({ playheadNoteId: null });
    }
    if (playing) stop();
  }

  /** The big button: Play (or "Play bar 4"), Pause while playing, Resume while paused. */
  const mainLabel = $derived(playing ? "Pause" : paused ? "Resume" : playLabel);
  const mainTip = $derived(
    playing ? GLOSS.pause : paused ? GLOSS.resume : playsBar ? GLOSS.thisBar : GLOSS.fromTop,
  );
  const onFocusIn = () => (focusByKeyboard = lastInputKeyboard);

  $effect(() => {
    // Capture, so the transport decides before a focused control's own keys.
    window.addEventListener("keydown", onKeydown, { capture: true });
    window.addEventListener("keyup", onKeyup, { capture: true });
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("focusin", onFocusIn, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeydown, { capture: true });
      window.removeEventListener("keyup", onKeyup, { capture: true });
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("focusin", onFocusIn, { capture: true });
    };
  });
</script>

<div class="transport" role="group" aria-label="Playback">
  <!-- One button that toggles, so focus stays put when playback starts. It
       does what Space does: play, pause, resume. Stop sits beside it. -->
  <Tip id="play-tip" text={`${mainTip} ${GLOSS.playKeys}`}>
    <button
      type="button"
      class="control"
      aria-describedby="play-tip"
      onclick={playing ? pause : paused ? resume : () => play(playsBar ? place?.bar : undefined)}
      disabled={!playing && (loading || samplesFailed || $song.notes.length === 0)}
    >
      <span class="icon" class:play={!playing} class:pause={playing} aria-hidden="true"
      ></span>{mainLabel}
    </button>
  </Tip>
  <Tip id="stop-tip" text={GLOSS.stop}>
    <button
      type="button"
      class="stop"
      aria-label="Stop"
      aria-describedby="stop-tip"
      disabled={!playing && !paused}
      onclick={stopAll}
    >
      <span class="square" aria-hidden="true"></span>
    </button>
  </Tip>
  <Segmented
    name="play-scope"
    legend="What Play plays"
    options={scopes}
    value={playsBar ? "bar" : "whole"}
    onchange={(value) => (scope = value === "bar" ? "bar" : "whole")}
  />

  <!-- "Paused." is announced; on screen the button reads Resume. -->
  <p class="status" class:shown={loading || samplesFailed || failed} role="status">
    {#if paused}
      Paused.
    {:else if loading}
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
  /* On phones the scope toggle may take the next line. */
  @media (max-width: 60rem) {
    .transport {
      flex-wrap: wrap;
    }
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
  .pause {
    background: none;
    border-inline: 0.25rem solid currentColor;
  }
  .stop {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .stop:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .square {
    width: 0.7rem;
    height: 0.7rem;
    background: currentColor;
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
