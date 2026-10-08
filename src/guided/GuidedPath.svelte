<script>
  // The guided demo path (PRD section 8, Stream G): a short, skippable story
  // read from content/guided-path.json, run in a slim strip docked to the top
  // of the keyboard dock. Being part of the dock, it never covers the page:
  // the dock's measured height (--dock-height, the page's scroll padding)
  // includes it. It teaches the real interface: the strip shows the step's
  // one-line instruction (its action in the accent color), the step count,
  // and Leave lesson (Finish on the last step), and never does
  // a step for the viewer. Instead it spotlights the real control the step
  // asks for (spotlight.js) and scrolls it into view. There is no Next or Back: a step advances only when the app shows
  // it done, and one already done when the tour reaches it is skipped. The
  // viewer can leave at any time and resume later from the masthead
  // (GuidedEntry.svelte). It starts on its own on a first visit (tour.js),
  // without taking focus. It reads the app only through public behavior: the
  // song, ui, input and recorder stores, element ids, buttons by accessible
  // name, and the staff's highlight().
  import { tick, untrack } from "svelte";
  import content from "../../content/guided-path.json";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { DEMO_TUNES, loadDemo } from "../finding/demoTunes.js";
  import { heldNotes } from "../input/liveNotes.js";
  import { heldChord } from "../input/NumberRow.js";
  import { LOWEST, keyBindings } from "../input/keyBindings.js";
  import { recorder } from "../record/tunes.js";
  import { midiToDegree } from "../theory/index.js";
  import { conditionMet, hintFor, pushDegree, stepTarget } from "./steps.js";
  import { tour, goTo, leaveTour, finishTour, autoStart } from "./tour.js";
  import { actionParts, pageFacts } from "./actions.js";
  import { spotlight, spotlightNote } from "./spotlight.js";
  import { stepLesson } from "../tutor/requests.js";

  /** @import { GuidedPath } from "./steps.js" */

  const path = /** @type {GuidedPath} */ (content);
  const steps = path.steps;
  /** The tour's tune, as a demo loads it. */
  const tourTune = DEMO_TUNES.find(({ song: t }) => t.id === path.song)?.song;

  /** Play was pressed (the playhead moved) since this song was loaded. */
  let played = $state(false);
  /**
   * A tune was loaded since this run of the tour started, so a fresh tour
   * starts at step 1 even with the tune already on the staff. Resuming
   * mid-tour never looks at it: the load step is behind.
   */
  let loadedThisTour = $state(false);
  /** The song when this run started, to tell a load since then. */
  let songAtStart = /** @type {unknown} */ (null);
  let watchingRun = false;
  /** @type {HTMLElement | undefined} */
  let strip = $state();
  /** Bumped when the page changes, so page facts are read again. */
  let pageChanges = $state(0);
  /** Scale degrees of the last notes played, for `degrees` conditions. */
  let recentDegrees = $state(/** @type {number[]} */ ([]));
  /** Facts read from the page: name to selector (content/guided-path.json). */
  const pageSelectors = /** @type {Record<string, string>} */ (content.pageFacts ?? {});

  /** What the fact conditions read: the stores, then the page. */
  const facts = $derived.by(() => {
    void pageChanges;
    return {
      keyCommitted: $song.notes.length > 0 && !$song.key.provisional,
      transposed:
        tourTune !== undefined &&
        $song.id === tourTune.id &&
        $song.notes.length > 0 &&
        $song.notes[0].midi !== tourTune.notes[0]?.midi,
      recordStarted: $recorder.status === "armed" || $recorder.status === "recording",
      ...pageFacts(pageSelectors, (selector) => document.querySelector(selector) !== null),
    };
  });

  const index = $derived($tour.index);
  const step = $derived(steps[index]);
  const appState = $derived({
    song: $song,
    played,
    loadedThisTour,
    recentDegrees,
    facts,
  });
  const met = $derived(conditionMet(step.done, appState));
  /**
   * Another song is on the staff mid-walk (the song select, or a recording):
   * every step after the first is about the tour's tune, so the strip asks
   * for it back and spotlights the song select rather than a silent step.
   */
  const offSong = $derived(index > 0 && $song.id !== path.song);
  const hint = $derived(
    offSong
      ? `[[Load ${tourTune?.title ?? "the tune"}]] again to keep going.`
      : hintFor(step, appState),
  );
  const last = $derived(index === steps.length - 1);

  // Doing a step's action is the only way forward: the step advances once
  // the app shows it done, and one already done when the tour reaches it
  // (a key already chosen, a chord already placed) is skipped. The last step
  // stays until Finish, which it always offers, so a tutor that can't reply
  // never strands it. If focus was in the strip, or had dropped to the page,
  // it moves to the new step's heading.
  $effect(() => {
    const at = index;
    if (!$tour.running || last || !met) return;
    untrack(async () => {
      const active = document.activeElement;
      const inStrip = active === document.body || (strip?.contains(active) ?? false);
      goTo(at + 1);
      await tick();
      // Not before the visitor has done anything: a first visit opens its tune
      // by itself, and focus moved then would show a stray ring.
      const acted = navigator.userActivation?.hasBeenActive ?? true;
      if (acted && inStrip && !strip?.contains(document.activeElement)) {
        document.getElementById("guided-step-title")?.focus({ preventScroll: true });
      }
    });
  });

  // A new run starts with no tune loaded for it; a song that changes while it
  // runs (a card on the welcome, or the song select) counts as loaded, and
  // resets Play, so the next step asks for it again. A fresh run always gets
  // the tour's tune bare (no key, no chords): one already open is reloaded at
  // the start, and a saved copy the song list brings back is reloaded too.
  $effect(() => {
    const now = $song;
    const on = $tour.running;
    untrack(() => {
      if (on !== watchingRun) {
        watchingRun = on;
        songAtStart = now;
        // Cleared when a run ends too, so the next run's first check (which
        // may come before this effect) never sees the last run's load.
        loadedThisTour = false;
        if (on && index === 0 && tourTune && now.id === tourTune.id) loadDemo(tourTune);
        return;
      }
      if (on && !loadedThisTour && now !== songAtStart) {
        loadedThisTour = true;
        played = false;
        const used = !now.key.provisional || now.chords.length > 0;
        if (index === 0 && tourTune && now.id === tourTune.id && used) loadDemo(tourTune);
      }
    });
  });

  // Focus follows the walkthrough in and out when the viewer asked for it:
  // to the step when "Guided lesson" starts it, and back to that button when
  // it ends from the strip (focus was in it, so it dropped to the page).
  // Starting on its own on a first visit takes no focus, and neither does
  // ending because the viewer pressed Record.
  let wasRunning = false;
  $effect(() => {
    const on = $tour.running;
    const take = $tour.focus;
    untrack(async () => {
      if (on === wasRunning) return;
      wasRunning = on;
      await tick();
      if (on && !take) return;
      if (!on && document.activeElement !== document.body) return;
      document.getElementById(on ? "guided-step-title" : "guided-entry")?.focus();
    });
  });

  // A step that names a recorded lesson: the viewer's question replays it,
  // so the tutor answers during the walkthrough without the access code.
  $effect(() => {
    stepLesson.set($tour.running && step.lesson ? `lesson:${step.lesson}` : "");
    return () => stepLesson.set("");
  });

  // The closing line isn't a step to complete: doing its action (pressing
  // Record) ends the walkthrough, as Finish does.
  $effect(() => {
    if ($tour.running && step.sendOff && met) untrack(finishTour);
  });

  // The scale degrees of the notes played, from the number row or the piano,
  // for "press 3 3 4 5". A chord from the A–J row isn't a note.
  $effect(() => {
    /** @type {ReadonlySet<number>} */
    let before = new Set();
    return heldNotes.subscribe((now) => {
      const added = [...now].filter((midi) => !before.has(midi));
      before = now;
      if (added.length !== 1 || untrack(() => $heldChord) !== null) return;
      recentDegrees = pushDegree(recentDegrees, midiToDegree(added[0], song.get().key));
    });
  });

  // A first visit starts the walkthrough on its own.
  $effect(() => untrack(autoStart));

  // Page facts (an open details, say) can change with no store change: look
  // again on attribute and child changes, one look per frame.
  $effect(() => {
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pageChanges += 1;
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "hidden", "aria-expanded", "aria-pressed"],
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  /**
   * The real control a step asks for, on the page now: the element to ring
   * and scroll to, more elements to ring with it (the piano keys), and for a
   * note its id (the staff rings it itself).
   * @param {number} at
   * @returns {{ el: Element | null, more?: Element[], noteId?: string }}
   */
  function targetOf(at) {
    const offTune = at > 0 && song.get().id !== path.song;
    const target = offTune ? { songId: path.song } : stepTarget(steps[at], song.get());
    if (!target) return { el: null };
    if (target.codes) {
      // The piano's keys run from LOWEST up, one button each.
      const keys = document.querySelectorAll("#piano button.key");
      const now = ui.get();
      const els = [...keyBindings(song.get().key, now.windowOctave, now.bottomRow)]
        .filter(([, b]) => b.modifier !== "shift" && target.codes?.includes(b.code))
        .map(([midi]) => keys[midi - LOWEST])
        .filter((el) => el !== undefined);
      return { el: els[0] ?? null, more: els.slice(1) };
    }
    if (target.songId) {
      const title = DEMO_TUNES.find(({ song: t }) => t.id === target.songId)?.song.title ?? "";
      const card = [...document.querySelectorAll("#song-chooser button")].find((b) =>
        (b.textContent ?? "").includes(title),
      );
      return { el: card ?? document.getElementById("song-select") };
    }
    if (target.noteId) {
      const el = document.querySelector(
        `#staff [role="button"][data-note-id="${CSS.escape(target.noteId)}"]`,
      );
      return { el, noteId: target.noteId };
    }
    const within = target.selector ? document.querySelector(target.selector) : null;
    if (within && target.button) return { el: buttonIn(within, target.button) ?? within };
    return { el: within };
  }

  // The step's target wears the spotlight while the step is current. Looked
  // up again a frame after any song or view change, since the welcome gives
  // way to the song select and keys move. A note's ring is a staff mark, so
  // it survives redraws this effect never hears about (spotlight.js).
  $effect(() => {
    const at = index;
    const on = $tour.running;
    void $song;
    void $ui;
    if (!on) return;
    let undo = () => {};
    const frame = requestAnimationFrame(() => {
      const { el, more = [], noteId } = targetOf(at);
      if (noteId) undo = spotlightNote(noteId);
      else {
        const undos = [el, ...more].flatMap((e) => (e ? [spotlight(e)] : []));
        undo = () => undos.forEach((u) => u());
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      undo();
    };
  });

  // Each step (and a resumed tour) brings its target into view above the
  // dock, with block "nearest"; nothing moves when it's already in view.
  $effect(() => {
    const at = index;
    const on = $tour.running;
    if (!on) return;
    untrack(async () => {
      await tick();
      const { el } = targetOf(at);
      if (!el || inViewAboveDock(el)) return;
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    });
  });

  // The strip arrives with a brief accent wash when the tour starts or moves
  // on, so it's easy to spot in the dock; skipped under reduced motion.
  $effect(() => {
    void index;
    const el = strip;
    if (!el || !$tour.running) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const soft = getComputedStyle(el).getPropertyValue("--accent-soft").trim();
    const surface = getComputedStyle(el).getPropertyValue("--surface").trim();
    if (!soft || !surface) return;
    el.animate(
      [
        { backgroundColor: soft, transform: "translateY(4px)" },
        { backgroundColor: surface, transform: "none" },
      ],
      { duration: 900, easing: "ease-out" },
    );
  });

  /** The top of the keyboard dock, which the page scrolls above. */
  function dockTop() {
    return document.querySelector(".keyboard-dock")?.getBoundingClientRect().top ?? innerHeight;
  }

  /** @param {Element} el */
  function inViewAboveDock(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= dockTop();
  }

  // Only a new song resets it (the song store changes on every edit).
  const songId = $derived($song.id);
  $effect(() => {
    void songId;
    played = false;
  });
  $effect(() => {
    if ($ui.playheadNoteId !== null) played = true;
  });

  /**
   * A button by its accessible name (aria-label or text) inside an element.
   * @param {Element} within
   * @param {string} name
   */
  function buttonIn(within, name) {
    return [...within.querySelectorAll("button")].find(
      (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name,
    );
  }
</script>

<!-- Always on the page, so the walkthrough starting on its own, each new
     step, and each hint are announced. -->
<div aria-live="polite">
  {#if $tour.running}
    <section class="strip" aria-label="Guided lesson" bind:this={strip}>
      <div class="row">
        <span class="count"
          >{step.sendOff
            ? "Guided lesson · done"
            : `Guided lesson · step ${index + 1}/${steps.filter((s) => !s.sendOff).length}`}</span
        >
        <p class="line">
          <strong id="guided-step-title" tabindex="-1">{step.title}:</strong>
          {#each actionParts(step.line) as part, i (i)}{#if part.act}<strong class="act"
                >{part.text}</strong
              >{:else}{part.text}{/if}{/each}
          {#if met}<span class="done">Done.</span>{/if}
        </p>
        {#if last}
          <button type="button" class={met ? "primary" : "link"} onclick={finishTour}>Finish</button
          >
        {:else}
          <button type="button" class="link" onclick={leaveTour}>Leave lesson</button>
        {/if}
      </div>
      {#if hint}<p class="hint">
          {#each actionParts(hint) as part, i (i)}{#if part.act}<strong class="act"
                >{part.text}</strong
              >{:else}{part.text}{/if}{/each}
        </p>{/if}
    </section>
  {/if}
</div>

<style>
  .strip {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-4);
    /* A violet band, so the strip reads as the tour's, not the piano's. */
    border-top: 3px solid var(--accent);
    border-bottom: 1px solid var(--rule);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .count {
    flex: none;
    color: var(--ink-muted);
  }
  p {
    margin: 0;
  }
  /* One line: the instruction is kept short enough to fit. */
  .line {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    font-weight: 500;
  }
  /* The spotlight on the real control a step asks for (spotlight.js): a
     violet ring, an outline so it never moves the layout; on a staff note, a
     stroke around the notehead. Global, since the controls are elsewhere. */
  :global([data-spotlight]) {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    animation: -global-spotlight 1.6s var(--ease) infinite alternate;
  }
  :global(#staff .spotlight .abcjs-notehead) {
    stroke: var(--accent);
    stroke-width: 6px;
    paint-order: stroke;
    animation: -global-spotlight-note 1.6s var(--ease) infinite alternate;
  }
  @keyframes -global-spotlight {
    to {
      outline-offset: 6px;
      outline-color: transparent;
    }
  }
  @keyframes -global-spotlight-note {
    to {
      stroke-width: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global([data-spotlight]),
    :global(#staff .spotlight .abcjs-notehead) {
      animation: none;
    }
  }
  /* The step's action: the accent is what you do. */
  .act {
    color: var(--accent);
    font-weight: 600;
  }
  .done {
    font-weight: 500;
  }
  button {
    flex: none;
    padding: 2px var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  .primary {
    background: var(--ink);
    color: var(--paper);
  }
  .link {
    border-color: transparent;
    background: none;
    text-decoration: underline;
    padding-inline: var(--space-1);
  }
  @media (max-width: 40rem) {
    .row {
      flex-wrap: wrap;
    }
    .line {
      flex-basis: 100%;
      order: 1;
      white-space: normal;
    }
  }
</style>
