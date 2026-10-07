<script>
  // The tutor conversation under the chord grid. Each send carries a fresh
  // snapshot of the song, the question, and the session's recent history. The
  // reply streams in as plain text; its suggestions are re-validated against
  // the song they were made for, then handed to the chord row (Stream D2) as
  // alternatives to audition. Nothing here changes the song.
  import { song } from "../store/song.js";
  import { untrack } from "svelte";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { suggestions, isStale } from "../store/suggestions.js";
  import { toTutorSnapshot } from "../store/snapshot.js";
  import { askTutor, TutorError } from "./client.js";
  import { checkSuggestions } from "./validate.js";
  import { failureText, canRetry } from "./failures.js";

  /** @import { HintLevel, Turn } from "./client.js" */

  /** The request schema's cap on history turns and on each turn's text. */
  const MAX_TURNS = 12;
  const MAX_TURN_CHARS = 4000;
  const MAX_QUESTION_CHARS = 1000;

  /** @type {Record<HintLevel, string>} */
  const LEVEL_NAMES = { nudge: "Nudge", comparison: "Options", answer: "Answer" };

  /** @typedef {Turn & { level?: HintLevel }} LoggedTurn */

  let question = $state("");
  /** Every turn this session, for display; the request sends the last 12. */
  let log = $state(/** @type {LoggedTurn[]} */ ([]));
  /** @type {"idle" | "loading" | "failed"} */
  let status = $state("idle");
  /** The exchange in flight (or the one that failed), shown below the log. */
  let pending = $state(
    /** @type {{ question: string | null, level: HintLevel, reply: string } | null} */ (null),
  );
  let failureCode = $state("");
  /** @type {AbortController | null} */
  let controller = null;
  /** @type {HTMLTextAreaElement | undefined} */
  let textarea = $state();

  const hasReply = $derived(log.some((turn) => turn.role === "tutor"));
  /** A reply has arrived and nothing has been asked since. */
  const replied = $derived(status === "idle" && hasReply);
  const offered = $derived($suggestions.items.length);
  const stale = $derived(offered > 0 && isStale($suggestions, $song.version));
  const songId = $derived($song.id);

  $effect(() => () => controller?.abort());

  // A different song starts a new conversation: its history says nothing about
  // this one, escalation waits for a nudge about it, and a reply still in
  // flight belongs to the old song. Its suggestions go too: both demo songs
  // number their notes from n1, so a stale suggestion could otherwise sit on
  // the new song's note with the same id.
  $effect(() => {
    void songId;
    untrack(() => {
      suggestions.clear();
      controller?.abort();
      controller = null;
      log = [];
      pending = null;
      status = "idle";
      failureCode = "";
    });
  });

  /**
   * @param {string | null} asked
   * @param {HintLevel} level
   */
  async function send(asked, level) {
    if (status === "loading") return;
    const current = song.get();
    const history = log.slice(-MAX_TURNS).map(({ role, text }) => ({ role, text }));
    pending = { question: asked, level, reply: "" };
    status = "loading";
    const exchange = new AbortController();
    controller = exchange;
    const view = ui.get();
    try {
      const reply = await askTutor(
        {
          snapshot: toTutorSnapshot(current, {
            labelStyle: view.labelStyle,
            keyHidden: keyLabelMode(current, view) === "hidden",
          }),
          hint_level: level,
          question: asked,
          history,
        },
        {
          onDelta: (text) => {
            if (pending) pending.reply += text;
          },
          signal: exchange.signal,
        },
      );
      if (exchange.signal.aborted) return;
      const raw = Array.isArray(reply.suggestions) ? reply.suggestions : [];
      const { items, dropped } = checkSuggestions(raw, current);
      const replyLevel = Object.hasOwn(LEVEL_NAMES, reply.hint_level) ? reply.hint_level : level;
      suggestions.replace({
        snapshotVersion: current.version,
        hintLevel: replyLevel,
        items,
        dropped: dropped + (Number(reply.dropped) || 0),
      });
      const tutorText = (pending?.reply ?? "").slice(0, MAX_TURN_CHARS);
      log = [
        ...log,
        ...(asked ? [{ role: /** @type {const} */ ("student"), text: asked }] : []),
        { role: "tutor", text: tutorText, level: replyLevel },
      ];
      pending = null;
      status = "idle";
    } catch (error) {
      if (exchange.signal.aborted) return;
      if (!(error instanceof TutorError)) console.error("Tutor exchange failed", error);
      failureCode = error instanceof TutorError ? error.code : "unknown";
      status = "failed";
    }
  }

  /** @param {HintLevel} level */
  function ask(level) {
    // Enter still fires while a reply streams; keep the draft for later.
    if (status === "loading") return;
    const asked = question.trim() || null;
    question = "";
    const keyboard = activatedByKeyboard();
    send(asked, level);
    // The button just pressed is now disabled; keep a keyboard user in the panel.
    if (keyboard) textarea?.focus();
  }

  function retry() {
    if (!pending) return;
    const keyboard = activatedByKeyboard();
    send(pending.question, pending.level);
    // Try again unmounts as the retry starts; keep a keyboard user in the panel.
    if (keyboard) textarea?.focus();
  }

  // Focus moves to the text box only after a keyboard activation. After a
  // mouse click it stays put, because a focused text box turns the note keys
  // off and the tutor's next step is usually to go and play something.
  function activatedByKeyboard() {
    return document.activeElement?.matches(":focus-visible") ?? false;
  }

  /** @param {SubmitEvent} event */
  function onsubmit(event) {
    event.preventDefault();
    ask("nudge");
  }

  /** Enter sends; Shift+Enter starts a new line. @param {KeyboardEvent} event */
  function onkeydown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      ask("nudge");
    }
  }
