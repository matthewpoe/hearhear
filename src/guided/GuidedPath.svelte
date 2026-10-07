<script>
  // The guided demo path (PRD section 8, Stream G): a short, skippable story
  // read from content/guided-path.json. Placed in the masthead, it renders the
  // "Take the guided tour" entry there, a "Show me how" invitation across the
  // top of the empty landing, and, while it runs, the current step in a
  // compact panel docked above the keyboard, clear of the tutor's controls
  // and the chord dropdown, that folds to a chip. It never blocks the app:
  // every step can also be done by hand, a step advances on its own when the
  // app reaches its condition, and the viewer can leave at any time and
  // resume later. It drives the app only through public behavior: the song
  // and ui stores, element ids, buttons by accessible name, and the tutor's
  // ask requests. Beginner tips stay quiet while it runs (ui.guidedActive).
  import { tick, untrack } from "svelte";
  import content from "../../content/guided-path.json";
  import plan from "../../content/lessons/plan.json";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { auditionChord } from "../audio/index.js";
  import { passageAround, voicingIn } from "../chords/passage.js";
  import { DEMO_TUNES } from "../finding/demoTunes.js";
  import { chordFromNumeral } from "../theory/index.js";
  import { requestAsk } from "../tutor/requests.js";
  import {
    clampStep,
    conditionMet,
    hintFor,
    lessonExchange,
    loadProgress,
    noteAt,
    placePanel,
    saveProgress,
    shouldAdvance,
  } from "./steps.js";

  /** @import { Action, GuidedPath } from "./steps.js" */

  const path = /** @type {GuidedPath} */ (content);
  const steps = path.steps;

  /** Lessons recorded by `make capture-lessons`: only these are asked for by name. */
  const RECORDED = new Set(
    Object.keys(import.meta.glob("../../content/lessons/recorded/*.json")).map((file) =>
      file.replace(/^.*\/|\.json$/g, ""),
    ),
  );

  /** What the docked panel must never cover. */
  const AVOID = [
    "#tutor .ask",
    "#tutor .log",
    "#chords [role='dialog']",
    "#key-prompt button",
    "#key-finder button",
    "#staff [aria-label='Playback']",
  ].join(",");

  let running = $state(false);
  let folded = $state(false);
  let index = $state(loadProgress(steps.length));
  /** Replies in the tutor's conversation, counted from its log. */
  let tutorReplies = $state(0);
  /** Whether the current step's condition held last time it was read. */
  let wasMet = false;
  /** @type {HTMLButtonElement | undefined} */
  let entry = $state();
  /** @type {HTMLElement | undefined} */
  let heading = $state();
  /** @type {HTMLElement | undefined} */
  let dock = $state();
  let position = $state({ top: 0, left: 0 });

  const appState = $derived({ song: $song, tutorReplies });
  const step = $derived(steps[index]);
  const met = $derived(conditionMet(step.done, appState));
  const hint = $derived(hintFor(step, appState));
  const last = $derived(index === steps.length - 1);
  const empty = $derived($song.notes.length === 0);
  const resuming = $derived(index > 0);

  // A step advances on its own when the app reaches its condition while it's
  // showing; one already met on arrival waits for Next.
  $effect(() => {
    const now = met;
    const on = running;
    untrack(() => {
      if (on && !last && shouldAdvance(wasMet, now)) go(index + 1);
      else wasMet = now;
    });
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

  // Keep the docked panel clear of the controls it must not cover, as the
  // page scrolls, resizes, and changes (the dropdown opening, a reply
  // arriving). Coalesced to one placement per frame.
  $effect(() => {
    if (!dock) return;
    const panel = dock;
    let frame = 0;
    const place = () => {
      frame = 0;
      const columns = document.querySelector(".workspace .columns")?.getBoundingClientRect();
      const bottom =
        document.querySelector(".keyboard-dock")?.getBoundingClientRect().top ?? innerHeight;
      const size = panel.getBoundingClientRect();
      const avoid = [...document.querySelectorAll(AVOID)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
      const ask = document.querySelector("#tutor .ask")?.getBoundingClientRect() ?? null;
      position = placePanel(
        size,
        {
          left: Math.max(16, columns?.left ?? 16),
          right: Math.min(innerWidth - 16, columns?.right ?? innerWidth - 16),
          bottom: Math.min(bottom, innerHeight),
        },
        avoid,
        ask && ask.height > 0 ? ask : null,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    const sizes = new ResizeObserver(schedule);
    sizes.observe(panel);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      sizes.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  });

  // Leaving the page mid-tour still gives the tips back.
  $effect(() => () => ui.update({ guidedActive: false }));

  /** @param {number} next */
  function go(next) {
    index = clampStep(next, steps.length);
    wasMet = conditionMet(steps[index].done, { song: song.get(), tutorReplies });
    saveProgress(index);
  }

  async function start() {
    go(index);
    folded = false;
    running = true;
    ui.update({ guidedActive: true });
    await tick();
    heading?.focus();
  }

  async function leave() {
    running = false;
    ui.update({ guidedActive: false });
    await tick();
    entry?.focus();
  }

  async function finish() {
    go(0);
    await leave();
  }

  /** @param {boolean} fold */
  async function setFolded(fold) {
    folded = fold;
    await tick();
    if (fold) dock?.querySelector("button")?.focus();
    else heading?.focus();
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
        const button = [...(within?.querySelectorAll("button") ?? [])].find(
          (b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === action.name,
        );
        if (button) button.click();
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

{#if !running}
  <button bind:this={entry} type="button" class="entry" onclick={start}>
    {resuming ? "Resume the guided tour" : "Take the guided tour"}
  </button>
  {#if empty}
    <div class="invite" role="group" aria-label="Guided tour invitation">
      <p>New here? In about two minutes, hear a tune, find its home, and hear a chord land.</p>
      <button type="button" class="primary" onclick={start}>Show me how</button>
    </div>
  {/if}
{:else}
  <section
    bind:this={dock}
    class="dock"
    class:folded
    style:top="{position.top}px"
    style:left="{position.left}px"
    aria-label="Guided tour"
  >
    {#if folded}
      <button type="button" class="chip" aria-expanded="false" onclick={() => setFolded(false)}>
        Guided tour · {index + 1}/{steps.length}
      </button>
    {:else}
      <div class="meta">
        <span class="count">Step {index + 1} of {steps.length}</span>
        <span class="badge" title={path.status}>Draft</span>
        <span class="tools">
          <button type="button" class="link" aria-expanded="true" onclick={() => setFolded(true)}
            >Fold</button
          >
          <button type="button" class="link" onclick={leave}>Leave the tour</button>
        </span>
      </div>
      <div aria-live="polite">
        <h2 id="guided-step-title" tabindex="-1" bind:this={heading}>{step.title}</h2>
        <p>{step.text}</p>
        {#if hint}<p class="hint">{hint}</p>{/if}
        {#if met}<p class="done">
            Done. {last ? "That's the tour." : "On to the next step."}
          </p>{/if}
      </div>
      <div class="actions">
        {#if step.action}
          {@const action = step.action}
          <button type="button" class="primary" onclick={() => tryIt(action)}>{action.label}</button
          >
        {/if}
        <span class="nav">
          <button type="button" disabled={index === 0} onclick={() => go(index - 1)}>Back</button>
          {#if last}
            <button type="button" onclick={finish}>Finish</button>
          {:else}
            <button type="button" onclick={() => go(index + 1)}>Next</button>
          {/if}
        </span>
      </div>
      <p class="status">{path.status}.</p>
    {/if}
  </section>
{/if}

<style>
  button {
    padding: var(--space-1) var(--space-3);
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
  .link {
    border: none;
    background: none;
    text-decoration: underline;
    padding-inline: var(--space-1);
  }
  /* The invitation takes a line of its own in the masthead's wrapping row. */
  .invite {
    flex: 1 0 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  /* Above the chord dropdown and the tips (z-index 10), placed clear of them. */
  .dock {
    position: fixed;
    z-index: 11;
    display: grid;
    gap: var(--space-2);
    width: min(22rem, calc(100vw - 32px));
    padding: var(--space-3);
    border: 2px solid var(--ink);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.15);
  }
  .dock.folded {
    width: auto;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
  }
  .chip {
    border-width: 2px;
    background: var(--surface);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.15);
  }
  p {
    margin: 0;
    font-size: var(--text-sm);
  }
  .invite p {
    font-size: var(--text-md);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }
  .tools {
    display: flex;
    margin-left: auto;
  }
  .badge {
    padding: 0 var(--space-2);
    border: 1px solid var(--ink-muted);
    border-radius: var(--radius-sm);
    color: var(--ink);
  }
  h2 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-md);
    font-weight: 500;
  }
  .hint,
  .done {
    margin-top: var(--space-1);
  }
  .done {
    font-weight: 500;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .nav {
    display: flex;
    gap: var(--space-2);
    margin-left: auto;
  }
  .status {
    color: var(--ink-muted);
  }
  .status::first-letter {
    text-transform: uppercase;
  }
</style>
