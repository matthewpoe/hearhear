<script>
  // The chord region: the chip row of placed chords and the dropdown that
  // opens on a melody note. The dropdown lists the likely suspects for the
  // current key, best fit first and never pre-selected. Hover or focus
  // auditions an option in the bar around the note and lights its tones on the
  // keyboard; number keys audition by degree; Enter commits; Escape closes.
  /** @import { ChordSpec } from "../types.js" */
  /** @import { ChordOption as Option } from "./options.js" */
  import { tick } from "svelte";
  import { onNoteClick } from "../staff/staffEvents.js";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { suggestions, isStale } from "../store/suggestions.js";
  import { audioStatus, auditionDebounced, preload, stop } from "../audio/index.js";
  import { functionOf, positionOf } from "../theory/index.js";
  import ChordChipRow from "./ChordChipRow.svelte";
  import ChordOption from "./ChordOption.svelte";
  import { chordView } from "./chordView.js";
  import { chordOptions, degreeOf, describeOption } from "./options.js";
  import { passageAround, voicingIn } from "./passage.js";

  const WIDTH_PX = 352;
  const GUTTER_PX = 16;
  const NO_LIGHTS = { chord: null, melody: [] };

  /** @type {{ noteId: string, top: number, left: number, opener: HTMLElement | null } | null} */
  let open = $state(null);
  let extended = $state(false);
  /** @type {HTMLElement | undefined} */
  let dialog = $state();
  /** @type {Option | null} */
  let hovered = $state(null);
  /** @type {Option | null} */
  let focused = $state(null);
  /** @type {string | null} */
  let audioError = $state(null);
  // Plain flags, not state: they record what this component has touched so
  // closing undoes only its own audition and lights.
  let auditioned = false;
  let lit = false;

  const labelMode = $derived(keyLabelMode($song, $ui));
  const passage = $derived(open ? passageAround($song, open.noteId) : null);
  const note = $derived(passage?.note ?? null);
  const where = $derived.by(() => {
    if (!note) return "";
    const { bar, beat } = positionOf(note.start, $song.meter);
    return `bar ${bar}, beat ${beat}`;
  });
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
      const active = document.activeElement;
      openAt(
        noteId,
        anchorRect,
        active instanceof HTMLElement && active !== document.body ? active : null,
      );
    }),
  );

  // The note was deleted or the song replaced while the dropdown was open.
  $effect(() => {
    if (open && !note) close(false);
  });

  // While an option is hovered or focused, the keyboard shows its tones. The
  // function comes from the numeral, not the view, so this effect doesn't
  // depend on the ui store it writes.
  $effect(() => {
    const option = hovered ?? focused;
    if (option && passage) {
      ui.update({
        keyboardLights: {
          chord: {
            midi: voicingIn(passage, option.chord),
            fn: labelMode === "hidden" ? "other" : functionOf(option.numeral, $song.key.mode),
          },
          melody: [passage.note.midi],
        },
      });
      lit = true;
    } else if (lit) {
      ui.update({ keyboardLights: NO_LIGHTS });
      lit = false;
    }
  });

  /**
   * @param {string} noteId
   * @param {DOMRect} rect viewport coordinates of the note or chip
   * @param {HTMLElement | null} opener where focus returns on close
   */
  async function openAt(noteId, rect, opener) {
    const maxLeft = window.scrollX + window.innerWidth - WIDTH_PX - GUTTER_PX;
    open = {
      noteId,
      top: rect.bottom + window.scrollY + GUTTER_PX / 2,
      left: Math.max(window.scrollX + GUTTER_PX, Math.min(rect.left + window.scrollX, maxLeft)),
      opener,
    };
    extended = false;
    hovered = null;
    focused = null;
    await tick();
    dialog?.focus();
  }

  /** @param {boolean} restoreFocus */
  function close(restoreFocus) {
    const opener = open?.opener;
    open = null;
    hovered = null;
    focused = null;
    if (restoreFocus && opener?.isConnected) opener.focus();
  }

  /**
   * Close without choosing, silencing any audition this dropdown started.
   * @param {boolean} restoreFocus
   */
  function dismiss(restoreFocus) {
    if (auditioned) stop();
    auditioned = false;
    close(restoreFocus);
  }

  /** @param {string} noteId @param {ChordSpec} chord */
  function audition(noteId, chord) {
    const at = passageAround($song, noteId);
    if (!at) return;
    auditionDebounced(voicingIn(at, chord), at.range, { atTick: at.note.start });
    auditioned = true;
  }

  /** @param {Option} option @param {"hover" | "focus"} via */
  function preview(option, via) {
    if (via === "hover") hovered = option;
    else focused = option;
    if (open) audition(open.noteId, option.chord);
  }

  /** @param {"hover" | "focus"} via */
  function unpreview(via) {
    if (via === "hover") hovered = null;
    else focused = null;
  }

  /** @param {ChordSpec | null} chord */
  function commit(chord) {
    if (!open) return;
    song.setChord(open.noteId, chord && { root: chord.root, type: chord.type });
    auditioned = false;
    close(true);
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
      // row from also playing a melody note.
      event.preventDefault();
      event.stopPropagation();
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
    onhear={audition}
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
