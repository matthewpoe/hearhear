<script>
  /**
   * "What key is this tune in?" Two paths sit right under the question: a
   * reader of music picks the key from the clues on the staff; anyone else
   * opens the ear finder (KeyCandidates). The picker commits in one click: a
   * home chip sets the key, the chosen chip clicked again takes it back, and
   * Bright / Dark re-commits the chosen home in the other mode. Every change
   * is one song.rekey, so undo takes it back too.
   * @import { Key } from "../types.js"
   */
  import { song } from "../store/song.js";
  import { afterFinderPick, afterHomeClick, afterModeChange, chosenTonic } from "./keyChoice.js";
  import { TONICS, keyName } from "./keys.js";
  import KeyCandidates from "./KeyCandidates.svelte";
  import GuessResult from "./GuessResult.svelte";

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

  /** The mode picked before any home is chosen; once one is, the key's own mode shows. */
  let pickedMode = $state(song.get().key.mode);
  const mode = $derived($song.key.provisional ? pickedMode : $song.key.mode);
  const chosen = $derived(chosenTonic($song.key));

  let finding = $state(false);
  let announcement = $state("");

  /** @type {HTMLElement | undefined} */
  let heading = $state();
  /** @type {HTMLButtonElement | undefined} */
  let helpButton = $state();
  /** The control that opened the finder, where focus returns when it closes. */
  let opener = /** @type {HTMLElement | undefined} */ ($state());

  $effect(() => {
    if (autofocus) heading?.focus();
  });

  /** @param {Key} key */
  function apply(key) {
    onkey(key);
    announcement = key.provisional ? "No home chosen yet." : `Home is ${keyName(key)}.`;
  }

  /** @param {Pick<Key, "tonic" | "mode">} home */
  function pickHome(home) {
    // Un-choosing keeps the home's mode showing, whichever way it was chosen.
    pickedMode = home.mode;
    apply(afterHomeClick($song.key, home));
  }

  /**
   * A chord chosen in the finder commits its home, as its chip does. Choosing
   * the home already committed ("Check it by ear", then the same chord)
   * confirms it: the key stays, the finder closes, and focus goes back.
   * @param {Pick<Key, "tonic" | "mode">} home
   */
  function pickFromFinder(home) {
    const key = afterFinderPick($song.key, home);
    if (key) {
      pickedMode = home.mode;
      apply(key);
      return;
    }
    closeFinder();
    announcement = `Home is still ${keyName($song.key)}.`;
  }

  /** @param {"major" | "minor"} next */
  function pickMode(next) {
    pickedMode = next;
    const key = afterModeChange($song.key, next);
    if (key) apply(key);
  }

  /** Open the finder; it takes focus, and gives it back to the focused opener on close. */
  function openFinder() {
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
    {#each TONICS[mode] as tonic (tonic)}
      <button
        type="button"
        class="chip"
        aria-pressed={chosen === tonic}
        onclick={() => pickHome({ tonic, mode })}
      >
        {tonic}
      </button>
    {/each}
  </div>

  <p class="visually-hidden" role="status">{announcement}</p>

  {#if !$song.key.provisional}
    <GuessResult guess={$song.key} oncheck={openFinder} />
  {/if}

  {#if finding}
    <KeyCandidates onpick={pickFromFinder} onclose={closeFinder} {opener} />
  {/if}

  {#if ondismiss}
    <button type="button" class="quiet" onclick={ondismiss}>Not now</button>
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
  button.quiet {
    border-color: transparent;
    color: var(--ink-muted);
  }
</style>
