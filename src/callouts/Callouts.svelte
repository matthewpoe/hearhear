<script>
  // Beginner callouts (PRD section 8): plain-words tips from
  // content/callouts.json, one at a time, each beside the element whose id is
  // its anchor. Renders the "Beginner tips" toggle where it's placed, and the
  // current tip in a fixed layer that follows its anchor on scroll and resize.
  // A tip never takes focus when it appears; it is announced politely and
  // sits in the tab order right after the toggle.
  import { tick } from "svelte";
  import content from "../../content/callouts.json";
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { nextCallout, dismiss, placeCallout } from "./tour.js";
  import { loadOn, saveOn, loadDismissed, saveDismissed } from "./memory.js";

  /** @import { Callout } from "./tour.js" */

  /** @type {Callout[]} */
  const callouts = content.callouts;

  ui.update({ calloutsOn: loadOn() });

  let dismissed = $state(loadDismissed());
  /** Closed for this page visit; the next visit picks up where it left off. */
  let closed = $state(false);
  /** Bumped when the page's elements change, so anchors are looked up again. */
  let pageChanges = $state(0);
  let position = $state({ top: 0, left: 0 });
  /** @type {HTMLElement | undefined} */
  let box = $state();
  /** @type {HTMLButtonElement | undefined} */
  let toggle = $state();

  const labelsHidden = $derived(keyLabelMode($song, $ui) === "hidden");

  /** @param {ReadonlySet<string>} ids */
  function upNext(ids) {
    void pageChanges;
    return nextCallout(callouts, {
      dismissed: ids,
      labelsHidden,
      hasAnchor: (id) => document.getElementById(id) !== null,
    });
  }

  const current = $derived($ui.calloutsOn && !closed ? upNext(dismissed) : null);
  const another = $derived(current ? upNext(dismiss(dismissed, current.id)) !== null : false);
  const titleId = $derived(current ? `callout-${current.id}-title` : undefined);

  // Anchors come and go (the landing leaves once a song loads; other streams'
  // panels mount later). Coalesced to one look-up per frame.
  $effect(() => {
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pageChanges += 1;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  $effect(() => {
    if (!current || !box) return;
    void pageChanges;
    const anchor = document.getElementById(current.anchor);
    const callout = box;
    if (!anchor) return;
    const place = () => {
      position = placeCallout(anchor.getBoundingClientRect(), callout.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
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
    await tick();
    // The viewer asked for the next tip, so take them to it.
    (box ?? toggle)?.focus();
  }

  /** Remember this tip as seen and put the tips away until the next visit. */
  async function close() {
    if (!current) return;
    const hadFocus = box?.contains(document.activeElement) ?? false;
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
    }
  }

  /** Escape closes the tip from inside it, or when nothing else has focus. @param {KeyboardEvent} event */
  function onKeydown(event) {
    if (event.key !== "Escape" || event.defaultPrevented || !current) return;
    const active = document.activeElement;
    if (active === document.body || box?.contains(active)) {
      event.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

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

<p class="visually-hidden" aria-live="polite">
  {#if current}Tip: {current.title ? `${current.title} ` : ""}{current.text}{/if}
</p>

{#if current}
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
      <div class="actions">
        <button type="button" class="next" onclick={next}>{another ? "Next" : "Got it"}</button>
      </div>
      <button type="button" class="close" aria-label="Close tips" onclick={close}>
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  {/key}
{/if}

<style>
  .toggle {
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
    width: min(20rem, calc(100vw - 16px));
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
    .callout {
      animation: none;
    }
    .dot {
      transition: none;
    }
  }
</style>
