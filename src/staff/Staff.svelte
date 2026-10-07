<script>
  // The staff: the song rendered by abcjs, redrawn only when the song or its
  // notation changes (and once when a web font finishes loading, since abcjs
  // lays text out with the metrics it measures). Playhead and hover toggle
  // classes on the mapped SVG elements (staffEvents.js) and never redraw.
  // abcjs loads on demand (decision D16), so the main bundle stays small.
  import { untrack } from "svelte";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { describeNote, songToAbc } from "./abc.js";
  import { mapDrawnNotes } from "./noteMap.js";
  import { chordFunctions, colorChordSymbols, revealLabels } from "./chordChips.js";
  import { emitNoteClick, highlight, registerNoteElements } from "./staffEvents.js";
  import Transport from "./Transport.svelte";
  import "../print.css";

  /** @typedef {typeof import("abcjs").default} Abcjs */

  /** @type {HTMLDivElement} */
  let host;
  let abcjs = $state(/** @type {Abcjs | null} */ (null));
  let loadError = $state(false);
  let drawError = $state(/** @type {string | null} */ (null));
  /** Bumped when a web font finishes loading, to redraw with its metrics. */
  let fontLoads = $state(0);

  const mode = $derived(keyLabelMode($song, $ui));
  const labelStyle = $derived($ui.labelStyle);
  const showDegrees = $derived($ui.showDegrees);
  const notation = $derived(songToAbc($song, { mode, labelStyle, showDegrees }));

  /** Note groups in reading order; one per note (its first glyph). */
  let noteButtons = /** @type {Element[]} */ ([]);

  function loadAbcjs() {
    loadError = false;
    import("abcjs")
      .then((module) => (abcjs = module.default))
      .catch((error) => {
        console.error("The staff's notation library failed to load", error);
        loadError = true;
      });
  }

  $effect(() => {
    loadAbcjs();
    const onFontsLoaded = () => fontLoads++;
    document.fonts?.addEventListener("loadingdone", onFontsLoaded);
    return () => document.fonts?.removeEventListener("loadingdone", onFontsLoaded);
  });

  // Redraw whenever the song (its version) or the notation changes.
  $effect(() => {
    const current = $song;
    const { abc, pieces } = notation;
    const view = { mode, labelStyle, showDegrees };
    const library = abcjs;
    void fontLoads;
    if (library) untrack(() => draw(library, current, abc, pieces, view));
  });

  /**
   * @param {Abcjs} library
   * @param {import("../types.js").Song} current
   * @param {string} abc
   * @param {import("./abc.js").NotePiece[]} pieces
   * @param {import("./abc.js").StaffView} view
   */
  function draw(library, current, abc, pieces, view) {
    // Remember the keyboard user's place: the focused note, else the selection.
    const focused = host.contains(document.activeElement)
      ? (document.activeElement?.closest("[data-note-id]") ?? null)
      : null;
    const place = {
      noteId: focused?.getAttribute("data-note-id") ?? ui.get().selectedNoteId,
      index: focused ? noteButtons.indexOf(focused) : -1,
      hadFocus: focused !== null,
    };
    try {
      const [tune] = library.renderAbc(host, abc, {
        add_classes: true,
        responsive: "resize",
        staffwidth: 760,
        paddingleft: 0,
        paddingright: 0,
      });
      const { notes, chords } = mapDrawnNotes(tune, pieces);
      registerNoteElements(notes);
      labelNotes(current, notes, view, place);
      if (view.mode !== "hidden") colorChordSymbols(chords, chordFunctions(current));
      const svg = host.querySelector("svg");
      svg?.setAttribute("role", "group");
      svg?.setAttribute("aria-label", `Notation: ${current.title}`);
      const playhead = ui.get().playheadNoteId;
      if (playhead) highlight([playhead], "is-playing");
      drawError = null;
    } catch (error) {
      console.error("Staff failed to draw", error);
      registerNoteElements(new Map());
      noteButtons = [];
      drawError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Make each note a keyboard-reachable button with an accessible name. One
   * tab stop for the whole staff (roving tabindex); arrows move between
   * notes. The tab stop stays on the note the user was on (or the note now at
   * its place, if it was deleted), and focus follows it across the redraw.
   * @param {import("../types.js").Song} current
   * @param {Map<string, Element[]>} notes
   * @param {import("./abc.js").StaffView} view
   * @param {{ noteId: string | null, index: number, hadFocus: boolean }} place
   */
  function labelNotes(current, notes, view, place) {
    const chordByNote = new Map(current.chords.map((c) => [c.noteId, c]));
    noteButtons = [];
    for (const note of current.notes) {
      const groups = notes.get(note.id) ?? [];
      for (const group of groups) group.setAttribute("data-note-id", note.id);
      const [first] = groups;
      if (!first) continue;
      first.setAttribute("role", "button");
      first.setAttribute("tabindex", "-1");
      first.setAttribute(
        "aria-label",
        describeNote(note, chordByNote.get(note.id) ?? null, current.key, view),
      );
      noteButtons.push(first);
    }
    if (noteButtons.length === 0) return;
    const byId = noteButtons.findIndex((b) => b.getAttribute("data-note-id") === place.noteId);
    const index = byId >= 0 ? byId : Math.min(Math.max(place.index, 0), noteButtons.length - 1);
    const stop = noteButtons[index];
    stop.setAttribute("tabindex", "0");
    if (place.hadFocus && stop instanceof SVGElement) stop.focus();
  }

  // The reveal: the first time labels turn confirmed, colors and degrees grow in.
  let previousMode = untrack(() => mode);
  $effect(() => {
    if (mode === "confirmed" && previousMode !== "confirmed") revealLabels(host);
    previousMode = mode;
  });

  /** @param {Element} group */
  function noteClick(group) {
    const noteId = group.getAttribute("data-note-id");
    if (noteId) emitNoteClick({ noteId, anchorRect: group.getBoundingClientRect() });
  }

  /** @param {MouseEvent} event */
  function onClick(event) {
    const group = /** @type {Element} */ (event.target).closest("[data-note-id]");
    if (group) noteClick(group);
  }

  /** @param {KeyboardEvent} event */
  function onKeydown(event) {
    const index = noteButtons.indexOf(/** @type {Element} */ (event.target));
    if (index < 0) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      noteClick(noteButtons[index]);
      return;
    }
    const last = noteButtons.length - 1;
    // Clamped at both ends: arrows never wrap around the song.
    const moves = {
      ArrowLeft: Math.max(0, index - 1),
      ArrowRight: Math.min(last, index + 1),
      Home: 0,
      End: last,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = noteButtons[moves[/** @type {keyof typeof moves} */ (event.key)]];
    if (!(next instanceof SVGElement)) return;
    for (const button of noteButtons) button.setAttribute("tabindex", "-1");
    next.setAttribute("tabindex", "0");
    next.focus();
  }

  // abcjs builds the SVG imperatively, so listen on the host (event delegation).
  $effect(() => {
    host.addEventListener("click", onClick);
    host.addEventListener("keydown", onKeydown);
    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("keydown", onKeydown);
    };
  });
</script>

<section id="staff" class="staff" aria-label="Staff">
  <div class="toolbar">
    <Transport />
    <button type="button" class="print" onclick={() => window.print()} disabled={!abcjs}>
      Print lead sheet
    </button>
  </div>
  {#if loadError}
    <p class="error" role="alert">
      The staff didn't load.
      <button type="button" class="link" onclick={loadAbcjs}>Retry</button>
    </p>
  {:else if !abcjs}
    <p class="loading" role="status">Loading the staff…</p>
  {/if}
  {#if drawError}
    <p class="error" role="alert">
      The staff couldn't draw this song ({drawError}). Undo the last change to get it back.
    </p>
  {/if}
  <div class="notation mode-{mode}" bind:this={host}></div>
</section>

<style>
  .staff {
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .print {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .print:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .error,
  .loading {
    margin: var(--space-3) 0 0;
  }
  .error {
    color: var(--fn-dominant);
  }
  .loading {
    color: var(--ink-muted);
  }
  .link {
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  /* abcjs draws with currentColor, so the staff is --ink in both themes. */
  .notation {
    color: var(--ink);
  }
  .notation :global(text) {
    font-family: var(--font);
  }
  .notation :global(.abcjs-title) {
    font-weight: 500;
  }
  .notation :global(.abcjs-chord) {
    font-weight: 500;
  }
  .notation :global(.abcjs-annotation),
  .notation :global(.abcjs-lyric) {
    fill: var(--ink-muted);
  }

  /* Notes are buttons: pointer, focus, and the playhead. */
  .notation :global([data-note-id]) {
    cursor: pointer;
  }
  .notation :global([data-note-id]:focus) {
    outline: none;
  }
  .notation :global([data-note-id]:focus-visible .abcjs-notehead) {
    stroke: var(--focus);
    stroke-width: 3px;
  }
  .notation :global([data-note-id]:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
  .notation :global(.is-playing .abcjs-notehead),
  .notation :global(.is-hovered .abcjs-notehead) {
    stroke: var(--key-glow-melody);
    stroke-width: 6px;
    paint-order: stroke;
  }

  /* Chord letters colored by function, like a lead sheet (decision D3):
     chordChips.js sets --chord-color from theory's functionInfo. Tentative
     keeps the full color (reduced opacity would fail text contrast) and
     marks itself with italics. Hidden mode tags nothing: a neutral mark. */
  .mode-confirmed :global(.chord-text) {
    fill: var(--chord-color);
  }
  .mode-tentative :global(.chord-text) {
    fill: var(--chord-color);
    font-style: italic;
  }
  .mode-hidden :global(.abcjs-chord) {
    fill: var(--ink-muted);
  }
</style>
