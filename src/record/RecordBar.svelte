<script>
  /**
   * Record mode's bar, over the staff: the recording state while a take
   * runs (a red dot, the elapsed time, the note count, and Stop), the title
   * field after it, and for one of the user's own tunes its title (click to
   * rename) and what comes next: Record next phrase, Redo that phrase (the
   * latest phrase, ringed on the staff), Hear that phrase, Start over, and
   * Discard. After a Discard it holds the Undo offer, over whatever opened in
   * the tune's place. Escape stops a take; it is free while recording, since
   * the menus it closes elsewhere are shut.
   */
  import { tick } from "svelte";
  import { get } from "svelte/store";
  import { flatArmed } from "../input/NumberRow.js";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { clearHighlight, highlight } from "../staff/staffEvents.js";
  import { playWithVisuals } from "../staff/playback.js";
  import { songEnd } from "../staff/bars.js";
  import { recorder, shelf } from "./tunes.js";
  import { MAX_TAKE_NOTES, isUserTune } from "./take.js";

  const rec = recorder;
  const status = $derived($rec.status);
  const live = $derived(status === "armed" || status === "recording");
  const tunes = shelf.list;
  const mine = $derived(isUserTune($song.id) && $tunes.some((t) => t.id === $song.id));
  const shown = $derived(status !== "idle" || mine || $rec.discarded !== null);

  /** @type {HTMLButtonElement | undefined} */
  let stopButton = $state();
  /** @type {HTMLInputElement | undefined} */
  let titleField = $state();
  /** @type {HTMLButtonElement | undefined} */
  let titleButton = $state();
  /** @type {HTMLButtonElement | undefined} */
  let undoButton = $state();
  /** @type {HTMLButtonElement | undefined} */
  let nextButton = $state();

  /** The staff class on the latest phrase's notes, so Redo that phrase says what it redoes. */
  const LATEST = "latest-phrase";
  // Read again after every take (the bar's state changes) and song change.
  const phrases = $derived.by(() => {
    void $rec;
    return mine ? recorder.phrases($song) : [];
  });
  const latest = $derived(phrases.at(-1) ?? null);
  const roomLeft = $derived($song.notes.length < MAX_TAKE_NOTES);
  const canNext = $derived(phrases.length > 0 && roomLeft);
  let draft = $state("");
  let clock = $state(0);

  // The elapsed time ticks only while a take runs.
  $effect(() => {
    if (status !== "recording") return;
    clock = performance.now();
    const timer = setInterval(() => (clock = performance.now()), 250);
    return () => clearInterval(timer);
  });

  const elapsed = $derived.by(() => {
    if (status !== "recording") return "0:00";
    const seconds = Math.max(0, Math.floor((clock - $rec.startedAtMs) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  });

  // Focus follows the flow: Stop once armed, the title field after a take.
  $effect(() => {
    if (status === "armed") tick().then(() => stopButton?.focus({ preventScroll: true }));
    if (status === "naming") {
      draft = song.get().title;
      tick().then(() => {
        titleField?.focus({ preventScroll: true });
        titleField?.select();
      });
    }
  });

  $effect(() => {
    if ($rec.discarded !== null) tick().then(() => undoButton?.focus({ preventScroll: true }));
  });

  // After a phrase, Record next phrase takes focus: Escape, then Enter, records on.
  $effect(() => {
    if ($rec.added > 0) tick().then(() => nextButton?.focus({ preventScroll: true }));
  });

  // The latest phrase is ringed while there is more than one (one phrase is
  // the whole tune). Put back a frame after any song or view change, since
  // the staff redraws and drops its note classes.
  $effect(() => {
    void $ui;
    const ids = !live && phrases.length > 1 && latest ? latest.ids : [];
    if (ids.length === 0) return;
    const frame = requestAnimationFrame(() => {
      clearHighlight(LATEST);
      highlight(ids, LATEST);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearHighlight(LATEST);
    };
  });

  /** What the status line announces: changes of state only, never every note. */
  const announcement = $derived.by(() => {
    if (status === "armed" && $rec.phrase) {
      return "Ready to record a phrase. Your first note starts it.";
    }
    if (status === "armed") return "Ready to record. Your first note starts the take.";
    if (status === "recording") return "Recording.";
    if (status === "naming" && $rec.afterTake) {
      const count = $song.notes.length;
      const full = $rec.capped ? ` That's ${MAX_TAKE_NOTES} notes, the most a tune holds.` : "";
      return `Recorded ${count} ${count === 1 ? "note" : "notes"}.${full} Name your tune.`;
    }
    if ($rec.discarded !== null) return `Discarded ${$rec.discarded}.`;
    if ($rec.added > 0) {
      const count = $song.notes.length;
      return `Added ${$rec.added} ${$rec.added === 1 ? "note" : "notes"}; the tune has ${count}.`;
    }
    return "";
  });

  /**
   * Stop the take. Cancelled before its first note, focus goes back to the
   * Record control that armed it (the masthead's, or the welcome card).
   */
  async function stopTake() {
    const cancelled = recorder.get().status === "armed";
    recorder.stop();
    if (!cancelled) return;
    await tick();
    const back = document.getElementById("record-button") ?? document.getElementById("record-card");
    back?.focus({ preventScroll: true });
  }

  /**
   * Escape stops a take, ahead of every other Escape (it runs in the capture
   * phase and marks the event handled, so an open tip stays open). One
   * Escape does one thing: with a flat armed, it disarms the flat instead.
   * @param {KeyboardEvent} event
   */
  function onWindowKeydown(event) {
    if (event.key !== "Escape" || event.defaultPrevented || !live || get(flatArmed)) return;
    event.preventDefault();
    stopTake();
  }

  /** @param {SubmitEvent} event */
  async function submitName(event) {
    event.preventDefault();
    recorder.name(draft);
    await tick();
    titleButton?.focus({ preventScroll: true });
  }

  async function blurName() {
    // Clicking or tabbing away keeps what was typed, like pressing Save.
    if (recorder.get().status !== "naming") return;
    recorder.name(draft);
    await tick();
    // Tabbing to Save lands nowhere once the field closes: keep focus on the title.
    if (!document.activeElement || document.activeElement === document.body) {
      titleButton?.focus({ preventScroll: true });
    }
  }

  /** @param {KeyboardEvent} event */
  async function onTitleKeydown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    recorder.keepName();
    await tick();
    titleButton?.focus({ preventScroll: true });
  }

  /**
   * The bar's actions after a take. From the title field, the name typed so
   * far is kept first.
   * @param {() => void} act
   */
  function then(act) {
    if (recorder.get().status === "naming") recorder.name(draft);
    act();
  }

  const nextPhrase = () => then(() => recorder.record({ phrase: "next" }));
  const redoPhrase = () => then(() => recorder.record({ phrase: "redo" }));
  const startOver = () => then(() => recorder.record({ again: true }));
  const discard = () => then(() => recorder.discard());

  /** Play the latest phrase alone, with the playhead. */
  function hearPhrase() {
    if (!latest) return;
    playWithVisuals({ fromTick: latest.start, toTick: songEnd(song.get()) }).catch((error) =>
      console.error("Playback failed", error),
    );
  }
</script>

<svelte:window onkeydowncapture={onWindowKeydown} />

{#if shown}
  <section id="record-bar" class="record-bar" class:live aria-label="Your tune">
    {#if live}
      <div class="rec">
        <span class="dot" class:on={status === "recording"} aria-hidden="true"></span>
        <strong>{status === "recording" ? "Recording" : "Ready to record"}</strong>
        {#if $rec.phrase}<span class="hint">a phrase</span>{/if}
      </div>
      {#if status === "armed"}
        <p class="hint">
          Your first note starts the clock. Play on the number row or the piano below.
        </p>
      {:else}
        <p class="meter">
          <span class="time" aria-label="Elapsed {elapsed}">{elapsed}</span>
          <span class="count">{$rec.notes} {$rec.notes === 1 ? "note" : "notes"}</span>
        </p>
      {/if}
      <button
        type="button"
        class="stop"
        bind:this={stopButton}
        onclick={stopTake}
        aria-keyshortcuts="Escape"
      >
        <span class="square" aria-hidden="true"></span>
        {status === "armed" ? "Cancel" : "Stop"}
        <kbd aria-hidden="true">Esc</kbd>
      </button>
    {:else if status === "naming"}
      <form class="naming" onsubmit={submitName}>
        <label for="tune-title">Name your tune</label>
        <input
          id="tune-title"
          type="text"
          maxlength="120"
          autocomplete="off"
          spellcheck="false"
          bind:this={titleField}
          bind:value={draft}
          onblur={blurName}
          onkeydown={onTitleKeydown}
        />
        <button type="submit" class="primary">Save name</button>
      </form>
      {#if $rec.afterTake}
        <p class="summary">
          {#if $rec.capped}
            <strong
              >That's {MAX_TAKE_NOTES} notes, the most a tune holds, so recording stopped.</strong
            >
          {/if}
          {$song.notes.length}
          {$song.notes.length === 1 ? "note" : "notes"} at {$song.tempo} BPM in 4/4. Next, find where
          home is.
        </p>
      {/if}
      {@render actions()}
    {:else if mine}
      <button
        type="button"
        class="title"
        bind:this={titleButton}
        onclick={() => recorder.rename()}
        aria-label="Rename {$song.title}"
        title="Rename"
      >
        <span class="name">{$song.title}</span>
        <svg class="pencil" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M11.5 2.5l2 2L6 12H4v-2z" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
      <p class="kind">
        Your tune · {$song.notes.length}
        {$song.notes.length === 1 ? "note" : "notes"}{#if phrases.length > 1}
          · {phrases.length} phrases{/if}{#if $rec.added > 0}
          · added {$rec.added}{/if}
      </p>
      {@render actions()}
    {:else if $rec.discarded !== null}
      <p class="discarded notice">
        Discarded “{$rec.discarded}”. Undo brings it back, every phrase included.
      </p>
      <div class="actions">
        <button
          type="button"
          class="primary"
          bind:this={undoButton}
          onclick={() => recorder.undoDiscard()}
        >
          Undo
        </button>
        <button type="button" onclick={() => recorder.dismiss()} aria-label="Dismiss">×</button>
      </div>
    {/if}
  </section>
{/if}

<!-- What comes after a take, most used first. A mouse press keeps focus in the
     title field, so its blur doesn't close the field under the click. -->
{#snippet actions()}
  <div class="actions">
    {#if canNext}
      <button
        type="button"
        class="primary"
        bind:this={nextButton}
        onmousedown={(e) => e.preventDefault()}
        onclick={nextPhrase}
      >
        <span class="dot small" aria-hidden="true"></span>Record next phrase
      </button>
    {/if}
    {#if phrases.length > 0}
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={redoPhrase}
        title={phrases.length > 1
          ? "Record the ringed phrase again; the rest stays"
          : "Record the tune again"}
      >
        Redo that phrase
      </button>
    {/if}
    {#if phrases.length > 1}
      <button type="button" onmousedown={(e) => e.preventDefault()} onclick={hearPhrase}>
        Hear that phrase
      </button>
    {/if}
    <button type="button" class="quiet" onmousedown={(e) => e.preventDefault()} onclick={startOver}>
      Start over
    </button>
    <button type="button" class="quiet" onmousedown={(e) => e.preventDefault()} onclick={discard}>
      Discard tune
    </button>
  </div>
{/snippet}
<p class="visually-hidden" role="status">{announcement}</p>

<style>
  .record-bar {
    /* The recording red: the dominant's red, the one red the tokens define,
       always with the dot's shape and the word "Recording" beside it. */
    --rec: var(--fn-dominant);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .record-bar.live {
    border-color: var(--rec);
    box-shadow: inset 4px 0 0 var(--rec);
  }
  p {
    margin: 0;
  }
  .rec {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .rec strong {
    color: var(--rec);
    font-weight: 500;
  }
  .dot {
    display: inline-block;
    flex: none;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--rec);
    border-radius: 50%;
  }
  .dot.on,
  .dot.small {
    background: var(--rec);
  }
  .dot.small {
    width: 0.625rem;
    height: 0.625rem;
    margin-right: var(--space-1);
    border-width: 0;
  }
  .dot.on {
    animation: pulse 1.2s var(--ease) infinite alternate;
  }
  @keyframes pulse {
    to {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot.on {
      animation: none;
    }
  }
  .hint,
  .summary,
  .kind {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .meter {
    display: inline-flex;
    gap: var(--space-3);
    font-variant-numeric: tabular-nums;
  }
  .time {
    font-weight: 500;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  button:hover {
    border-color: var(--ink);
  }
  .stop {
    margin-left: auto;
    border-color: var(--ink);
    font-weight: 500;
  }
  .square {
    width: 0.625rem;
    height: 0.625rem;
    background: currentColor;
  }
  kbd {
    padding: 0 var(--space-1);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
    font: inherit;
    font-size: 0.75rem;
  }
  .naming {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .naming label {
    font-weight: 500;
  }
  input {
    width: 16rem;
    max-width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--ink-muted);
    border-radius: var(--radius-sm);
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }
  .primary {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }
  .primary .dot.small {
    box-shadow: 0 0 0 1px var(--paper);
  }
  /* Start over and Discard: there, but quieter than building the tune. */
  .quiet {
    border-color: transparent;
    color: var(--ink-muted);
  }
  .discarded.notice {
    font-weight: 500;
  }
  /* The latest phrase on the staff: a soft ring, quieter than the playhead. */
  :global(#staff .latest-phrase .abcjs-notehead) {
    stroke: var(--staff-hover);
    stroke-width: 4px;
    stroke-opacity: 0.55;
    paint-order: stroke;
  }
  .actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: auto;
  }
  .title {
    padding: var(--space-1) var(--space-2);
    border-color: transparent;
    border-radius: var(--radius-sm);
    background: none;
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .title:hover {
    border-color: var(--rule);
  }
  .pencil {
    color: var(--ink-muted);
  }
  .name {
    overflow-wrap: anywhere;
    text-align: left;
  }
</style>
