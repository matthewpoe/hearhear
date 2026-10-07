<script>
  // The accidental menu: a right-click (ctrl-click on a Mac, long-press on
  // touch, Shift+F10 or the ContextMenu key) on a staff note offers the
  // note's letter with each accidental, for a sharp or flat forgotten while
  // entering it. A choice sets the pitch in one undoable step, plays it, and
  // announces it. It sits like the chord dropdown: inside the visible area,
  // above the keyboard dock (placement.js decides the side).
  /** @import { PlacementInput, Side } from "../chords/placement.js" */
  /** @import { AccidentalChoice } from "./accidentals.js" */
  import { tick } from "svelte";
  import { song } from "../store/song.js";
  import { noteOff, noteOn } from "../audio/index.js";
  import { spell } from "../theory/index.js";
  import { placeOn, sideFor } from "../chords/placement.js";
  import { accidentalChoices, pretty } from "./accidentals.js";

  const GUTTER_PX = 16;
  /** How long a picked note sounds. */
  const NOTE_MS = 600;
  /** The sticky on-screen piano (App.svelte); the menu never covers it. */
  const DOCK_SELECTOR = ".keyboard-dock";

  /**
   * @type {{
   *   request: { noteId: string, rect: DOMRect } | null,
   *   onclose: (restoreFocus: boolean) => void,
   *   onannounce: (text: string) => void,
   * }}
   */
  let { request, onclose, onannounce } = $props();

  /** @type {HTMLElement | undefined} */
  let popup = $state();
  let place = $state({ top: 0, left: 0, maxHeight: /** @type {number | null} */ (null) });
  /** @type {Side | null} */
  let side = null;

  const note = $derived(request ? $song.notes.find((n) => n.id === request.noteId) : undefined);
  const menu = $derived(note ? accidentalChoices(note.midi, $song.key) : null);
  const title = $derived(note ? pretty(spell(note.midi, $song.key)) : "");

  // Open: place below the note (or above), then focus the current choice.
  $effect(() => {
    if (!request) return;
    const { rect } = request;
    side = null;
    place = {
      top: rect.bottom + window.scrollY + GUTTER_PX / 2,
      left: Math.max(window.scrollX + GUTTER_PX, rect.left + window.scrollX),
      maxHeight: null,
    };
    void tick().then(async () => {
      fit();
      await tick();
      const items = itemsOf();
      (items.find((el) => el.getAttribute("aria-checked") === "true") ?? items[0])?.focus({
        preventScroll: true,
      });
    });
  });

  // The note was deleted or the song replaced while the menu was open.
  $effect(() => {
    if (request && !note) onclose(false);
  });

  /** @param {{ reside?: boolean }} [options] */
  function fit({ reside = false } = {}) {
    if (!request || !popup) return;
    const { rect } = request;
    const dockTop = document.querySelector(DOCK_SELECTOR)?.getBoundingClientRect().top;
    const visibleBottom = Math.min(window.innerHeight, dockTop ?? Infinity);
    /** @type {PlacementInput} */
    const at = {
      anchorTop: rect.top + window.scrollY,
      anchorBottom: rect.bottom + window.scrollY,
      height: popup.scrollHeight + popup.offsetHeight - popup.clientHeight,
      viewTop: window.scrollY + GUTTER_PX,
      viewBottom: window.scrollY + visibleBottom - GUTTER_PX,
      gap: GUTTER_PX / 2,
      cap: window.innerHeight * 0.7,
    };
    if (reside || !side) side = sideFor(at);
    const { top, maxHeight } = placeOn(at, side);
    const maxLeft = window.scrollX + window.innerWidth - popup.offsetWidth - GUTTER_PX;
    place = {
      top,
      maxHeight,
      left: Math.max(window.scrollX + GUTTER_PX, Math.min(rect.left + window.scrollX, maxLeft)),
    };
  }

  const itemsOf = () =>
    [...(popup?.querySelectorAll('[role="menuitemradio"]') ?? [])].map(
      (el) => /** @type {HTMLElement} */ (el),
    );

  /** @param {AccidentalChoice} choice */
  function pick(choice) {
    if (!request || !menu || !choice.onPiano) return;
    if (!choice.current) song.setPitch(request.noteId, choice.midi);
    noteOn(choice.midi);
    setTimeout(() => noteOff(choice.midi), NOTE_MS);
    const named = choice.label + menu.octave;
    const shown = pretty(spell(choice.midi, song.get().key));
    onannounce(choice.shownAs ? `${named}, shown as ${shown}` : named);
    onclose(true);
  }

  /** @param {KeyboardEvent} event */
  function onkeydown(event) {
    const items = itemsOf();
    const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const last = items.length - 1;
    /** @type {Record<string, number>} */
    const moves = {
      ArrowDown: index >= last ? 0 : index + 1,
      ArrowUp: index <= 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onclose(true);
    } else if (event.key === "Tab") {
      event.preventDefault();
      onclose(true);
    } else if (event.key in moves) {
      event.preventDefault();
      items[moves[event.key]]?.focus();
    }
  }

  /** @param {PointerEvent} event */
  function onWindowPointerDown(event) {
    if (request && popup && event.target instanceof Node && !popup.contains(event.target))
      onclose(false);
  }

  /** @param {FocusEvent} event */
  function onfocusout(event) {
    const next = event.relatedTarget;
    if (request && popup && next instanceof Node && !popup.contains(next)) onclose(false);
  }

  const refit = () => fit({ reside: true });
</script>

<svelte:window onpointerdown={onWindowPointerDown} onresize={refit} onscroll={refit} />

{#if request && menu}
  <div
    bind:this={popup}
    class="accidentals"
    style:top="{place.top}px"
    style:left="{place.left}px"
    style:max-height={place.maxHeight === null ? null : `${place.maxHeight}px`}
    {onkeydown}
    {onfocusout}
    oncontextmenu={(event) => event.preventDefault()}
  >
    <p class="title" id="accidental-menu-title">Change {title}</p>
    <div role="menu" aria-labelledby="accidental-menu-title">
      {#each menu.choices as choice (choice.offset)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={choice.current}
          aria-disabled={!choice.onPiano}
          aria-label={choice.name +
            (choice.shownAs ? `, shows as ${choice.shownAs} in this key` : "") +
            (choice.onPiano ? "" : ", off the piano")}
          tabindex="-1"
          onclick={() => pick(choice)}
        >
          <span class="label">{choice.label}</span>
          {#if choice.shownAs}
            <span class="hint">Shows as {choice.shownAs} in this key</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .accidentals {
    position: absolute;
    z-index: 11;
    min-width: 10rem;
    max-width: calc(100vw - 2rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 0.5rem 1.5rem color-mix(in srgb, var(--ink) 18%, transparent);
  }
  .title {
    margin: 0 0 var(--space-1);
    padding-inline: var(--space-2);
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  [role="menu"] {
    display: grid;
  }
  button {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }
  button[aria-checked="true"] .label::after {
    content: " ✓";
  }
  button[aria-disabled="true"] {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .label {
    min-width: 2.5em;
    font-size: var(--text-md);
  }
  .hint {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
</style>
