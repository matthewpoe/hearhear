<script>
  // The staff: the song rendered by abcjs, redrawn only when the song or its
  // notation changes (and once when a web font finishes loading, since abcjs
  // lays text out with the metrics it measures). Playhead and hover toggle
  // classes on the mapped SVG elements (staffEvents.js) and never redraw.
  // abcjs loads on demand (decision D16), so the main bundle stays small.
  // App.svelte shows the staff only once a song has notes, so the empty
  // landing has no Play, Print, or blank staff.
  import { tick, untrack } from "svelte";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { describeNote, songToAbc } from "./abc.js";
  import { spellMelody } from "../theory/index.js";
  import { mapDrawnNotes } from "./noteMap.js";
  import { chordFunctions, colorChordSymbols, revealLabels } from "./chordChips.js";
  import { emitNoteClick, highlight, registerNoteElements } from "./staffEvents.js";
  import Transport from "./Transport.svelte";
  import DroneSwitch from "./DroneSwitch.svelte";
  import AccidentalMenu from "./AccidentalMenu.svelte";
  import History from "../toolbar/History.svelte";
  import LabelControls from "../toolbar/LabelControls.svelte";
  import VoiceLeading from "../toolbar/VoiceLeading.svelte";
  import Toolbar from "../toolbar/Toolbar.svelte";
  import "../print.css";

  /** @typedef {typeof import("abcjs").default} Abcjs */

  /** Extra clickable margin around each note, in the staff's SVG units. */
  const HIT_PADDING = 3;
  /** Each note's tooltip: how to reach both of its menus. */
  const NOTE_TIP = "Click for chords · right-click to change the accidental";

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
  /** The open accidental menu's note, and where it was on screen. */
  let accidentalMenu = $state(/** @type {{ noteId: string, rect: DOMRect } | null} */ (null));
  /** The polite announcement of a changed pitch. */
  let pitchStatus = $state("");

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
        paddingtop: 0,
        // A small title: the masthead already names the song, and the music
        // needs the height (it prints the same way).
        format: { titlefont: "Jost 13" },
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
    const spelled = spellMelody(current.notes, current.key);
    noteButtons = [];
    for (const [i, note] of current.notes.entries()) {
      const groups = notes.get(note.id) ?? [];
      for (const group of groups) {
        group.setAttribute("data-note-id", note.id);
        addHitArea(group);
        addTooltip(group);
      }
      const [first] = groups;
      if (!first) continue;
      first.setAttribute("role", "button");
      first.setAttribute("tabindex", "-1");
      first.setAttribute(
        "aria-label",
        describeNote(note, chordByNote.get(note.id) ?? null, current.key, view, spelled[i]),
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

  /**
   * Make the whole note clickable. abcjs draws a note as separate paths (head,
   * stem, accidental) with gaps between them that take no clicks, so most of
   * a note was dead. A transparent rectangle behind the glyphs covers the
   * note's drawn shapes plus a few pixels on each side. The group also holds
   * the note's chord symbol and degree (text), which are left out: a wide
   * chord name would otherwise reach over the neighboring notes.
   * @param {Element} group
   */
  function addHitArea(group) {
    const boxes = [...group.children]
      .filter((el) => el instanceof SVGGraphicsElement && !(el instanceof SVGTextElement))
      .map((el) => /** @type {SVGGraphicsElement} */ (el).getBBox());
    if (boxes.length === 0) return;
    const left = Math.min(...boxes.map((b) => b.x)) - HIT_PADDING;
    const top = Math.min(...boxes.map((b) => b.y)) - HIT_PADDING;
    const right = Math.max(...boxes.map((b) => b.x + b.width)) + HIT_PADDING;
    const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + HIT_PADDING;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", "note-hit");
    rect.setAttribute("x", String(left));
    rect.setAttribute("y", String(top));
    rect.setAttribute("width", String(right - left));
    rect.setAttribute("height", String(bottom - top));
    rect.setAttribute("rx", String(HIT_PADDING));
    group.prepend(rect);
  }

  /**
   * A native tooltip on the note. SVG takes it from a <title> child, which
   * assistive tech reads as the note's description.
   * @param {Element} group
   */
  function addTooltip(group) {
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = NOTE_TIP;
    group.prepend(title);
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

  /**
   * Open the accidental menu on a note, anchored to the whole note.
   * @param {Element} group
   */
  function openAccidentals(group) {
    const noteId = group.getAttribute("data-note-id");
    if (!noteId || accidentalMenu?.noteId === noteId) return;
    const button = noteButtons.find((b) => b.getAttribute("data-note-id") === noteId) ?? group;
    accidentalMenu = { noteId, rect: button.getBoundingClientRect() };
  }

  /**
   * Right-click, ctrl-click on a Mac, or a long-press: the accidental menu,
   * in place of the browser's own menu on notes only.
   * @param {MouseEvent} event
   */
  function onContextMenu(event) {
    const group = /** @type {Element} */ (event.target).closest("[data-note-id]");
    if (!group) return;
    event.preventDefault();
    openAccidentals(group);
  }

  /**
   * Close the accidental menu; with restoreFocus, focus its note. The staff
   * may have redrawn under the menu, so find the note by id after the redraw.
   * @param {boolean} restoreFocus
   */
  async function closeAccidentals(restoreFocus) {
    const noteId = accidentalMenu?.noteId;
    accidentalMenu = null;
    if (!restoreFocus || !noteId) return;
    await tick();
    const target = noteButtons.find((b) => b.getAttribute("data-note-id") === noteId);
    if (!(target instanceof SVGElement)) return;
    for (const button of noteButtons) button.setAttribute("tabindex", "-1");
    target.setAttribute("tabindex", "0");
    target.focus();
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
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      openAccidentals(noteButtons[index]);
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
    host.addEventListener("contextmenu", onContextMenu);
    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("keydown", onKeydown);
      host.removeEventListener("contextmenu", onContextMenu);
    };
  });
</script>

<section id="staff" class="staff" aria-label="Staff">
  <!-- One compact row of controls over the music; it wraps on phones. -->
  <div class="header">
    <Transport />
    <DroneSwitch />
    <History />
    <LabelControls />
    <VoiceLeading />
    <button type="button" class="print" onclick={() => window.print()} disabled={!abcjs}>
      Print lead sheet
    </button>
    <Toolbar />
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
  <!-- abcjs sizes the host with a percentage padding, which resolves against
       its parent's width, so the width cap sits on this wrapper. -->
  <div class="frame">
    <div class="notation mode-{mode}" bind:this={host}></div>
  </div>
  <AccidentalMenu
    request={accidentalMenu}
    onclose={closeAccidentals}
    onannounce={(text) => (pitchStatus = text)}
  />
  <p class="visually-hidden pitch-status" role="status">{pitchStatus}</p>
</section>

<style>
  .staff {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .print {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
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
  /* Capped so the drawing doesn't scale up past two systems' worth of
     height on wide screens: the step panel and keyboard share the fold. */
  .frame {
    max-width: 56rem;
    margin-inline: auto;
  }
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
  /* The whole note takes clicks: its hit area is invisible until hovered. */
  .notation :global(.note-hit) {
    fill: transparent;
    pointer-events: all;
  }
  .notation :global([data-note-id]:hover .note-hit) {
    fill: color-mix(in srgb, var(--ink) 10%, transparent);
  }
  .notation :global([data-note-id]:hover .abcjs-notehead) {
    stroke: var(--ink-muted);
    stroke-width: 3px;
    paint-order: stroke;
  }
  /* abcjs fills a clicked note with its own selection red, which reads as the
     dominant's color with no shape beside it. The open dropdown names the note. */
  .notation :global(.abcjs-note_selected) {
    fill: currentColor;
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

  /* Chord symbols colored by function, like a lead sheet (decision D3):
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
