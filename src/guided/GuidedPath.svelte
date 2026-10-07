<script>
  // The guided demo path (PRD section 8, Stream G): a short, skippable story
  // read from content/guided-path.json. Placed in the masthead, it renders the
  // "Take the guided tour" entry there, a "Show me how" invitation across the
  // top of the empty landing, and, while it runs, the current step as a strip
  // under the masthead. It never blocks the app: every step can also be done
  // by hand, a step advances on its own when the app reaches its condition,
  // and the viewer can leave at any time and resume later. It drives the app
  // only through public behavior: the song and ui stores, element ids, and
  // buttons by accessible name. Beginner tips stay quiet while it runs.
  import { tick, untrack } from "svelte";
  import content from "../../content/guided-path.json";
  import plan from "../../content/lessons/plan.json";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { auditionChord } from "../audio/index.js";
  import { passageAround, voicingIn } from "../chords/passage.js";
  import { DEMO_TUNES } from "../finding/demoTunes.js";
  import { chordFromNumeral } from "../theory/index.js";
  import {
    clampStep,
    conditionMet,
    hintFor,
    lessonQuestion,
    loadProgress,
    noteAt,
    saveProgress,
    shouldAdvance,
  } from "./steps.js";

  /** @import { Action, GuidedPath } from "./steps.js" */

  const path = /** @type {GuidedPath} */ (content);
  const steps = path.steps;

  let running = $state(false);
  let index = $state(loadProgress(steps.length));
  /** Replies in the tutor's conversation, counted from its log. */
  let tutorReplies = $state(0);
  /** Whether the current step's condition held last time it was read. */
  let wasMet = false;
  /** Tips were on when the tour started, so leaving turns them back on. */
  let tipsWereOn = false;
  /** @type {HTMLButtonElement | undefined} */
  let entry = $state();
  /** @type {HTMLElement | undefined} */
  let heading = $state();

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

  // Leaving the page mid-tour still gives the tips back.
  $effect(() => () => {
    if (running) restoreTips();
  });

  /** @param {number} next */
  function go(next) {
    index = clampStep(next, steps.length);
    wasMet = conditionMet(steps[index].done, { song: song.get(), tutorReplies });
    saveProgress(index);
  }

  async function start() {
    tipsWereOn = ui.get().calloutsOn;
    // In memory only: the viewer's saved tips setting stays as they left it.
    if (tipsWereOn) ui.update({ calloutsOn: false });
    go(index);
    running = true;
    await tick();
    heading?.focus();
  }

  function restoreTips() {
    if (tipsWereOn && !ui.get().calloutsOn) ui.update({ calloutsOn: true });
  }

  async function leave() {
    running = false;
    restoreTips();
    await tick();
    entry?.focus();
  }

  async function finish() {
    go(0);
    await leave();
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
        const question = lessonQuestion(plan, action.lesson);
        const box = document.getElementById("tutor-question");
        const tutor = document.getElementById("tutor");
        if (!question || !(box instanceof HTMLTextAreaElement) || !tutor) break;
        // The tutor panel binds its text box to input events.
        box.value = question;
        box.dispatchEvent(new Event("input", { bubbles: true }));
        const ask = [...tutor.querySelectorAll("button")].find(
          (b) => b.textContent?.trim() === "Ask",
        );
        ask?.click();
        tutor.scrollIntoView({ block: "nearest" });
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
    <div class="strip invite" role="group" aria-label="Guided tour invitation">
      <p>New here? In about two minutes, hear a tune, find its home, and hear a chord land.</p>
      <button type="button" class="primary" onclick={start}>Show me how</button>
    </div>
  {/if}
{:else}
  <section class="strip tour" aria-labelledby="guided-step-title">
    <div class="meta">
      <span class="count">Guided tour · Step {index + 1} of {steps.length}</span>
      <span class="badge" title={path.status}>Draft</span>
      <button type="button" class="link" onclick={leave}>Leave the tour</button>
    </div>
    <div aria-live="polite">
      <h2 id="guided-step-title" tabindex="-1" bind:this={heading}>{step.title}</h2>
      <p>{step.text}</p>
      {#if hint}<p class="hint">{hint}</p>{/if}
      {#if met}<p class="done">Done. {last ? "That's the tour." : "On to the next step."}</p>{/if}
    </div>
    <div class="actions">
      {#if step.action}
        {@const action = step.action}
        <button type="button" class="primary" onclick={() => tryIt(action)}>{action.label}</button>
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
  /* The strips take a line of their own in the masthead's wrapping row. */
  .strip {
    flex: 1 0 100%;
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .invite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  p {
    margin: 0;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }
  .meta .link {
    margin-left: auto;
    color: var(--ink);
  }
  .badge {
    padding: 0 var(--space-2);
    border: 1px solid var(--ink-muted);
    border-radius: var(--radius-sm);
    color: var(--ink);
    font-size: var(--text-sm);
  }
  h2 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .hint,
  .done {
    margin-top: var(--space-1);
    font-size: var(--text-sm);
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
  .status::first-letter {
    text-transform: uppercase;
  }
  .status {
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }
</style>
