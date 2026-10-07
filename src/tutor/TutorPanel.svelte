<script module>
  import { createAccess } from "./access.js";

  // The live tutor's passphrase, once per page load: a `#code=` link is read
  // and cleared from the address bar before anything else can see it.
  const access = createAccess(window);
  access.load();
</script>

<script>
  // The tutor conversation under the chord grid. Each send carries a fresh
  // snapshot of the song, the question, and the session's recent history. The
  // reply streams in as plain text; its suggestions are re-validated against
  // the song they were made for, then handed to the chord row (Stream D2) as
  // alternatives to audition. Nothing here changes the song.
  import { song } from "../store/song.js";
  import { tick, untrack } from "svelte";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { suggestions, isStale } from "../store/suggestions.js";
  import { toTutorSnapshot } from "../store/snapshot.js";
  import { askTutor, TutorError } from "./client.js";
  import { onAskRequest } from "./requests.js";
  import { checkSuggestions } from "./validate.js";
  import { failureText, canRetry } from "./failures.js";
  import { replySteps } from "./replySteps.js";

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
    /** @type {{ question: string | null, level: HintLevel, reply: string, fixture: string } | null} */ (
      null
    ),
  );
  let failureCode = $state("");
  /** @type {AbortController | null} */
  let controller = null;
  /** @type {HTMLTextAreaElement | undefined} */
  let textarea = $state();
  /** What the user is typing into the passphrase prompt. Never stored. */
  let passphrase = $state("");
  /** The last request carried a passphrase and the server turned it away. */
  let codeRejected = $state(false);
  /** @type {HTMLInputElement | undefined} */
  let passphraseInput = $state();

  const hasReply = $derived(log.some((turn) => turn.role === "tutor"));
  /** A reply has arrived and nothing has been asked since. */
  const replied = $derived(status === "idle" && hasReply);
  const offered = $derived($suggestions.items.length);
  const stale = $derived(offered > 0 && isStale($suggestions, $song.version));
  const songId = $derived($song.id);
  const hasSong = $derived($song.notes.length > 0);
  const canAsk = $derived(hasSong && status !== "loading" && question.trim() !== "");
  /**
   * The server replays recorded replies (TUTOR_MODE=fixture): known from
   * /api/health, or from a reply served by "fixture".
   */
  let demoReplies = $state(false);

  $effect(() => () => controller?.abort());

  // A question asked on the viewer's behalf (the guided path), as if typed.
  $effect(() =>
    onAskRequest(({ question: asked, level, fixture }) => {
      if (status === "loading" || !hasSong) return;
      send(asked, level, fixture);
    }),
  );

  // Only says whether to show the demo notice; the tutor's own requests have
  // their own failure states, so a failed check just leaves the notice off.
  $effect(() => {
    const check = new AbortController();
    fetch("/api/health", { signal: check.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((health) => {
        if (health?.tutor_mode === "fixture") demoReplies = true;
      })
      .catch((error) => {
        if (!check.signal.aborted) console.warn("Couldn't read the tutor's mode", error);
      });
    return () => check.abort();
  });

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
   * @param {string} [fixture] a recorded lesson to replay (the guided path's)
   */
  async function send(asked, level, fixture = "") {
    if (status === "loading") return;
    const current = song.get();
    const history = log.slice(-MAX_TURNS).map(({ role, text }) => ({ role, text }));
    pending = { question: asked, level, reply: "", fixture };
    status = "loading";
    const exchange = new AbortController();
    controller = exchange;
    const view = ui.get();
    const accessCode = access.get();
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
          accessCode,
          fixture,
        },
      );
      if (exchange.signal.aborted) return;
      if (reply.served_by === "fixture") demoReplies = true;
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
      // A locked-out code stops being sent too: after the wait, the student
      // retypes it (or reopens their link) instead of tripping the limit again.
      if (failureCode === "access_locked") access.forget();
      if (failureCode === "access_required") {
        codeRejected = Boolean(accessCode);
        access.forget();
        // The prompt is the next step, and its description is read on focus.
        await tick();
        passphraseInput?.focus();
      }
    }
  }

  /** @param {HintLevel} level */
  function ask(level) {
    // Enter still fires while a reply streams; keep the draft for later.
    if (status === "loading" || !hasSong) return;
    // A nudge answers a question; the escalations build on the last reply.
    if (level === "nudge" && !question.trim()) return;
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
    send(pending.question, pending.level, pending.fixture);
    // Try again unmounts as the retry starts; keep a keyboard user in the panel.
    if (keyboard) textarea?.focus();
  }

  /** @param {SubmitEvent} event */
  function unlock(event) {
    event.preventDefault();
    if (!passphrase.trim()) return;
    access.set(passphrase);
    passphrase = "";
    retry();
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

<!-- A tutor reply: its prose, then its closing listening steps as a list. -->
{#snippet reply(text)}
  {@const { prose, steps } = replySteps(text)}
  {#if prose}<p>{prose}</p>{/if}
  {#if steps.length}
    <ol class="steps">
      {#each steps as step, i (i)}<li>{step}</li>{/each}
    </ol>
  {/if}
{/snippet}

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
          {#if turn.role === "tutor"}{@render reply(turn.text)}{:else}<p>{turn.text}</p>{/if}
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
          {#if pending.reply}{@render reply(pending.reply)}{/if}
        </li>
      {/if}
    </ol>
  {:else if !hasSong}
    <p class="intro">Load a tune first.</p>
  {:else}
    <p class="intro">
      Ask about any chord or bar, or just ask what to listen for. The tutor starts with a nudge; ask
      for more when you want it.
    </p>
  {/if}

  {#if demoReplies}
    <p class="demo">
      Demo mode: the tutor plays back recorded sample replies about Ode to Joy, so it may not answer
      your exact question.
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

  {#if status === "failed" && failureCode === "access_required"}
    <form class="gate" onsubmit={unlock}>
      <p id="tutor-gate-ask">
        The live tutor is for invited listeners. What's the passphrase?
        {#if codeRejected}That one didn't match; check it and try again.{/if}
      </p>
      <label for="tutor-passphrase">Passphrase</label>
      <div class="actions">
        <input
          id="tutor-passphrase"
          type="password"
          autocomplete="off"
          spellcheck="false"
          aria-describedby="tutor-gate-ask tutor-gate-lessons"
          bind:this={passphraseInput}
          bind:value={passphrase}
        />
        <button type="submit" class="primary" disabled={!passphrase.trim()}>Unlock the tutor</button
        >
      </div>
      <p id="tutor-gate-lessons" class="aside">
        No passphrase? The recorded lessons work without one, and they're on their way.
      </p>
    </form>
  {:else if status === "failed"}
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
      placeholder={hasSong ? "Why does bar 4 feel unfinished?" : ""}></textarea>
    <div class="actions">
      <button type="submit" class="primary" disabled={!canAsk}>Ask</button>
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
  .status,
  .demo {
    margin: 0;
    color: var(--ink-muted);
  }
  .demo {
    font-size: var(--text-sm);
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
    white-space: pre-line;
  }
  .steps {
    display: grid;
    gap: var(--space-1);
    margin: var(--space-2) 0 0;
    padding-left: var(--space-4);
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

  .gate {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
  }
  .gate p {
    margin: 0;
  }
  .gate .aside {
    color: var(--ink-muted);
  }
  .gate input {
    flex: 1 1 12rem;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--paper);
    color: var(--ink);
    font: inherit;
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
