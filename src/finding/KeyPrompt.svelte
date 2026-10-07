<script>
  /**
   * "What key is this tune in?" Two paths sit right under the question: a
   * reader of music picks the key from the clues on the staff; anyone else
   * opens the ear finder (KeyCandidates). The picker commits in one click: a
   * home chip sets the key, the chosen chip clicked again takes it back, and
   * Bright / Dark re-commits the chosen home in the other mode. No mode shows
   * as chosen until the user picks one or a home: a home picked first
   * commits major, and says so. Every change is one song.rekey, so undo
   * takes it back too. The one live region says what each change did, in
   * the same words GuessResult shows.
   * @import { Key } from "../types.js"
   */
  import { tick } from "svelte";
  import { song } from "../store/song.js";
  import { afterFinderPick, afterHomeClick, afterModeChange, chosenTonic } from "./keyChoice.js";
  import { COPY, feedbackText, fill, finderText, guessFeedback } from "./guessFeedback.js";
  import { displayNote, spokenNote } from "../theory/noteDisplay.js";
  import { demoHome } from "./demoTunes.js";
  import { isKept, keep } from "./keptChoices.js";
  import { TONICS, keyName } from "./keys.js";
  import KeyCandidates from "./KeyCandidates.svelte";
  import GuessResult from "./GuessResult.svelte";
  import Transpose from "./Transpose.svelte";
  import DroneSwitch from "../staff/DroneSwitch.svelte";
  import { HINT_COUNT, keyHints } from "../steps/keyHints.js";
  import { mark } from "../staff/staffEvents.js";
  import { CONTROLS } from "../lib/controls.js";

  /**
   * @type {{
   *   onkey: (key: Key) => void,
   *   ondismiss?: () => void,
   *   autofocus?: boolean,
   *   next?: "rhythm" | "chords",
   * }}
   */
  let { onkey, ondismiss, autofocus = false, next = "chords" } = $props();

  const MODES = /** @type {const} */ ([
    { mode: "major", label: "Bright (major)" },
    { mode: "minor", label: "Dark (minor)" },
  ]);

  /**
   * The mode picked before any home is chosen (null: none yet); once a home
   * is chosen, the key's own mode shows.
   * @type {"major" | "minor" | null}
   */
  let pickedMode = $state(null);
  const mode = $derived($song.key.provisional ? pickedMode : $song.key.mode);
  const chosen = $derived(chosenTonic($song.key));
  /** A home was chosen with no mode picked, so it went in as major. */
  let majorByDefault = $state(false);

  /** The home most ears hear, on a demo tune; null anywhere else. */
  const known = $derived(demoHome($song));
  /** The user kept a choice most ears don't share, so it isn't raised again. */
  let kept = $state(isKept(song.get().id));
  const feedback = $derived(guessFeedback($song.key, known, kept));

  let finding = $state(false);
  let announcement = $state("");

  /** @type {HTMLElement | undefined} */
  let heading = $state();
  /** @type {HTMLButtonElement | undefined} */
  let helpButton = $state();
  /** The control that opened the finder, where focus returns when it closes. */
  let opener = /** @type {HTMLElement | undefined} */ ($state());
  /** @type {{ show: () => void } | undefined} */
  let finder = $state();
  /** @type {{ show: () => void, focus: () => boolean } | undefined} */
  let result = $state();

  $effect(() => {
    if (autofocus) heading?.focus();
  });

  /**
   * "Give me a hint": one clue per press (keyHints.js), shown while home is
   * still open. Each clue marks its notes on the staff (a mark stays through
   * redraws), and the marks come off once a home is chosen.
   */
  let hintPresses = $state(0);
  const hints = $derived($song.key.provisional ? keyHints($song, hintPresses) : []);
  $effect(() => {
    const ids = hints.flatMap((h) => h.noteIds);
    if (ids.length === 0) return;
    mark("is-hint", ids);
    return () => mark("is-hint", []);
  });

  // An undo (or anything outside this card) that takes the key back leaves no
  // stale "You chose…" in the live region.
  let wasChosen = !song.get().key.provisional;
  $effect(() => {
    const chosenNow = !$song.key.provisional;
    if (wasChosen && !chosenNow) announcement = "No home chosen yet.";
    wasChosen = chosenNow;
  });

  /**
   * Re-key, and say what the change means.
   * @param {Key} key
   * @param {string} [lead] said first, such as the finder's comparison
   */
  function apply(key, lead) {
    onkey(key);
    const said = key.provisional
      ? "No home chosen yet."
      : feedbackText(key, guessFeedback(key, known, kept));
    announcement = lead ? `${lead} ${said}` : said;
    // A choice on the card shows its result (and any invitation) above the
    // dock; a choice in the finder leaves the finder where it is.
    if (!key.provisional && !finding) tick().then(() => result?.show());
  }

  /** @param {string} tonic */
  function pickHome(tonic) {
    majorByDefault = mode === null;
    const home = { tonic, mode: mode ?? "major" };
    // Un-choosing keeps the home's mode showing, whichever way it was chosen.
    pickedMode = home.mode;
    apply(afterHomeClick($song.key, home));
  }

  /**
   * A chord chosen in the finder commits its home, as its chip does. Choosing
   * the home already committed ("Check it by ear", then the same chord)
   * confirms it. The finder stays open either way, showing the chords' names.
   * @param {Pick<Key, "tonic" | "mode">} home
   * @param {"first" | "same" | "different"} comparison
   */
  function pickFromFinder(home, comparison) {
    const key = afterFinderPick($song.key, home);
    if (key) {
      pickedMode = home.mode;
      majorByDefault = false;
      apply(key, finderText(comparison));
      return;
    }
    announcement = `${finderText(comparison)} Home is still ${spokenNote(keyName($song.key))}.`;
  }

  /** @param {"major" | "minor"} next */
  function pickMode(next) {
    pickedMode = next;
    majorByDefault = false;
    const key = afterModeChange($song.key, next);
    if (key) apply(key);
  }

  /** "Keep my choice": stop inviting a re-check for this tune. */
  function keepChoice() {
    keep($song.id);
    kept = true;
    announcement = fill(COPY.kept, $song.key, spokenNote);
  }

  /**
   * Open the finder; it scrolls into view and takes focus, and gives focus
   * back to the opener on close. Asked again while open, it shows itself.
   */
  function openFinder() {
    if (finding) {
      finder?.show();
      return;
    }
    const active = document.activeElement;
    // Safari doesn't focus a clicked button, so fall back to "Help me find it".
    opener = active instanceof HTMLButtonElement ? active : helpButton;
    finding = true;
  }

  /**
   * Close the finder and give focus back: to its opener, or, when a pick in
   * the finder chose a key and "Help me find it" left with the two ways in,
   * to the result card, or the heading.
   */
  async function closeFinder() {
    finding = false;
    await tick();
    if (opener?.isConnected) opener.focus();
    else if (helpButton?.isConnected) helpButton.focus();
    else if (!result?.focus()) heading?.focus();
  }
