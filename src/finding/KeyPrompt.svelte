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
  import DegreesSwitch from "../toolbar/DegreesSwitch.svelte";

  /**
   * @type {{
   *   onkey: (key: Key) => void,
   *   ondismiss?: () => void,
   *   autofocus?: boolean,
   * }}
   */
  let { onkey, ondismiss, autofocus = false } = $props();

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
  /** @type {{ show: () => void } | undefined} */
  let result = $state();

  $effect(() => {
    if (autofocus) heading?.focus();
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

  function closeFinder() {
    finding = false;
    (opener?.isConnected ? opener : helpButton)?.focus();
  }
</script>

<div id="key-prompt" class="prompt" role="group" aria-labelledby="key-prompt-title">
  <h2 id="key-prompt-title" bind:this={heading} tabindex="-1">What key is this tune in?</h2>

  <ul class="paths">
    <li>
      <strong>Read music?</strong> The clues are on the staff: the sharps and flats the tune uses, and
      the note its phrases come to rest on. Pick the key below.
    </li>
    <li>
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

  <fieldset class="row">
    <legend>It sounds</legend>
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

  <div class="row" role="group" aria-labelledby="key-home-label">
    <span id="key-home-label" class="label">Home note</span>
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
      <strong>Choose a different home</strong> with the chips above: the notes stay exactly as you hear
      them; only home moves, so the numbers and colors change.
    </p>
  {/if}

  {#if majorByDefault && !$song.key.provisional}
    <p class="hint">Major unless you pick Dark.</p>
  {/if}

  <p class="visually-hidden" role="status">{announcement}</p>

  {#if !$song.key.provisional}
    <GuessResult
      bind:this={result}
      guess={$song.key}
      {feedback}
      oncheck={openFinder}
      onkeep={keepChoice}
    />
  {/if}

  <!-- Settings that count from home sit with the key. -->
  <div class="settings" role="group" aria-label="Hear it from home">
    <DroneSwitch />
    <DegreesSwitch />
  </div>

  {#if !$song.key.provisional}
    <Transpose />
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

  {#if ondismiss}
    <button type="button" class="quiet" onclick={ondismiss}>
      {$song.key.provisional ? "Not now" : "Done: on to chords"}
    </button>
  {/if}
</div>

<style>
  .prompt {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }
  h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 500;
  }
  .paths {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    color: var(--ink-muted);
    list-style: none;
  }
  .paths strong {
    color: var(--ink);
    font-weight: 500;
  }
  .settings {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
  }
  .hint strong {
    color: var(--ink);
    font-weight: 500;
  }
  .hint {
    max-width: 34rem;
    margin: 0;
    color: var(--ink-muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend,
  .label {
    float: left;
    margin-right: var(--space-1);
    padding: var(--space-1) 0;
    font-weight: 500;
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
    border-color: var(--ink);
  }
  .chip input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .chip:has(input:checked),
  .chip[aria-pressed="true"] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }
  .chip:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  button.help,
  button.quiet {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  /* Tertiary, like the app's other text buttons: an underlined link. */
  button.quiet {
    justify-self: start;
    padding-inline: var(--space-1);
    border-color: transparent;
    background: none;
    color: var(--ink-muted);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  button.quiet:hover {
    color: var(--ink);
  }
</style>
