<script>
  // The guided demo path (PRD section 8, Stream G): a short, skippable story
  // read from content/guided-path.json, run in a slim strip docked to the top
  // of the keyboard dock. Being part of the dock, it never covers the page:
  // the dock's measured height (--dock-height, the page's scroll padding)
  // includes it. It shows the step's one-line instruction (More opens the
  // full text), Try this, Back, Next or Finish, Fold, and Leave. It never
  // blocks the app: every step can also be done by hand, a step advances on
  // its own when the app reaches its condition, and the viewer can leave at
  // any time and resume later from the masthead (GuidedEntry.svelte). It
  // drives the app only through public behavior: the song and ui stores,
  // element ids, buttons by accessible name, and the tutor's ask requests.
  // Beginner tips stay quiet while it runs (ui.guidedActive, set by tour.js).
  import { tick, untrack } from "svelte";
  import content from "../../content/guided-path.json";
  import plan from "../../content/lessons/plan.json";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { audioStatus, auditionChord } from "../audio/index.js";
  import { passageAround, voicingIn } from "../chords/passage.js";
  import { DEMO_TUNES } from "../finding/demoTunes.js";
  import { chordFromNumeral } from "../theory/index.js";
  import { requestAsk } from "../tutor/requests.js";
  import {
    conditionMet,
    hintFor,
    lessonExchange,
    noteAt,
    shouldAdvance,
    stepTarget,
  } from "./steps.js";
  import { tour, goTo, leaveTour, finishTour } from "./tour.js";

  /** @import { Action, GuidedPath } from "./steps.js" */

  const path = /** @type {GuidedPath} */ (content);
  const steps = path.steps;

  /** Lessons recorded by `make capture-lessons`: only these are asked for by name. */
  const RECORDED = new Set(
    Object.keys(import.meta.glob("../../content/lessons/recorded/*.json")).map((file) =>
      file.replace(/^.*\/|\.json$/g, ""),
    ),
  );

  let folded = $state(false);
  /** A "Try this" press waiting for the piano: the step it was made on, else -1. */
  let waitingAt = $state(-1);
  let more = $state(false);
  /** Replies in the tutor's conversation, counted from its log. */
  let tutorReplies = $state(0);
  /** Play was pressed (the playhead moved) since this song was loaded. */
  let played = $state(false);
  /** The step whose arrival was last seen, and whether its condition held then or since. */
  let arrivedAt = -1;
  let wasMet = false;

  const index = $derived($tour.index);
  const step = $derived(steps[index]);
  const appState = $derived({ song: $song, played, tutorReplies });
  const met = $derived(conditionMet(step.done, appState));
  const hint = $derived(hintFor(step, appState));
  const last = $derived(index === steps.length - 1);

  // A step advances on its own when the app reaches its condition while it's
  // showing; one already met on arrival waits for Next.
  $effect(() => {
    const at = index;
    const now = met;
    const on = $tour.running;
    untrack(() => {
      if (at !== arrivedAt) {
        arrivedAt = at;
        wasMet = now;
        more = false;
      } else if (on && !last && shouldAdvance(wasMet, now)) goTo(at + 1);
      else wasMet = now;
    });
  });

  // Focus follows the tour in and out: to the step when it starts, back to
  // the masthead entry when it ends.
  let wasRunning = false;
  $effect(() => {
    const on = $tour.running;
    untrack(async () => {
      if (on === wasRunning) return;
      wasRunning = on;
      if (on) folded = false;
      await tick();
      document.getElementById(on ? "guided-step-title" : "guided-entry")?.focus();
    });
  });

  // Each step (and a resumed tour) brings what it asks the viewer to use into
  // view above the dock: the song chooser, Play, the key prompt's card, the
  // note on the staff, the tutor's question box. A button's whole card or
  // panel comes with it when that fits, so a step asking for the home chips
  // shows them too. Nothing moves when it's already in view, so pressing
  // Play never nudges the page; a note is centred, leaving room for its
  // chords below it.
  $effect(() => {
    const at = index;
    const on = $tour.running;
    if (!on) return;
    untrack(async () => {
      await tick();
      const target = stepTarget(steps[at], song.get());
      const within = target && document.querySelector(target.selector);
      if (!within) return;
      const button = target.button ? buttonIn(within, target.button) : undefined;
      const el = button && !fitsAboveDock(within) ? button : within;
      if (inViewAboveDock(el)) return;
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        block: target.button ? "nearest" : "center",
        behavior: smooth ? "smooth" : "auto",
      });
    });
  });

  /** The top of the keyboard dock, which the page scrolls above. */
  function dockTop() {
    return document.querySelector(".keyboard-dock")?.getBoundingClientRect().top ?? innerHeight;
  }

  /** @param {Element} el */
  function fitsAboveDock(el) {
    return el.getBoundingClientRect().height <= dockTop();
  }

  /** @param {Element} el */
  function inViewAboveDock(el) {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= dockTop();
  }

  // A press that found its button disabled while the piano loads (the
  // staff's Play) goes through once the piano is ready, and is dropped if the
  // step changes, the tour is left, or the piano fails (the staff then shows Retry).
  $effect(() => {
    const status = $audioStatus;
    const at = waitingAt;
    const on = $tour.running;
    if (at < 0) return;
    if (at !== index || !on || status === "failed") waitingAt = -1;
    else if (status === "ready") {
      waitingAt = -1;
      const action = steps[at].action;
      untrack(async () => {
        await tick();
        if (action?.type === "press" && index === at) tryIt(action);
      });
    }
  });

  $effect(() => {
    void $song.id;
    played = false;
  });
  $effect(() => {
    if ($ui.playheadNoteId !== null) played = true;
  });

  // The tutor step is done once a reply is in the conversation. Finished
  // turns sit in the log list; the one still streaming is marked busy.
  $effect(() => {
    const count = () => {
      tutorReplies = document.querySelectorAll(
        "#tutor ol.log > li.turn.tutor:not([aria-busy])",
      ).length;
    };
    const observer = new MutationObserver(count);
    observer.observe(document.getElementById("tutor") ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
    });
    count();
    return () => observer.disconnect();
  });

  // Leaving the page mid-tour still gives the tips back.
  $effect(() => () => ui.update({ guidedActive: false }));

  /** @param {boolean} fold */
  async function setFolded(fold) {
    folded = fold;
    await tick();
    document.getElementById("guided-fold")?.focus();
  }

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

  /** @param {Action} action */
  function tryIt(action) {
    switch (action.type) {
      case "loadSong": {
        const tune = DEMO_TUNES.find(({ song: t }) => t.id === action.song)?.song;
        if (tune && $song.id !== tune.id) song.open(tune);
        break;
      }
      case "press": {
        const within = document.getElementById(action.within);
        const button = within && buttonIn(within, action.name);
        if (button?.disabled && $audioStatus === "loading") waitingAt = index;
        else if (button) button.click();
        else within?.scrollIntoView({ block: "nearest" });
        break;
      }
      case "openChords": {
        const note = noteAt($song, action.bar, action.beat);
        const el =
          note &&
          document.querySelector(`#staff [role="button"][data-note-id="${CSS.escape(note.id)}"]`);
        if (!(el instanceof SVGElement || el instanceof HTMLElement)) break;
        // As a click on the note would: the chord dropdown opens on it and
        // returns focus there when it closes.
        el.scrollIntoView({ block: "center" });
        el.focus({ preventScroll: true });
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        break;
      }
      case "audition": {
        const current = song.get();
        const note = noteAt(current, action.bar, action.beat);
        const passage = note && passageAround(current, note.id);
        const chord = chordFromNumeral(action.numeral, current.key);
        if (!note || !passage || !chord) break;
        const neighbors =
          ui.get().auditionVoicing === "from-candidate" ? "from-candidate" : "as-song";
        auditionChord(voicingIn(passage, chord), passage.range, {
          atTick: note.start,
          neighbors,
        }).catch((error) => console.warn("Guided tour audition didn't play", error));
        break;
      }
      case "askTutor": {
        const exchange = lessonExchange(plan, action.lesson);
        if (!exchange) break;
        // A recorded lesson replays with no passphrase; one not recorded yet
        // is asked like any question.
        const fixture = RECORDED.has(action.lesson) ? `lesson:${action.lesson}` : "";
        requestAsk({ question: exchange.question, level: exchange.level, fixture });
        document.getElementById("tutor")?.scrollIntoView({ block: "nearest" });
        break;
      }
    }
  }
