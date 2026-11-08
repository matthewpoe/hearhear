<script>
  // Beginner callouts (PRD section 8): plain-words tips from
  // content/callouts.json, one at a time, each beside the element whose id is
  // its anchor, and only while the app is in the state the tip talks about.
  // Renders the "Beginner tips" toggle where it's placed, and the current tip
  // in a fixed layer that follows its anchor on scroll and resize. A tip never
  // takes focus when it appears; it is announced politely and sits in the tab
  // order right after the toggle. Doing what a tip asks counts it as seen; a
  // second click or key press somewhere else folds it into a "Tip" chip by the
  // toggle.
  import { tick, untrack } from "svelte";
  import content from "../../content/callouts.json";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import {
    nextCallout,
    actedOn,
    countAction,
    isActivatingKey,
    dismiss,
    placeCallout,
    scrollForTip,
    isOnScreen,
  } from "./tour.js";
  import { loadOn, saveOn, loadDismissed, saveDismissed } from "./memory.js";

  /** @import { Callout, TourFacts } from "./tour.js" */

  /** @type {Callout[]} */
  const callouts = /** @type {Callout[]} */ (content.callouts);

  /**
   * Controls a tip must never cover: the key question's choices and guess
   * buttons, Play, the masthead toggles (this one included), the music, whose
   * notes are buttons the chords tip tells the viewer to click, the open
   * chord dropdown, and the tutor's heading, question box, and replies.
   */
  const KEEP_CLEAR = [
    "#key-prompt button",
    "#key-prompt label",
    "#staff [aria-label='Playback']",
    "#staff svg",
    ".masthead-tools",
    "#chords [role='dialog']",
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

  /**
   * Whether a callout's subject is in view, so its tip can show on its own.
   * The dock is always in view. The tip Next asked for (`requested`) only
   * needs its subject on the page, since Next scrolls to it.
   * @param {Callout} callout
   */
  function inView(callout) {
    const target = targetOf(callout);
    if (!target) return false;
    if (callout.id === requested) return true;
    return target.closest(".keyboard-dock") !== null || isOnScreen(rectOf(target), visibleArea());
  }

  /** @param {Callout} callout */
  function onPage(callout) {
    return targetOf(callout) !== null;
  }

  ui.update({ calloutsOn: loadOn() });

  let dismissed = $state(loadDismissed());
  /** Closed for this page visit; the next visit picks up where it left off. */
  let closed = $state(false);
  /** Tips folded into the "Tip" chip during this visit, by id. */
  let folded = $state(/** @type {Set<string>} */ (new Set()));
  /** The tip Next went to, which shows while Next scrolls its subject into view. */
  let requested = $state(/** @type {string | null} */ (null));
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
      finderOpen: document.getElementById("key-finder") !== null,
      dropdownOpen: $ui.selectedNoteId !== null,
      chordPlaced: $song.chords.length > 0,
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

  // A tip shows on its own only once its subject is in view; Next goes to the
  // next tip whose subject is anywhere on the page, and scrolls to it.
  // The guided tour hushes the tips while it runs, leaving the toggle as is.
  const current = $derived(
    $ui.calloutsOn && !$ui.guidedActive && !closed ? upNext(dismissed, inView) : null,
  );
  const open = $derived(current !== null && !folded.has(current.id));
  const another = $derived(
    current ? upNext(dismiss(dismissed, current.id), onPage) !== null : false,
  );
  const titleId = $derived(current ? `callout-${current.id}-title` : undefined);

  // Doing what a tip asks (loading a song, playing it, choosing a key,
  // opening the finder or the dropdown) counts it as seen, showing or not.
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
    // Ids too: an anchor can appear by gaining its id, with no new element.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id"],
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

  /** Remember this tip as seen and show the one after it. */
  async function next() {
    if (!current) return;
    dismissed = dismiss(dismissed, current.id);
    saveDismissed(dismissed);
    requested = upNext(dismissed, onPage)?.id ?? null;
    await tick();
    // The viewer asked for the next tip, so take them to it: scroll its
    // anchor into view, as block: "nearest" would, or further when that would
    // leave the tip covering a control. The dock never scrolls, so an anchor
    // in it needs none.
    const anchor = current && open && targetOf(current);
    if (anchor && box && !anchor.closest(".keyboard-dock")) {
      const { viewport, avoid } = measure();
      const { scrollY, innerHeight } = window;
      const room = {
        up: -scrollY,
        down: document.documentElement.scrollHeight - innerHeight - scrollY,
      };
      const top = scrollForTip(rectOf(anchor), box.getBoundingClientRect(), viewport, {
        avoid,
        room,
      });
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (top !== 0) window.scrollBy({ top, behavior: smooth ? "smooth" : "auto" });
    }
    (open ? box : (chip ?? toggle))?.focus({ preventScroll: true });
  }

  /** Remember this tip as seen and put the tips away until the next visit. */
  async function close() {
    if (!current) return;
    const active = document.activeElement;
    const hadFocus = (box?.contains(active) ?? false) || (chip !== undefined && chip === active);
    dismissed = dismiss(dismissed, current.id);
    saveDismissed(dismissed);
    closed = true;
    await tick();
    if (hadFocus) toggle?.focus();
  }

  function toggleTips() {
    const on = !$ui.calloutsOn;
    ui.update({ calloutsOn: on });
    saveOn(on);
    if (on) {
      // Turning tips back on starts the tour over.
      dismissed = new Set();
      saveDismissed(dismissed);
      closed = false;
      folded = new Set();
    }
  }

  /** Open the folded tip again, with focus in it. */
  async function unfold() {
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

  /** Escape closes the tip from inside it, or when nothing else has focus. @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== "Escape" || event.defaultPrevented || !open) return;
    const active = document.activeElement;
    if (active === document.body || box?.contains(active)) {
      event.preventDefault();
      close();
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

{#if current && !open}
  <button
    bind:this={chip}
    type="button"
    class="chip"
    aria-label="Show the tip{current.title ? `: ${current.title}` : ''}"
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
      {#if !current.noNext}
        <div class="actions">
          <button type="button" class="next" onclick={next}>{another ? "Next" : "Got it"}</button>
        </div>
      {/if}
      <button type="button" class="close" aria-label="Close tips" onclick={close}>
        <span aria-hidden="true">×</span>
      </button>
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
    padding: var(--space-3) var(--space-5) var(--space-3) var(--space-3);
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
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-2);
  }
  .next {
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-lg);
    background: var(--ink);
    color: var(--paper);
    cursor: pointer;
  }
  .close {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-muted);
    font-size: var(--text-lg);
    line-height: 1;
    cursor: pointer;
  }
  .close:hover {
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
