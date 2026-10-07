<script>
  // The chord region: the chip row of placed chords and the dropdown that
  // opens on a melody note. The dropdown lists the likely suspects for the
  // current key, best fit first and never pre-selected. Hover or focus
  // auditions an option in the bar around the note and lights its tones on the
  // keyboard; on touch, the first tap does the same and a second tap on that
  // option commits. Number keys audition by degree; Enter or a click commits,
  // then the phrase replays with natural voice leading; Escape closes.
  /** @import { ChordSpec } from "../types.js" */
  /** @import { KeyboardLights } from "../store/ui.js" */
  /** @import { ChordOption as Option } from "./options.js" */
  /** @import { Passage } from "./passage.js" */
  /** @import { PlacementInput, Side } from "./placement.js" */
  import { tick, untrack } from "svelte";
  import { onNoteClick } from "../staff/staffEvents.js";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { suggestions, isStale } from "../store/suggestions.js";
  import {
    audioStatus,
    auditionChord,
    auditionDebounced,
    preload,
    resume,
    stopAudition,
  } from "../audio/index.js";
  import { playWithVisuals } from "../staff/playback.js";
  import { holdHome, homeDrone, releaseHome } from "../staff/homeDrone.js";
  import { functionOf } from "../theory/index.js";
  import ChordChipRow from "./ChordChipRow.svelte";
  import VoiceLeading from "../toolbar/VoiceLeading.svelte";
  import ChordOption from "./ChordOption.svelte";
  import { chordView } from "./chordView.js";
  import { whereOf } from "./where.js";
  import { containingAncestor } from "./containingBlock.js";
  import { chordOptions, degreeOf, describeOption } from "./options.js";
  import { passageAround, voicingIn } from "./passage.js";
  import { placeOn, sideFor } from "./placement.js";
  import { NO_TAP, activate } from "./tap.js";

  const WIDTH_PX = 352;
  const GUTTER_PX = 16;
  /** The tallest the dropdown grows, as a share of the viewport. */
  const CAP_VH = 0.7;
  /** @type {KeyboardLights} */
  const NO_LIGHTS = { source: null, chord: null, melody: [] };
  /** The sticky on-screen piano (App.svelte); the dropdown never covers it. */
  const DOCK_SELECTOR = ".keyboard-dock";

  /**
   * @type {{
   *   noteId: string,
   *   anchorTop: number,
   *   anchorBottom: number,
   *   side: Side | null,
   *   top: number,
   *   left: number,
   *   maxHeight: number | null,
   *   opener: Element | null,
   * } | null}
   */
  let open = $state(null);
  let extended = $state(false);
  /** @type {HTMLElement | undefined} */
  let dialog = $state();
  /** @type {HTMLElement | undefined} */
  let content = $state();
  /** @type {Option | null} */
  let hovered = $state(null);
  /** @type {Option | null} */
  let focused = $state(null);
  /** @type {string | null} */
  let audioError = $state(null);
  let tap = $state(NO_TAP);
  /** The dropdown scrolls and more of it lies below: show the fade cue. */
  let moreBelow = $state(false);
  /** Announced when a tap previews an option, since the visible cue isn't read. */
  let tapHint = $state("");
  // Plain values, not state: they record what this component has touched so
  // closing undoes only its own audition and lights.
  let auditioned = false;
  /** This dropdown's hold on "Drone on home", from its first audition to its close. */
  const droneHolder = {};
  /** @type {{ lights: KeyboardLights, option: Option, passage: Passage, drone: number[] } | null} */
  let written = null;

  const labelMode = $derived(keyLabelMode($song, $ui));
  const passage = $derived(open ? passageAround($song, open.noteId) : null);
  const note = $derived(passage?.note ?? null);
  const where = $derived(note ? whereOf(note, $song.meter) : "");
  // Tracked so hover lights come back when playback releases the keyboard.
  const lightsSource = $derived($ui.keyboardLights.source);
  // "Drone on home" sounds under auditions too, and lights as playback lights it.
  const homeTones = $derived($homeDrone);
  const likely = $derived(note ? chordOptions($song, note) : []);
  const more = $derived(note && extended ? chordOptions($song, note, { extended: true }) : []);
  const ideas = $derived(
    note
      ? $suggestions.items
          .filter((s) => s.noteId === note.id)
          .map((s) => ({
            option: describeOption($song, note, s.chord, `tutor:${s.id}`),
            detail: `Tutor, ${s.confidence} confidence: ${s.reason}`,
          }))
      : [],
  );
  const stale = $derived(isStale($suggestions, $song.version));
  const placed = $derived(note ? $song.chords.find((c) => c.noteId === note.id) : undefined);

  /** @param {ChordSpec} chord */
  const viewOf = (chord) => chordView(chord, $song.key, labelMode, $ui.labelStyle);
  /** @param {ChordSpec} chord */
  const isPlaced = (chord) => placed?.root === chord.root && placed?.type === chord.type;

  $effect(() =>
    onNoteClick(({ noteId, anchorRect }) => {
      // Staff notes are focusable SVG <g> elements, so accept any Element.
      const active = document.activeElement;
      openAt(
        noteId,
        anchorRect,
        active instanceof Element && active !== document.body ? active : null,
      );
    }),
  );

  // Refit whenever the content changes size (the extended list, the
  // tutor ideas arriving), so growth never pushes it off screen.
  $effect(() => {
    if (!content) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(content);
    return () => observer.disconnect();
  });

  $effect(() => () => releaseHome(droneHolder));

  // The note was deleted or the song replaced while the dropdown was open.
  $effect(() => {
    if (open && !note) close(false);
  });

  // While an option is hovered or focused, the keyboard shows its tones
  // (decision D10). Playback outranks hover: nothing is written while it owns
  // the lights, and they are cleared only while they are still ours. From the
  // ui store it writes, the effect deliberately tracks only the lights'
  // source; everything else it reads from ui and song is untracked.
  $effect(() => {
    const option = hovered ?? focused;
    const source = lightsSource;
    const at = passage;
    const drone = homeTones;
    untrack(() => {
      if (source === "playback") {
        written = null;
        return;
      }
      if (option && at) {
        const current = ui.get().keyboardLights;
        if (
          written?.lights === current &&
          written.option === option &&
          written.passage === at &&
          written.drone === drone
        )
          return;
        const hidden = keyLabelMode(song.get(), ui.get()) === "hidden";
        /** @type {KeyboardLights} */
        const lights = {
          source: "hover",
          chord: {
            midi: voicingIn(at, option.chord),
            fn: hidden ? "other" : functionOf(option.numeral, song.get().key.mode),
          },
          melody: [at.note.midi],
          drone,
        };
        written = { lights, option, passage: at, drone };
        ui.update({ keyboardLights: lights });
      } else if (written) {
        if (source === "hover") ui.update({ keyboardLights: NO_LIGHTS });
        written = null;
      }
    });
  });

  /**
   * @param {string} noteId
   * @param {DOMRect} rect viewport coordinates of the note or chip
   * @param {Element | null} opener where focus returns on close: a chip
   *   button or a staff note (an SVG element)
   */
  async function openAt(noteId, rect, opener) {
    void wakeAudio();
    const maxLeft = window.scrollX + window.innerWidth - WIDTH_PX - GUTTER_PX;
    open = {
      noteId,
      anchorTop: rect.top + window.scrollY,
      anchorBottom: rect.bottom + window.scrollY,
      side: null,
      top: rect.bottom + window.scrollY + GUTTER_PX / 2,
      left: Math.max(window.scrollX + GUTTER_PX, Math.min(rect.left + window.scrollX, maxLeft)),
      maxHeight: null,
      opener,
    };
    // The open note is the selection the chord row assigns to.
    ui.update({ selectedNoteId: noteId });
    extended = false;
    hovered = null;
    focused = null;
    tap = NO_TAP;
    tapHint = "";
    await tick();
    warnIfContained();
    fit();
    // Focus only once the fitted position is in the DOM, and never let it
    // scroll the page: that would move the view out from under the fit.
    await tick();
    dialog?.focus({ preventScroll: true });
  }

  /**
   * Opening the dropdown is a user gesture (a click, or Enter on a note), and
   * the next thing it does is audition on hover, which is not one. Start audio
   * now so the first hover sounds. resume() is silent: no sound-check chord
   * over a tune that may be in another key, even before the key is chosen.
   */
  async function wakeAudio() {
    try {
      await resume();
    } catch (error) {
      console.error("Audio didn't start from the note click", error);
      audioError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * `top` and `left` are page coordinates, so they hold only while no
   * ancestor of the dropdown is a containing block (positioned, transformed,
   * filtered, contained). None is today; if a layout change adds one, say so
   * loudly rather than let the dropdown drift from its note: a console error,
   * which the e2e smoke test counts as a failure.
   */
  function warnIfContained() {
    const found = dialog && containingAncestor(dialog);
    if (found)
      console.error(
        `Chord dropdown: an ancestor is a containing block (${found.reason}), so its page ` +
          "coordinates are off. Remove that style or portal the dropdown to <body>.",
        found.ancestor,
      );
  }

  /**
   * Keep the dropdown inside the visible area, between the top of the
   * viewport and the sticky keyboard dock (which shows the keys a hover
   * lights): below the anchor if it fits, else above it, else on the roomier
   * side with its own scroll. The side is chosen once per open; refits for
   * growing content keep it, so the content scrolls inside rather than
   * flipping. When the page scrolls or resizes, the room on each side
   * changes, so the side is chosen again: that keeps the dropdown clear of
   * the dock instead of sliding under it or shrinking to a sliver.
   * @param {{ reside?: boolean }} [options]
   */
  function fit({ reside = false } = {}) {
    if (!open || !dialog) return;
    const dockTop = document.querySelector(DOCK_SELECTOR)?.getBoundingClientRect().top;
    const visibleBottom = Math.min(window.innerHeight, dockTop ?? Infinity);
    /** @type {PlacementInput} */
    const at = {
      anchorTop: open.anchorTop,
      anchorBottom: open.anchorBottom,
      // scrollHeight is the content's full height even while max-height clips it.
      height: dialog.scrollHeight + dialog.offsetHeight - dialog.clientHeight,
      viewTop: window.scrollY + GUTTER_PX,
      viewBottom: window.scrollY + visibleBottom - GUTTER_PX,
      gap: GUTTER_PX / 2,
      cap: window.innerHeight * CAP_VH,
    };
    if (reside || !open.side) open.side = sideFor(at);
    const { top, maxHeight } = placeOn(at, open.side);
    open.top = top;
    open.maxHeight = maxHeight;
    // The new max height isn't in the DOM yet, so measure against it here.
    moreBelow = dialog.scrollTop + maxHeight < at.height - 1;
  }

  /** On the dropdown's own scroll: is content still hidden below? */
  function onDialogScroll() {
    if (dialog) moreBelow = dialog.scrollTop + dialog.clientHeight < dialog.scrollHeight - 1;
  }

  const refit = () => fit({ reside: true });

  /** @param {boolean} restoreFocus */
  function close(restoreFocus) {
    const opener = open?.opener;
    const noteId = open?.noteId;
    open = null;
    releaseHome(droneHolder);
    ui.update({ selectedNoteId: null });
    hovered = null;
    focused = null;
    tap = NO_TAP;
    tapHint = "";
    if (!restoreFocus) return;
    // A chord placed from the keyboard redraws the staff, replacing the note
    // that opened the dropdown; its successor keeps the same data-note-id.
    const target = opener?.isConnected
      ? opener
      : noteId
        ? document.querySelector(`#staff [data-note-id="${CSS.escape(noteId)}"]`)
        : null;
    // SVGElement implements focus() as HTMLElement does. Focus goes back to
    // where it was without scrolling: the note was on screen when it opened
    // the dropdown, and a scroll here pushed the masthead off the top.
    /** @type {HTMLElement | SVGElement | null} */ (target)?.focus({ preventScroll: true });
  }

  /**
   * Close without choosing, silencing any audition this dropdown started.
   * @param {boolean} restoreFocus
   */
  function dismiss(restoreFocus) {
    if (auditioned) stopAudition();
    auditioned = false;
    close(restoreFocus);
  }

  /**
   * Hover and focus audition debounced, so sweeping the list sounds only
   * where the pointer rests.
   * @param {Passage} at
   * @param {ChordSpec} chord
   */
  function auditionSoon(at, chord) {
    holdHome(droneHolder);
    auditionDebounced(voicingIn(at, chord), at.range, {
      atTick: at.note.start,
      neighbors: $ui.auditionVoicing,
    });
    auditioned = true;
  }

  /**
   * "Hear it" on a tutor idea is a deliberate click, so it sounds at once.
   * @param {string} noteId
   * @param {ChordSpec} chord
   */
  function hearNow(noteId, chord) {
    const at = passageAround($song, noteId);
    if (!at) return;
    auditioned = true;
    holdHome(droneHolder);
    // A failed audition already shows through audioStatus.
    auditionChord(voicingIn(at, chord), at.range, {
      atTick: at.note.start,
      neighbors: $ui.auditionVoicing,
    }).catch(() => {});
  }

  /** @param {Option} option @param {"hover" | "focus"} via */
  function preview(option, via) {
    if (via === "hover") hovered = option;
    else focused = option;
    if (passage) auditionSoon(passage, option.chord);
  }

  /**
   * Click, tap, or Enter on an option. A mouse click or Enter chooses it. A tap
   * previews it, since a finger can't hover and its focus and click arrive
   * together; a second tap on the same option chooses it.
   * @param {Option} option
   * @param {string} pointerType
   */
  function onactivate(option, pointerType) {
    const next = activate(tap, option.key, pointerType);
    tap = next.state;
    if (next.choose) {
      commit(option.chord);
      return;
    }
    preview(option, "focus");
    tapHint = `${viewOf(option.chord).name}. Tap again to choose.`;
  }

  /**
   * Before the user's key guess (hidden labels), chords can't be numbered, so
   * the dropdown sends them to the key question instead of listing candidates.
   */
  function goToKeyQuestion() {
    dismiss(false);
    document.getElementById("key-prompt-title")?.focus();
  }

  /** @param {"hover" | "focus"} via */
  function unpreview(via) {
    if (via === "hover") hovered = null;
    else focused = null;
  }

  /** @param {ChordSpec | null} chord */
  function commit(chord) {
    if (!open) return;
    const range = passage?.range;
    song.setChord(open.noteId, chord && { root: chord.root, type: chord.type });
    auditioned = false;
    close(true);
    if (chord && range) {
      // Hear the choice once in context, voiced as the song plays it (D4).
      // Silence the audition first so the two never overlap. Playback
      // failures surface through audioStatus.
      stopAudition();
      playWithVisuals(range).catch(() => {});
    }
  }

  /** @param {KeyboardEvent} event */
  function onkeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    const digit = /^Digit([1-7])$/.exec(event.code);
    if (digit && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      // Numbers are scale degrees everywhere: 5 auditions V. Stop the number
      // row from also playing a melody note: it skips defaultPrevented events.
      event.preventDefault();
      if (event.repeat) return;
      const option = likely.find((o) => degreeOf(o) === Number(digit[1]));
      if (option) focusOption(option);
    }
  }

  /** @param {Option} option */
  function focusOption(option) {
    const button = dialog?.querySelector(`[data-option="${CSS.escape(option.key)}"]`);
    if (!(button instanceof HTMLElement)) return;
    if (button === document.activeElement) preview(option, "focus");
    else button.focus();
  }

  /** @param {1 | -1} step */
  function moveFocus(step) {
    const buttons = [...(dialog?.querySelectorAll("button") ?? [])];
    const index = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const next = index < 0 ? (step > 0 ? 0 : buttons.length - 1) : index + step;
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  }

  /** @param {PointerEvent} event */
  function onWindowPointerDown(event) {
    if (open && dialog && event.target instanceof Node && !dialog.contains(event.target))
      dismiss(false);
  }

  /** @param {FocusEvent} event Tabbing out of the dropdown closes it. */
  function onfocusout(event) {
    const next = event.relatedTarget;
    if (open && dialog && next instanceof Node && !dialog.contains(next)) dismiss(false);
  }

  async function retrySounds() {
    audioError = null;
    try {
      await preload();
    } catch (error) {
      audioError = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onresize={refit} onscroll={refit} />

<section id="chords" class="chords" aria-label="Chords">
  <h2>Chords</h2>
  <ChordChipRow
    onopen={(noteId, anchor) => openAt(noteId, anchor.getBoundingClientRect(), anchor)}
    onhear={hearNow}
  />

  {#if open && note}
    <div
      bind:this={dialog}
      class="dropdown"
      role="dialog"
      aria-labelledby="chord-dropdown-title"
      aria-describedby="chord-dropdown-help"
      tabindex="-1"
      style:top="{open.top}px"
      style:left="{open.left}px"
      style:width="{WIDTH_PX}px"
      style:max-height={open.maxHeight === null ? null : `${open.maxHeight}px`}
      {onkeydown}
      {onfocusout}
      onscroll={onDialogScroll}
    >
      <div class="content" bind:this={content}>
        <h3 id="chord-dropdown-title">Chord at {where}</h3>
        {#if labelMode === "hidden"}
          <p id="chord-dropdown-help" class="help">
            Choose the key first. Chords are numbered from home, so they only make sense once you
            know where home is.
          </p>
          <button type="button" class="more" onclick={goToKeyQuestion}
            >Go to the key question</button
          >
        {:else}
          <p id="chord-dropdown-help" class="help">
            Hover, focus, or tap a chord to hear it under the tune. Number keys play chords by
            degree; Enter, a click, or a second tap chooses; Escape closes.
          </p>
          <p class="visually-hidden" role="status">{tapHint}</p>
          <!-- How the chords around a tested one are voiced (decision D4): off,
               only the tested chord changes. -->
          <div class="voicing"><VoiceLeading /></div>

          <ul aria-label="Likely chords">
            {#each likely as option (option.key)}
              <li>
                <ChordOption
                  {option}
                  view={viewOf(option.chord)}
                  current={isPlaced(option.chord)}
                  onpreview={preview}
                  onunpreview={unpreview}
                  tapped={tap.previewed === option.key}
                  {onactivate}
                />
              </li>
            {/each}
          </ul>

          {#if ideas.length > 0}
            <h4>From the tutor</h4>
            {#if stale}
              <p class="help">Suggested before your last edit.</p>
            {/if}
            <ul aria-label="Tutor's ideas">
              {#each ideas as { option, detail } (option.key)}
                <li>
                  <ChordOption
                    {option}
                    {detail}
                    view={viewOf(option.chord)}
                    current={isPlaced(option.chord)}
                    onpreview={preview}
                    onunpreview={unpreview}
                    tapped={tap.previewed === option.key}
                    {onactivate}
                  />
                </li>
              {/each}
            </ul>
          {/if}

          <button
            type="button"
            class="more"
            aria-expanded={extended}
            aria-controls="chord-dropdown-more"
            onclick={() => (extended = !extended)}
          >
            Something else…
          </button>
          {#if extended}
            <ul id="chord-dropdown-more" aria-label="More chords">
              {#each more as option (option.key)}
                <li>
                  <ChordOption
                    {option}
                    view={viewOf(option.chord)}
                    current={isPlaced(option.chord)}
                    onpreview={preview}
                    onunpreview={unpreview}
                    tapped={tap.previewed === option.key}
                    {onactivate}
                  />
                </li>
              {/each}
            </ul>
          {/if}
        {/if}

        {#if placed}
          <!-- An action, worded as one: "No chord here" read as a status line
               that contradicted the chord just placed. -->
          <button type="button" class="more" onclick={() => commit(null)}>Remove this chord</button>
        {/if}

        {#if $audioStatus === "loading"}
          <p class="status" role="status">Loading piano sounds…</p>
        {:else if $audioStatus === "failed" || audioError}
          <p class="status" role="alert">
            The piano sounds didn't load{audioError ? ` (${audioError})` : ""}.
            <button type="button" onclick={retrySounds}>Try again</button>
          </p>
        {/if}
      </div>
      <div class="more-below" class:shown={moreBelow} aria-hidden="true"></div>
    </div>
  {/if}
</section>

<style>
  /* A violet band and heading mark the step you're working on. */
  .chords {
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-top: var(--band) solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  h2 {
    margin: 0 0 var(--space-2);
    color: var(--accent);
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .dropdown {
    position: absolute;
    z-index: 10;
    max-width: calc(100vw - 2rem);
    max-height: 70vh;
    overflow-y: auto;
    /* Scrolling past the end never scrolls the page under the dropdown. */
    overscroll-behavior: contain;
    scrollbar-color: var(--ink-muted) transparent;
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 0.5rem 1.5rem color-mix(in srgb, var(--ink) 18%, transparent);
    animation: drop var(--dur-fast) var(--ease);
  }
  .content {
    display: grid;
    gap: var(--space-2);
  }
  h3,
  h4 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  h4 {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .voicing {
    margin-bottom: var(--space-2);
  }
  .help,
  .status {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  ul {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .more,
  .status button {
    justify-self: start;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }
  /* The scroll cue: content fades out at the bottom edge while more of the
     list is hidden below it. No label, so nothing is printed over the
     option showing through. It takes no space and no clicks. */
  .more-below {
    position: sticky;
    bottom: calc(-1 * var(--space-3));
    height: 2.5rem;
    margin: -2.5rem calc(-1 * var(--space-3)) 0;
    background: linear-gradient(transparent, var(--surface));
    pointer-events: none;
    visibility: hidden;
  }
  .more-below.shown {
    visibility: visible;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-0.25rem);
    }
  }
</style>