</script>

<div id="key-prompt" class="prompt" role="group" aria-labelledby="key-prompt-title">
  <h2 id="key-prompt-title" bind:this={heading} tabindex="-1">What key is this tune in?</h2>

  <!-- Two ways in, side by side on a wide screen: by eye, or by ear. -->
  {#if $song.key.provisional}
    <ul class="ways">
      <li class="way">
        <span class="eyebrow">By eye</span>
        <strong>Read music?</strong>
        <span class="clue">The staff's sharps and flats, and the note phrases rest on.</span>
        {#if hintPresses < HINT_COUNT}
          <button type="button" class="hint-button" onclick={() => hintPresses++}>
            {hintPresses === 0 ? "Give me a hint" : "Another hint"}
          </button>
        {/if}
      </li>
      <li class="way ear">
        <span class="eyebrow">By ear</span>
        <strong>Don't read music, or not sure?</strong>
        <button
          type="button"
          class="help"
          bind:this={helpButton}
          aria-expanded={finding}
          aria-controls="key-finder"
          onclick={() => (finding ? closeFinder() : openFinder())}
        >
          Help me find it
        </button>
      </li>
    </ul>
  {/if}

  <ol class="hints" aria-label="Hints" aria-live="polite">
    {#each hints as hint (hint.id)}
      <li>{hint.text}</li>
    {/each}
  </ol>

  <!-- The decision: mode and home, together in one picker. -->
  <div class="picker">
    <fieldset class="row">
      <legend class="eyebrow">It sounds</legend>
      {#each MODES as option (option.mode)}
        <label class="chip">
          <input
            type="radio"
            name="key-mode"
            value={option.mode}
            checked={mode === option.mode}
            onchange={() => pickMode(option.mode)}
          />
          {option.label}
        </label>
      {/each}
    </fieldset>

    <div
      class="row"
      role="group"
      aria-labelledby="key-home-label"
      aria-describedby={$song.key.provisional ? undefined : "rekey-hint"}
    >
      <span id="key-home-label" class="eyebrow">Home note</span>
      {#each TONICS[mode ?? "major"] as tonic (tonic)}
        <button
          type="button"
          class="chip"
          aria-pressed={chosen === tonic}
          aria-label={spokenNote(tonic)}
          onclick={() => pickHome(tonic)}
        >
          {displayNote(tonic)}
        </button>
      {/each}
    </div>

    {#if !$song.key.provisional}
      <p class="hint" id="rekey-hint">
        {CONTROLS.rekey} with the chips: only home moves, so the numbers and colors change.
        {#if majorByDefault}Major unless you pick Dark.{/if}
      </p>
    {/if}
  </div>

  <p class="visually-hidden" role="status">{announcement}</p>

  {#if !$song.key.provisional}
    <GuessResult
      bind:this={result}
      guess={$song.key}
      {feedback}
      oncheck={openFinder}
      onkeep={keepChoice}
      onnext={ondismiss}
      {next}
    />
  {/if}

  {#if finding}
    <KeyCandidates
      bind:this={finder}
      onpick={pickFromFinder}
      onclose={closeFinder}
      {opener}
      {known}
    />
  {/if}

  <!-- Secondary: settings that count from home, and transposing. -->
  <div class="secondary">
    <div class="settings" role="group" aria-label="Hear it from home">
      <DroneSwitch />
    </div>
    {#if !$song.key.provisional}
      <Transpose />
    {/if}
  </div>

  {#if ondismiss && $song.key.provisional}
    <button type="button" class="quiet" onclick={ondismiss}>Not now</button>
  {/if}
</div>

<style>
  .prompt {
    display: grid;
    gap: var(--space-3);
    justify-items: stretch;
  }
  h2 {
    margin: 0;
    color: var(--accent);
    font-size: var(--text-xl);
    font-weight: 500;
    line-height: 1.2;
  }
  /* Small-caps labels over each group, so a glance finds the parts. */
  .eyebrow {
    display: block;
    margin: 0;
    padding: 0;
    color: var(--ink-muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .ways {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .way {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
  }
  .way strong {
    font-weight: 500;
  }
  .clue {
    color: var(--ink-muted);
  }
  .hints {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding-left: var(--space-4);
    color: var(--ink);
  }
  .hints:empty {
    display: none;
  }
  .hints li::marker {
    color: var(--accent);
    font-weight: 600;
  }
  button.hint-button {
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--accent);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--accent);
    font-weight: 500;
    cursor: pointer;
  }
  button.hint-button:hover {
    background: var(--accent-soft);
  }
  /* A clue's notes on the staff: an accent ring around each notehead. */
  :global(#staff .is-hint .abcjs-notehead) {
    stroke: var(--accent);
    stroke-width: 7px;
    paint-order: stroke;
  }
  .picker {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--paper);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: 0;
  }
  /* The label sits on its own line above its chips. */
  .row > .eyebrow,
  .row > legend {
    flex-basis: 100%;
    float: left;
    width: 100%;
  }
  .hint {
    max-width: 40rem;
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .secondary {
    display: grid;
    gap: var(--space-2);
  }
  .settings {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }
  .chip {
    position: relative;
    min-width: 2.75rem;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    text-align: center;
    cursor: pointer;
    transition:
      background var(--dur-fast) var(--ease),
      border-color var(--dur-fast) var(--ease);
  }
  .chip:hover {
    border-color: var(--accent);
  }
  .chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  /* --accent is what you do (tokens.css): the chosen mode and home. */
  .chip:has(input:checked),
  .chip[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }
  .chip:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  /* "Help me find it" is the by-ear path's one action: a listening button,
     so it wears --sound. */
  button.help {
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-4);
    border: 2px solid var(--sound);
    border-radius: var(--radius-lg);
    background: var(--sound);
    color: var(--sound-ink);
    font-weight: 500;
    cursor: pointer;
  }
  button.help[aria-expanded="true"] {
    background: var(--sound-soft);
    color: var(--ink);
  }
  /* Tertiary, like the app's other text buttons: an underlined link. */
  button.quiet {
    justify-self: start;
    padding: var(--space-1);
    border: none;
    background: none;
    color: var(--ink-muted);
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  button.quiet:hover {
    color: var(--ink);
  }
</style>
