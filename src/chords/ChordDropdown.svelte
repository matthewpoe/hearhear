<script>
  // The chord region: the chip row of placed chords and the dropdown that
  // opens on a melody note. The dropdown lists the likely suspects for the
  // current key, best fit first and never pre-selected. Hover or focus
  // auditions an option in the bar around the note and lights its tones on the
  // keyboard; number keys audition by degree; Enter commits, then the phrase
  // replays with natural voice leading; Escape closes.
  /** @import { ChordSpec } from "../types.js" */
  /** @import { KeyboardLights } from "../store/ui.js" */
  /** @import { ChordOption as Option } from "./options.js" */
  /** @import { Passage } from "./passage.js" */
  import { tick, untrack } from "svelte";
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { onNoteClick } from "../staff/staffEvents.js";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { suggestions, isStale } from "../store/suggestions.js";
  import {
    audioStatus,
    auditionChord,
    auditionDebounced,
    preload,
    stopAudition,
  } from "../audio/index.js";
  import { playWithVisuals } from "../staff/playback.js";
  import { functionOf } from "../theory/index.js";
  import ChordChipRow from "./ChordChipRow.svelte";
  import ChordOption from "./ChordOption.svelte";
  import { chordView, whereOf } from "./chordView.js";
  import { chordOptions, degreeOf, describeOption } from "./options.js";
  import { passageAround, voicingIn } from "./passage.js";

  const WIDTH_PX = 352;
  const GUTTER_PX = 16;
  /** @type {KeyboardLights} */
  const NO_LIGHTS = { source: null, chord: null, melody: [] };
  /** The sticky on-screen piano (App.svelte); the dropdown never covers it. */
  const DOCK_SELECTOR = ".keyboard-dock";
  const voiceLeading = explainers.voiceLeading;

  /**
   * @type {{
   *   noteId: string,
   *   top: number,
   *   left: number,
   *   maxHeight: number | null,
   *   opener: Element | null,
   * } | null}
   */
  let open = $state(null);
  let extended = $state(false);
  let explainerOpen = $state(false);
  /** @type {HTMLElement | undefined} */
  let dialog = $state();
  /** @type {Option | null} */
  let hovered = $state(null);
  /** @type {Option | null} */
  let focused = $state(null);
  /** @type {string | null} */
  let audioError = $state(null);
  // Plain values, not state: they record what this component has touched so
  // closing undoes only its own audition and lights.
  let auditioned = false;
  /** @type {{ lights: KeyboardLights, option: Option, passage: Passage } | null} */
  let written = null;

  const labelMode = $derived(keyLabelMode($song, $ui));
  const passage = $derived(open ? passageAround($song, open.noteId) : null);
  const note = $derived(passage?.note ?? null);
  const where = $derived(note ? whereOf(note, $song.meter) : "");
  const fromCandidate = $derived($ui.auditionVoicing === "from-candidate");
  // Tracked so hover lights come back when playback releases the keyboard.
  const lightsSource = $derived($ui.keyboardLights.source);
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
    untrack(() => {
      if (source === "playback") {
        written = null;
        return;
      }
      if (option && at) {
        const current = ui.get().keyboardLights;
        if (written?.lights === current && written.option === option && written.passage === at)
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
        };
        written = { lights, option, passage: at };
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
    const maxLeft = window.scrollX + window.innerWidth - WIDTH_PX - GUTTER_PX;
    open = {
      noteId,
      top: rect.bottom + window.scrollY + GUTTER_PX / 2,
      left: Math.max(window.scrollX + GUTTER_PX, Math.min(rect.left + window.scrollX, maxLeft)),
      maxHeight: null,
      opener,
    };
    extended = false;
    explainerOpen = false;
    hovered = null;
    focused = null;
    await tick();
    fitAboveDock(rect);
    dialog?.focus();
  }

  /**
   * Keep the dropdown clear of the sticky keyboard dock, which shows the keys
   * a hover lights: below the anchor if it fits, else above it, else on the
   * roomier side with its own scroll.
   * @param {DOMRect} rect the anchor, viewport coordinates
   */
  function fitAboveDock(rect) {
    if (!open || !dialog) return;
    const dock = document.querySelector(DOCK_SELECTOR)?.getBoundingClientRect().height ?? 0;
    const roomTop = window.scrollY + GUTTER_PX;
    const roomBottom = window.scrollY + window.innerHeight - dock - GUTTER_PX;
    const anchorTop = rect.top + window.scrollY - GUTTER_PX / 2;
    const height = dialog.offsetHeight;
    if (open.top + height <= roomBottom) return;
    if (anchorTop - height >= roomTop) {
      open.top = anchorTop - height;
      return;
    }
    const spaceBelow = roomBottom - open.top;
    const spaceAbove = anchorTop - roomTop;
    if (spaceAbove > spaceBelow) open.top = roomTop;
    open.maxHeight = Math.max(spaceAbove, spaceBelow);
  }

  /** @param {boolean} restoreFocus */
  function close(restoreFocus) {
    const opener = open?.opener;
    open = null;
    hovered = null;
    focused = null;
    // SVGElement implements focus() as HTMLElement does.
    if (restoreFocus && opener?.isConnected)
      /** @type {HTMLElement | SVGElement} */ (opener).focus();
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

  function toggleVoiceLeading() {
    ui.update({ auditionVoicing: fromCandidate ? "as-song" : "from-candidate" });
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

<svelte:window onpointerdown={onWindowPointerDown} />

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
    >
      <h3 id="chord-dropdown-title">Chord at {where}</h3>
      <p id="chord-dropdown-help" class="help">
        Hover or focus a chord to hear it under the tune. Number keys play chords by degree; Enter
        chooses; Escape closes.
      </p>

      <ul aria-label="Likely chords">
        {#each likely as option (option.key)}
          <li>
            <ChordOption
              {option}
              view={viewOf(option.chord)}
              current={isPlaced(option.chord)}
              onpreview={preview}
              onunpreview={unpreview}
              onchoose={(o) => commit(o.chord)}
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
                onchoose={(o) => commit(o.chord)}
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
                onchoose={(o) => commit(o.chord)}
              />
            </li>
          {/each}
        </ul>
      {/if}

      <div class="voicing">
        <button
          type="button"
          class="more"
          role="switch"
          aria-checked={fromCandidate}
          onclick={toggleVoiceLeading}
        >
          Voice leading: {fromCandidate ? "on" : "off"}
        </button>
        <button
          type="button"
          class="link"
          aria-expanded={explainerOpen}
          aria-controls="chord-dropdown-voice-leading"
          onclick={() => (explainerOpen = !explainerOpen)}
        >
          {voiceLeading.title}
        </button>
      </div>
      {#if explainerOpen}
        <div id="chord-dropdown-voice-leading" class="explainer">
          <p>{voiceLeading.body}</p>
          <p>{voiceLeading.off}</p>
          <p>{voiceLeading.on}</p>
        </div>
      {/if}

      {#if placed}
        <button type="button" class="more" onclick={() => commit(null)}>No chord here</button>
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
  {/if}
</section>

<style>
  .chords {
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .dropdown {
    position: absolute;
    z-index: 10;
    display: grid;
    gap: var(--space-2);
    max-width: calc(100vw - 2rem);
    max-height: 70vh;
    overflow-y: auto;
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 0.5rem 1.5rem color-mix(in srgb, var(--ink) 18%, transparent);
    animation: drop var(--dur-fast) var(--ease);
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
  .voicing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: var(--text-sm);
    text-decoration: underline;
    cursor: pointer;
  }
  .explainer {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }
  .explainer p {
    margin: 0;
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
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-0.25rem);
    }
  }
</style>