</script>

{#if $tour.running}
  <section class="strip" class:folded aria-label="Guided tour">
    <div class="row">
      <span class="count">Guided tour · step {index + 1}/{steps.length}</span>
      <span class="badge" title={path.status}>Draft</span>
      <p class="line" class:open={more && !folded} aria-live="polite">
        <strong id="guided-step-title" tabindex="-1">{step.title}:</strong>
        {step.line}
        {#if met}<span class="done">Done.</span>{/if}
      </p>
      {#if !folded}
        <button
          type="button"
          class="link"
          aria-expanded={more}
          aria-controls="guided-more"
          onclick={() => (more = !more)}>{more ? "Less" : "More"}</button
        >
        {#if step.action}
          {@const action = step.action}
          {@const waiting = waitingAt === index}
          <button
            type="button"
            class="primary"
            aria-disabled={waiting}
            onclick={() => !waiting && tryIt(action)}
            >{waiting ? "Loading the piano…" : action.label}</button
          >
        {/if}
        <button type="button" disabled={index === 0} onclick={() => goTo(index - 1)}>Back</button>
        {#if last}
          <button type="button" onclick={finishTour}>Finish</button>
        {:else}
          <button type="button" onclick={() => goTo(index + 1)}>Next</button>
        {/if}
      {/if}
      <button
        id="guided-fold"
        type="button"
        class="link"
        aria-expanded={!folded}
        onclick={() => setFolded(!folded)}>{folded ? "Show" : "Fold"}</button
      >
      <button type="button" class="link" onclick={leaveTour}>Leave</button>
    </div>
    {#if !folded && hint}<p class="hint">{hint}</p>{/if}
    {#if !folded && more}
      <div id="guided-more" class="more">
        <p>{step.text}</p>
        <p class="status">{path.status}.</p>
      </div>
    {/if}
  </section>
{/if}

<style>
  .strip {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-4);
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
  .badge {
    flex: none;
    padding: 0 var(--space-2);
    border: 1px solid var(--ink-muted);
    border-radius: var(--radius-sm);
  }
  p {
    margin: 0;
  }
  /* One line; More shows the whole of it and the step's full text. */
  .line {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line.open {
    white-space: normal;
  }
  strong {
    font-weight: 500;
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
  button:disabled {
    border-color: var(--rule);
    color: var(--ink-muted);
    cursor: default;
  }
  .primary {
    background: var(--ink);
    color: var(--paper);
  }
  .primary[aria-disabled="true"] {
    cursor: progress;
  }
  .link {
    border-color: transparent;
    background: none;
    text-decoration: underline;
    padding-inline: var(--space-1);
  }
  .more {
    display: grid;
    gap: var(--space-1);
    max-width: 60rem;
  }
  .status {
    color: var(--ink-muted);
  }
  .status::first-letter {
    text-transform: uppercase;
  }
  @media (max-width: 40rem) {
    .row {
      flex-wrap: wrap;
    }
    .line {
      flex-basis: 100%;
      order: 1;
    }
  }
</style>
