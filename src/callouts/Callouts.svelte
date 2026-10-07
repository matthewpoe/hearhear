<script>
  // Beginner callouts (PRD section 8): plain-words tips from
  // content/callouts.json, one at a time, each beside the element whose id is
  // its anchor, and only while the app is in the state the tip talks about.
  // Renders the "Beginner tips" toggle where it's placed, and the current tip
  // in a fixed layer that follows its anchor on scroll and resize. A tip never
  // takes focus when it appears; it is announced politely and sits in the tab
  // order right after the toggle. Each tip asks for one action, and doing it
  // is the only way forward: there is no Next. A second click or key press
  // somewhere else, or Escape, folds it into a "Tip" chip by the toggle;
  // "Turn tips off" in the tip is the way out.
  import { tick, untrack } from "svelte";
  import content from "../../content/callouts.json";
  import { heldNotes } from "../input/liveNotes.js";
  import { heldChord } from "../input/NumberRow.js";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import {
    nextCallout,
    actedOn,
    countAction,
    isActivatingKey,
    dismiss,
    pageFacts,
    placeCallout,
    isOnScreen,
    WATCHED_ATTRIBUTES,
  } from "./tour.js";
  import { loadOn, saveOn, loadDismissed, saveDismissed } from "./memory.js";

  /** @import { Callout, TourFacts } from "./tour.js" */

  /** @type {Callout[]} */
  const callouts = /** @type {Callout[]} */ (content.callouts);
  /** Facts read from the page: name to selector (content/callouts.json). */
  const pageSelectors = /** @type {Record<string, string>} */ (content.pageFacts);

  /**
   * Controls a tip must never cover: the song list, the key question's
   * choices and guess buttons, Play, the masthead toggles (this one
   * included), the music, whose notes are buttons the chords tip tells the
   * viewer to click, the open chord dropdown, "Change key or transpose", and
   * the tutor's heading, question box, and replies.
   */
  const KEEP_CLEAR = [
    "#song-chooser button",
    "#key-prompt button",
    "#key-prompt label",
    "#staff [aria-label='Playback']",
    "#staff svg",
    ".masthead-tools",
    "#chords [role='dialog']",
    "#toolbar summary",
    "#tutor > h2",
    "#tutor .log",
    "#tutor .ask",
  ].join(",");

  /**
   * The element a callout points at: its anchor, or the part inside it.
   * @param {Callout} callout
   * @returns {Element | null}
   */
  function targetOf(callout) {
    const anchor = document.getElementById(callout.anchor);
    return callout.part ? (anchor?.querySelector(callout.part) ?? null) : anchor;
  }

  /**
   * An element's viewport box as a plain object (a DOMRect's fields are
   * getters, so spreading one copies nothing).
   * @param {Element} el
   */
  function rectOf(el) {
    const { top, left, bottom, right } = el.getBoundingClientRect();
    return { top, left, bottom, right };
  }

  /** The visible area: the window, down to the top of the keyboard dock. */
  function visibleArea() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      bottom: document.querySelector(".keyboard-dock")?.getBoundingClientRect().top,
    };
  }

  /** The visible area and the controls to keep clear. */
  function measure() {
    return {
      viewport: visibleArea(),
      avoid: [...document.querySelectorAll(KEEP_CLEAR)].map(rectOf),
    };
  }

  /** @param {Callout} callout */
  function onPage(callout) {
    return targetOf(callout) !== null;
  }

  /**
   * Whether a callout's subject is in view, so its tip can show. The dock is
   * always in view.
   * @param {Callout} callout
   */
  function inView(callout) {
    const target = targetOf(callout);
    if (!target) return false;
    return target.closest(".keyboard-dock") !== null || isOnScreen(rectOf(target), visibleArea());
  }

  ui.update({ calloutsOn: loadOn() });

  /** Tips done: the user did what they ask. */
  let dismissed = $state(loadDismissed());
  /** Tips folded into the "Tip" chip during this visit, by id. */
  let folded = $state(/** @type {Set<string>} */ (new Set()));
  /** Actions elsewhere since the current tip appeared or was unfolded. */
  let elsewhere = 0;
  /** Bumped when the page's elements change or it scrolls, so anchors are looked up again. */
  let pageChanges = $state(0);
  let position = $state({ top: 0, left: 0 });
  /** @type {HTMLElement | undefined} */
  let box = $state();
  /** @type {HTMLButtonElement | undefined} */
  let toggle = $state();
  /** @type {HTMLButtonElement | undefined} */
  let chip = $state();

  const labelsHidden = $derived(keyLabelMode($song, $ui) === "hidden");

  /** @type {TourFacts} */
  const facts = $derived.by(() => {
    void pageChanges;
    return {
      songLoaded: $song.notes.length > 0,
      keyChosen: !$song.key.provisional,
      playing: $ui.playheadNoteId !== null,
      notePlaying: $heldNotes.size > 0 && $heldChord === null,
      chordKeyHeld: $heldChord !== null,
      chordRow: $ui.bottomRow === "chords",
      dropdownOpen: $ui.selectedNoteId !== null,
      chordPlaced: $song.chords.length > 0,
      ...pageFacts(pageSelectors, (selector) => document.querySelector(selector) !== null),
    };
  });

  /**
   * @param {ReadonlySet<string>} ids
   * @param {(callout: Callout) => boolean} hasAnchor
   */
  function upNext(ids, hasAnchor) {
    void pageChanges;
    return nextCallout(callouts, { dismissed: ids, labelsHidden, facts, hasAnchor });
  }

  // A tip shows once its subject is in view. The guided tour hushes the tips
  // while it runs, leaving the toggle as is.
  const current = $derived($ui.calloutsOn && !$ui.guidedActive ? upNext(dismissed, inView) : null);
  const open = $derived(current !== null && !folded.has(current.id));
  // The next tip whose subject is on the page but scrolled out of view (the
  // tutor, once "Change key or transpose" opens above it). It waits behind
  // the chip, which scrolls to it, so the tour never stalls out of sight.
  const waiting = $derived(
    $ui.calloutsOn && !$ui.guidedActive && current === null ? upNext(dismissed, onPage) : null,
  );
  const chipFor = $derived(current && !open ? current : waiting);
  const titleId = $derived(current ? `callout-${current.id}-title` : undefined);

  // Doing what a tip asks (loading a song, playing it, opening the finder,
  // playing a note, opening the dropdown...) finishes it, showing or not.
  // Nothing else does.
  $effect(() => {
    if (!$ui.calloutsOn) return;
    const seen = untrack(() => dismissed);
    const done = actedOn(callouts, facts).filter((id) => !seen.has(id));
    if (done.length === 0) return;
    dismissed = dismiss(seen, ...done);
    saveDismissed(dismissed);
  });

  // Each tip starts with a clean count of actions elsewhere.
  $effect(() => {
    void current?.id;
    elsewhere = 0;
  });

  // Anchors come and go (the landing leaves once a song loads; the key
  // finder opens and closes) and scroll in and out of view. Coalesced to one
  // look-up per frame.
  $effect(() => {
    let frame = 0;
    const lookAgain = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pageChanges += 1;
      });
    };
    const observer = new MutationObserver(lookAgain);
    // Some attributes too: an anchor can appear by gaining its id, and a page
    // fact can flip with one (a details element opening).
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRIBUTES,
    });
    // The first look-up ran before the layout was attached to the document, so
    // every anchor was missing; look again now that it is. Untracked, so this
    // effect doesn't depend on the counter it bumps.
    untrack(() => {
      pageChanges += 1;
    });
    window.addEventListener("scroll", lookAgain, { capture: true, passive: true });
    window.addEventListener("resize", lookAgain);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", lookAgain, { capture: true });
      window.removeEventListener("resize", lookAgain);
      cancelAnimationFrame(frame);
    };
  });

  $effect(() => {
    if (!current || !box) return;
    void pageChanges;
    const anchor = targetOf(current);
    const callout = box;
    if (!anchor) return;
    const place = () => {
      const { viewport, avoid } = measure();
      position = placeCallout(rectOf(anchor), callout.getBoundingClientRect(), viewport, {
        avoid,
        inDock: anchor.closest(".keyboard-dock") !== null,
      });
    };
    place();
    // Capture, so scrolling inside any panel moves the tip with its anchor.
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  });

  /**
   * The tip's way out: turn tips off, as the masthead toggle does. The tip
   * is not done, so turning tips back on shows it again.
   */
  async function turnOff() {
    ui.update({ calloutsOn: false });
    saveOn(false);
    await tick();
    toggle?.focus();
  }

  /** Fold the open tip into the "Tip" chip, without finishing it. */
  async function fold() {
    if (!current) return;
    const hadFocus = box?.contains(document.activeElement) ?? false;
    folded = new Set([...folded, current.id]);
    await tick();
    if (hadFocus) chip?.focus();
  }

  function toggleTips() {
    const on = !$ui.calloutsOn;
    ui.update({ calloutsOn: on });
    saveOn(on);
    if (on) {
      // Turning tips back on starts the tour over.
      dismissed = new Set();
      saveDismissed(dismissed);
      folded = new Set();
    }
  }

  /** Open the folded tip again, with focus in it. */
  async function unfold() {
    if (waiting) {
      // Bring the waiting tip's subject into view; its tip then shows there.
      targetOf(waiting)?.scrollIntoView({ block: "center" });
      pageChanges += 1;
    }
    const id = current?.id;
    folded = new Set([...folded].filter((other) => other !== id));
    elsewhere = 0;
    await tick();
    box?.focus({ preventScroll: true });
  }

  /**
   * Count a click, tap, or key press that activates something against the
   * open tip. One on the tip, its subject (the anchor element), or the tips
   * toggle is free; the second one anywhere else folds the tip into the chip.
   * Moving focus alone doesn't count, so Tab can reach a tip's subject.
   * @param {EventTarget | null} target
   */
  function onAction(target) {
    if (!current || !open || !(target instanceof Node)) return;
    const subject = document.getElementById(current.anchor);
    const onSubject = [box, subject, toggle].some((el) => el?.contains(target) ?? false);
    const counted = countAction(elsewhere, onSubject);
    elsewhere = counted.elsewhere;
    if (counted.fold) folded = new Set([...folded, current.id]);
  }

  /** @param {PointerEvent} event */
  function onPointerdown(event) {
    onAction(event.target);
  }

  /** @param {KeyboardEvent} event */
  function onKeyAction(event) {
    if (isActivatingKey(event.key)) onAction(document.activeElement);
  }

  /** Escape folds the tip from inside it, or when nothing else has focus. @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== "Escape" || event.defaultPrevented || !open) return;
    const active = document.activeElement;
    if (active === document.body || box?.contains(active)) {
      event.preventDefault();
      fold();
    }
  }
</script>

<svelte:window
  onkeydown={onKeydown}
  onkeydowncapture={onKeyAction}
  onpointerdowncapture={onPointerdown}
/>

<button
  bind:this={toggle}
  type="button"
  class="toggle"
  aria-pressed={$ui.calloutsOn}
  onclick={toggleTips}
>
  <span class="dot" aria-hidden="true"></span>
  Beginner tips
</button>

{#if chipFor}
  <button
    bind:this={chip}
    type="button"
    class="chip"
    aria-label="Show the tip: {chipFor.title}"
    onclick={unfold}
  >
    Tip
  </button>
{/if}

<p class="visually-hidden" aria-live="polite">
  {#if current && open}Tip: {current.title
      ? `${current.title} `
      : ""}{current.text}{:else if current && folded.has(current.id)}Tip folded; press Tip to show
    it again.{/if}
</p>

{#if current && open}
  {#key current.id}
    <aside
      bind:this={box}
      class="callout"
      style:top="{position.top}px"
      style:left="{position.left}px"
      aria-labelledby={current.title ? titleId : undefined}
      aria-label={current.title ? undefined : "Beginner tip"}
      tabindex="-1"
    >
      {#if current.title}<h2 id={titleId}>{current.title}</h2>{/if}
      <p>{current.text}</p>
      <button type="button" class="off" onclick={turnOff}>Turn tips off</button>
    </aside>
  {/key}
{/if}

<style>
  .toggle,
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .chip {
    border: 2px solid var(--ink);
    animation: appear var(--dur-land) var(--ease);
  }
  .dot {
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid var(--ink);
    border-radius: 50%;
    transition: background var(--dur-fast) var(--ease);
  }
  [aria-pressed="true"] .dot {
    background: var(--ink);
  }
  .callout {
    position: fixed;
    z-index: 10;
    width: min(22rem, calc(100vw - 16px));
    padding: var(--space-3) var(--space-3) var(--space-1);
    border: 2px solid var(--ink);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    animation: appear var(--dur-land) var(--ease);
  }
  h2 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-md);
    font-weight: 500;
  }
  p {
    margin: 0;
    font-size: var(--text-sm);
  }
  /* The quiet way out: a small link-style button under the text. */
  .off {
    display: block;
    margin: var(--space-1) 0 0 auto;
    padding: var(--space-1) 0;
    border: none;
    background: none;
    color: var(--ink-muted);
    font: inherit;
    font-size: var(--text-sm);
    text-decoration: underline;
    cursor: pointer;
  }
  .off:hover {
    color: var(--ink);
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .callout,
    .chip {
      animation: none;
    }
    .dot {
      transition: none;
    }
  }
</style>
