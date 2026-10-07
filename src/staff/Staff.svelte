<script>
  // The staff: the song rendered by abcjs, redrawn only when the song or its
  // notation changes. Playhead and hover toggle classes on the mapped SVG
  // elements (staffEvents.js) and never redraw.
  import abcjs from "abcjs";
  import { untrack } from "svelte";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { describeNote, songToAbc } from "./abc.js";
  import { mapDrawnNotes } from "./noteMap.js";
  import { chordFunctions, drawChordChips, revealLabels } from "./chordChips.js";
  import { emitNoteClick, highlight, registerNoteElements } from "./staffEvents.js";
  import Transport from "./Transport.svelte";
  import "../print.css";

  /** @type {HTMLDivElement} */
  let host;
  let drawError = $state(/** @type {string | null} */ (null));

  const mode = $derived(keyLabelMode($song, $ui));
  const labelStyle = $derived($ui.labelStyle);
  const showDegrees = $derived($ui.showDegrees);
  const notation = $derived(songToAbc($song, { mode, labelStyle, showDegrees }));

  /** Note groups in reading order; one per note (its first glyph). */
  let noteButtons = /** @type {Element[]} */ ([]);

  // Redraw whenever the song (its version) or the notation changes.
  $effect(() => {
    const current = $song;
    const { abc, pieces } = notation;
    const view = { mode, labelStyle, showDegrees };
    untrack(() => draw(current, abc, pieces, view));
  });

  /**
   * @param {import("../types.js").Song} current
   * @param {string} abc
   * @param {import("./abc.js").NotePiece[]} pieces
   * @param {import("./abc.js").StaffView} view
   */
  function draw(current, abc, pieces, view) {
    try {
      const [tune] = abcjs.renderAbc(host, abc, {
        add_classes: true,
        responsive: "resize",
        staffwidth: 760,
        paddingleft: 0,
        paddingright: 0,
      });
      const { notes, chords } = mapDrawnNotes(tune, pieces);
      registerNoteElements(notes);
      labelNotes(current, notes, view);
      if (view.mode !== "hidden") drawChordChips(chords, chordFunctions(current));
      const svg = host.querySelector("svg");
      svg?.setAttribute("role", "group");
      svg?.setAttribute("aria-label", `Notation: ${current.title}`);
      const playhead = ui.get().playheadNoteId;
      if (playhead) highlight([playhead], "is-playing");
      drawError = null;
    } catch (error) {
      console.error("Staff failed to draw", error);
      registerNoteElements(new Map());
      drawError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Make each note a keyboard-reachable button with an accessible name. One
   * tab stop for the whole staff (roving tabindex); arrows move between notes.
   * @param {import("../types.js").Song} current
   * @param {Map<string, Element[]>} notes
   * @param {import("./abc.js").StaffView} view
   */
  function labelNotes(current, notes, view) {
    const chordByNote = new Map(current.chords.map((c) => [c.noteId, c]));
    noteButtons = [];
    for (const note of current.notes) {
      const groups = notes.get(note.id) ?? [];
      for (const group of groups) group.setAttribute("data-note-id", note.id);
      const [first] = groups;
      if (!first) continue;
      first.setAttribute("role", "button");
      first.setAttribute("tabindex", noteButtons.length === 0 ? "0" : "-1");
      first.setAttribute(
        "aria-label",
        describeNote(note, chordByNote.get(note.id) ?? null, current.key, view),
      );
      noteButtons.push(first);
    }
  }

  // The reveal: the first time labels turn confirmed, chips and labels grow in.
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
    const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: -1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = noteButtons.at(moves[/** @type {keyof typeof moves} */ (event.key)]);
    if (!next || !(next instanceof SVGElement)) return;
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
    <button type="button" class="print" onclick={() => window.print()}>Print lead sheet</button>
  </div>
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
  .error {
    margin: var(--space-3) 0 0;
    color: var(--fn-dominant);
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

  /* Chord chips: shape + color by function (chordChips.js). */
  .notation :global(.chord-chip),
  .notation :global(.chord-mark) {
    transform-box: fill-box;
    transform-origin: center;
  }
  .mode-confirmed :global(.chord-chip.fn-tonic) {
    fill: var(--fn-tonic);
  }
  .mode-confirmed :global(.chord-chip.fn-subdominant) {
    fill: var(--fn-subdominant);
    stroke: var(--fn-subdominant-edge);
  }
  .mode-confirmed :global(.chord-chip.fn-dominant) {
    fill: var(--fn-dominant);
  }
  .mode-confirmed :global(.chord-chip.fn-other) {
    fill: var(--fn-other);
  }
  .mode-confirmed :global(.fn-tonic:is(.chord-text, .chord-mark)) {
    fill: var(--fn-tonic-ink);
  }
  .mode-confirmed :global(.fn-subdominant:is(.chord-text, .chord-mark)) {
    fill: var(--fn-subdominant-ink);
  }
  .mode-confirmed :global(.fn-dominant:is(.chord-text, .chord-mark)) {
    fill: var(--fn-dominant-ink);
  }
  .mode-confirmed :global(.fn-other.chord-text) {
    fill: var(--fn-other-ink);
  }

  /* Tentative: outlined in the function color, no fill, lighter. */
  .mode-tentative :global(.chord-chip) {
    fill: none;
    stroke-width: var(--tentative-stroke);
    opacity: var(--tentative-opacity);
  }
  .mode-tentative :global(.chord-mark) {
    fill: none;
    stroke-width: 1.5px;
    opacity: var(--tentative-opacity);
  }
  .mode-tentative :global(.fn-tonic:is(.chord-chip, .chord-mark)) {
    stroke: var(--fn-tonic);
  }
  .mode-tentative :global(.fn-subdominant:is(.chord-chip, .chord-mark)) {
    stroke: var(--fn-subdominant-edge);
  }
  .mode-tentative :global(.fn-dominant:is(.chord-chip, .chord-mark)) {
    stroke: var(--fn-dominant);
  }
  .mode-tentative :global(.fn-other:is(.chord-chip, .chord-mark)) {
    stroke: var(--fn-other);
  }
</style>