</script>

<section id="tutor" class="tutor" aria-label="Tutor">
  <h2>Tutor</h2>

  {#if log.length || pending}
    <ol class="log" aria-label="Conversation">
      {#each log as turn, i (i)}
        <li class="turn {turn.role}">
          <span class="who">
            {turn.role === "student" ? "You" : "Tutor"}
            {#if turn.level}<span class="level">· {LEVEL_NAMES[turn.level]}</span>{/if}
          </span>
          <p>{turn.text}</p>
        </li>
      {/each}
      {#if pending}
        {#if pending.question}
          <li class="turn student">
            <span class="who">You</span>
            <p>{pending.question}</p>
          </li>
        {/if}
        <li class="turn tutor" aria-busy={status === "loading"}>
          <span class="who">Tutor <span class="level">· {LEVEL_NAMES[pending.level]}</span></span>
          {#if pending.reply}<p>{pending.reply}</p>{/if}
        </li>
      {/if}
    </ol>
  {:else}
    <p class="intro">
      Ask about any chord or bar, or just ask what to listen for. The tutor starts with a nudge; ask
      for more when you want it.
    </p>
  {/if}

  <!-- Always in the accessibility tree, so each change is announced. When all
       there is to say is that a reply arrived, the line is for screen readers. -->
  <div class="status" class:quiet={replied && !offered && !$suggestions.dropped} role="status">
    {#if status === "loading"}
      <span class="thinking">The tutor is listening to your song<span class="dots"></span></span>
    {:else if stale}
      You've changed the song since the tutor's suggestions, so they're marked stale. Ask again for
      fresh ones.
    {:else if replied}
      <span class="visually-hidden">The tutor replied.</span>
      {#if offered}
        {offered === 1 ? "1 suggestion is" : `${offered} suggestions are`} on the chord row to audition.
      {/if}
      {#if $suggestions.dropped}
        {$suggestions.dropped} didn't check out and {$suggestions.dropped === 1 ? "was" : "were"} left
        off.
      {/if}
    {/if}
  </div>

  {#if status === "failed"}
    <div class="failure" role="alert">
      <p>{failureText(failureCode)}</p>
      {#if canRetry(failureCode)}
        <button type="button" class="secondary" onclick={retry}>Try again</button>
      {/if}
    </div>
  {/if}

  <form class="ask" {onsubmit}>
    <label for="tutor-question">Your question</label>
    <textarea
      id="tutor-question"
      bind:this={textarea}
      bind:value={question}
      {onkeydown}
      rows="2"
      maxlength={MAX_QUESTION_CHARS}
      placeholder="Why does bar 4 feel unfinished?"></textarea>
    <div class="actions">
      <button type="submit" class="primary" disabled={status === "loading"}>Ask</button>
      <div class="escalate" role="group" aria-label="Ask for more">
        <button
          type="button"
          class="secondary"
          disabled={status === "loading" || !hasReply}
          onclick={() => ask("comparison")}>Show me options</button
        >
        <button
          type="button"
          class="secondary"
          disabled={status === "loading" || !hasReply}
          onclick={() => ask("answer")}>Tell me</button
        >
      </div>
    </div>
  </form>
</section>

<style>
  .tutor {
    position: relative;
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .intro,
  .status {
    margin: 0;
    color: var(--ink-muted);
  }
  /* Hidden visually but never removed from the accessibility tree: a live
     region that leaves the tree and returns with its content isn't reliably
     announced. */
  .status:empty,
  .status.quiet,
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .log {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .turn {
    max-width: 48rem;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
  }
  .turn.student {
    justify-self: end;
    border: 1px solid var(--rule);
  }
  .turn.tutor {
    background: var(--paper);
  }
  .who {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--ink-muted);
  }
  .level {
    font-weight: 400;
  }
  .turn p {
    margin: var(--space-1) 0 0;
    white-space: pre-wrap;
  }

  .dots::after {
    content: "…";
    animation: breathe 1.2s var(--ease) infinite alternate;
  }
  @keyframes breathe {
    from {
      opacity: 0.25;
    }
  }

  .failure {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--fn-dominant);
    border-radius: var(--radius-md);
  }
  .failure p {
    margin: 0;
  }

  .ask {
    display: grid;
    gap: var(--space-2);
  }
  label {
    font-weight: 500;
  }
  textarea {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    resize: vertical;
  }
  textarea::placeholder {
    color: var(--ink-muted);
  }
  .actions,
  .escalate {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .actions {
    justify-content: space-between;
  }

  button {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-lg);
    cursor: pointer;
  }
  .primary {
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
  }
  .secondary {
    border: 1px solid var(--rule);
    background: var(--surface);
    color: var(--ink);
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @media (prefers-reduced-motion: reduce) {
    .dots::after {
      animation: none;
    }
  }
</style>
