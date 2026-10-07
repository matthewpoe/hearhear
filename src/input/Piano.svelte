<script>
  /**
   * The on-screen piano, C2 to C6: a second way to play and a teaching
   * surface. Each key shows its scale degree in jianpu style (dots above or
   * below for the octave around home) and the computer key that plays it,
   * both following keyLabelMode. Keys light from ui.keyboardLights (chord
   * tones in their function color, melody neutral) and sink while held.
   * The number row listens from here, since this is the instrument.
   */
  import { audioStatus, preload } from "../audio/index.js";
  import { song } from "../store/song.js";
  import { keyLabelMode, ui } from "../store/ui.js";
  import { midiToDegree, spell } from "../theory/index.js";
  import FunctionMark from "./FunctionMark.svelte";
  import { bindingLabel, bindingSpoken, keyBindings } from "./keyBindings.js";
  import { heldNotes, press, release } from "./liveNotes.js";
  import { flatArmed, listenToNumberRow } from "./NumberRow.js";

  const LOWEST = 36; // C2, matching the samples and all three note rows
  const HIGHEST = 84; // C6
  const BLACK = new Set([1, 3, 6, 8, 10]);
  /** How long a screen-reader activation (a click with no press) holds the note. */
  const TAP_MS = 400;

  /** Every key, low to high. `slot` is how many white keys lie below it, for layout. */
  const KEYS = (() => {
    const keys = [];
    let whites = 0;
    for (let midi = LOWEST; midi <= HIGHEST; midi++) {
      const black = BLACK.has(midi % 12);
      keys.push({ midi, black, slot: whites });
      if (!black) whites++;
    }
    return keys;
  })();
  const WHITE_COUNT = KEYS.filter((k) => !k.black).length;

  $effect(() => listenToNumberRow(window));

  const mode = $derived(keyLabelMode($song, $ui));
  const bindings = $derived(keyBindings($song.key, $ui.windowOctave));
  const degrees = $derived(new Map(KEYS.map((k) => [k.midi, midiToDegree(k.midi, $song.key)])));
  const chord = $derived($ui.keyboardLights.chord);
  const chordTones = $derived(new Set(chord?.midi ?? []));
  const melody = $derived(new Set($ui.keyboardLights.melody));

  const windowText = $derived.by(() => {
    const w = $ui.windowOctave;
    if (w === 0) return "Number row: home octave";
    return `Number row: ${Math.abs(w)} octave${Math.abs(w) > 1 ? "s" : ""} ${w > 0 ? "up" : "down"}`;
  });

  /** @param {-1 | 0 | 1} accidental */
  const accidentalGlyph = (accidental) => ({ "-1": "♭", 0: "", 1: "♯" })[accidental];

  /** "C#4" → "C sharp 4", so screen readers don't say "number". @param {string} pitch */
  const speakPitch = (pitch) =>
    pitch.replace(/^([A-G])#/, "$1 sharp ").replace(/^([A-G])b/, "$1 flat ");

  /** @param {number} octave */
  function speakOctave(octave) {
    if (octave === 0) return "";
    const count = Math.abs(octave) === 1 ? "an octave" : `${Math.abs(octave)} octaves`;
    return `, ${count} ${octave > 0 ? "above" : "below"} home`;
  }

  /** @param {number} midi */
  function accessibleName(midi) {
    const pitch = speakPitch(spell(midi, $song.key));
    if (mode === "hidden") return pitch;
    const { degree, accidental, octave } = /** @type {import("../types.js").ScaleDegree} */ (
      degrees.get(midi)
    );
    const acc = { "-1": "flat ", 0: "", 1: "sharp " }[accidental];
    const binding = bindings.get(midi);
    const played = binding ? `, key ${bindingSpoken(binding)}` : "";
    const tentative = mode === "tentative" ? ", tentative" : "";
    return `${pitch}, degree ${acc}${degree}${speakOctave(octave)}${played}${tentative}`;
  }

  // Pointer and touch: each pointer holds the key it went down on. Tracking
  // it means hovering out of a key never stops a note the number row holds.
  // Bookkeeping only; nothing renders from it, so it isn't reactive.
  /** @type {Map<number, number>} pointerId → MIDI */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map();

  /** @param {PointerEvent} event @param {number} midi */
  function pointerDown(event, midi) {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, midi);
    press(midi);
  }

  /** @param {PointerEvent} event */
  function pointerUp(event) {
    const midi = pointers.get(event.pointerId);
    if (midi === undefined) return;
    pointers.delete(event.pointerId);
    release(midi);
  }

  /**
   * A click with no pointer press behind it comes from assistive tech: play a short note.
   * @param {MouseEvent} event
   * @param {number} midi
   */
  function assistiveClick(event, midi) {
    if (event.detail !== 0) return;
    press(midi);
    setTimeout(() => release(midi), TAP_MS);
  }

  // Keyboard: one tab stop for the whole piano (roving tabindex), arrows move
  // along it, and Space or Enter holds the focused key.
  let focusMidi = $state(60);
  /** @type {HTMLButtonElement[]} */
  const buttons = $state([]);

  /** @param {number} midi */
  function focusKey(midi) {
    focusMidi = Math.max(LOWEST, Math.min(HIGHEST, midi));
    buttons[focusMidi - LOWEST]?.focus();
  }

  const playsKey = (/** @type {KeyboardEvent} */ event) =>
    event.key === " " || event.key === "Enter";

  /** @param {KeyboardEvent} event @param {number} midi */
  function keyDown(event, midi) {
    const moves = { ArrowLeft: midi - 1, ArrowRight: midi + 1, Home: LOWEST, End: HIGHEST };
    if (event.key in moves) {
      event.preventDefault();
      focusKey(moves[/** @type {keyof typeof moves} */ (event.key)]);
    } else if (playsKey(event)) {
      event.preventDefault();
      if (!event.repeat) press(midi);
    }
  }

  /** @param {KeyboardEvent} event @param {number} midi */
  function keyUp(event, midi) {
    if (!playsKey(event)) return;
    event.preventDefault();
    release(midi);
  }

  function retrySamples() {
    preload().catch((error) => console.error("Piano samples failed to load", error));
  }
</script>

<section id="piano" class="piano" aria-label="Keyboard">
  <header class="bar">
    <h2>Keyboard</h2>
    <p class="status" aria-live="polite">
      {windowText}{#if $flatArmed}<span class="armed">♭ next note</span>{/if}
    </p>
    {#if $audioStatus === "loading"}
      <p class="sound" role="status">Loading piano sound…</p>
    {:else if $audioStatus === "failed"}
      <p class="sound" role="alert">
        Piano sound didn't load.
        <button type="button" class="retry" onclick={retrySamples}>Retry</button>
      </p>
    {/if}
  </header>

  <div class="scroller">
    <div
      class="keys"
      role="group"
      aria-label="Piano keys, C2 to C6"
      data-mode={mode}
      style:--whites={WHITE_COUNT}
    >
      {#each KEYS as k, i (k.midi)}
        {@const degree = degrees.get(k.midi)}
        {@const binding = bindings.get(k.midi)}
        {@const inChord = chordTones.has(k.midi)}
        <button
          bind:this={buttons[i]}
          type="button"
          class="key fn-{chord?.fn ?? 'other'}"
          class:black={k.black}
          class:chord={inChord}
          class:melody={melody.has(k.midi)}
          class:held={$heldNotes.has(k.midi)}
          style:--slot={k.slot}
          tabindex={k.midi === focusMidi ? 0 : -1}
          aria-label={accessibleName(k.midi)}
          onpointerdown={(event) => pointerDown(event, k.midi)}
          onpointerup={pointerUp}
          onpointerleave={pointerUp}
          onpointercancel={pointerUp}
          onclick={(event) => assistiveClick(event, k.midi)}
          onkeydown={(event) => keyDown(event, k.midi)}
          onkeyup={(event) => keyUp(event, k.midi)}
          onfocus={() => (focusMidi = k.midi)}
          oncontextmenu={(event) => event.preventDefault()}
        >
          <span class="labels" aria-hidden="true">
            {#if inChord && chord && mode !== "hidden"}
              <FunctionMark fn={chord.fn} outline={mode === "tentative"} />
            {/if}
            {#if degree}
              <span class="degree">
                <span class="dots">{"•".repeat(Math.max(0, degree.octave))}</span>
                <span class="number">{accidentalGlyph(degree.accidental)}{degree.degree}</span>
                <span class="dots">{"•".repeat(Math.max(0, -degree.octave))}</span>
              </span>
            {/if}
            {#if binding}
              <kbd>{bindingLabel(binding)}</kbd>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  .piano {
    padding: var(--space-2) var(--space-4) var(--space-3);
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2) var(--space-4);
    margin-bottom: var(--space-2);
  }
  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  .status,
  .sound {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }
  .armed {
    margin-left: var(--space-3);
    padding: 0 var(--space-2);
    border: 1px solid var(--ink);
    border-radius: var(--radius-sm);
    color: var(--ink);
  }
  .retry {
    margin-left: var(--space-2);
    padding: 0 var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }

  /* The keys scroll inside the dock on narrow screens; the page never does. */
  .scroller {
    overflow-x: auto;
    padding: var(--space-1) 0;
  }
  .keys {
    --white-width: calc(100% / var(--whites));
    position: relative;
    min-width: calc(var(--whites) * 1.75rem);
    height: 8.5rem;
  }

  .key {
    position: absolute;
    top: 0;
    left: calc(var(--slot) * var(--white-width));
    width: var(--white-width);
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding: 0 0 var(--space-2);
    border: 1px solid var(--key-edge);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    background: var(--key-white);
    color: var(--key-black);
    cursor: pointer;
    touch-action: none;
    user-select: none;
    -webkit-touch-callout: none;
    transition:
      transform var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-fast) var(--ease);
  }
  .key.black {
    z-index: 1;
    left: calc((var(--slot) - 0.3) * var(--white-width));
    width: calc(0.6 * var(--white-width));
    height: 60%;
    padding-bottom: var(--space-1);
    background: var(--key-black);
    color: var(--key-white);
    font-size: 0.625rem;
  }
  .key:focus-visible {
    z-index: 2;
  }

  /* Function colors for lit chord tones. Yellow outlines use its edge token for contrast. */
  .fn-tonic {
    --fn: var(--fn-tonic);
    --fn-ink: var(--fn-tonic-ink);
    --fn-edge: var(--fn-tonic);
  }
  .fn-subdominant {
    --fn: var(--fn-subdominant);
    --fn-ink: var(--fn-subdominant-ink);
    --fn-edge: var(--fn-subdominant-edge);
  }
  .fn-dominant {
    --fn: var(--fn-dominant);
    --fn-ink: var(--fn-dominant-ink);
    --fn-edge: var(--fn-dominant);
  }
  .fn-other {
    --fn: var(--fn-other);
    --fn-ink: var(--fn-other-ink);
    --fn-edge: var(--fn-other);
  }

  /* Melody, held keys, and chord tones before a guess all glow neutral. */
  .key.melody,
  .key.held,
  [data-mode="hidden"] .key.chord {
    background: var(--key-glow-melody);
    color: var(--key-black);
  }
  .key.held {
    transform: translateY(2px);
    box-shadow: 0 0 0.75rem var(--key-glow-melody);
  }

  /* Confirmed: chord tones fill with their function color and shape. */
  [data-mode="confirmed"] .key.chord {
    background: var(--fn);
    color: var(--fn-ink);
  }

  /* Tentative: an outline in the function color, no fill (tokens.css). */
  [data-mode="tentative"] .key.chord::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 calc(2 * var(--tentative-stroke)) var(--fn-edge);
    opacity: var(--tentative-opacity);
    pointer-events: none;
  }
  [data-mode="tentative"] .key.chord :global(.mark) {
    color: var(--fn-edge);
  }

  .labels {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    line-height: 1;
    transition: opacity var(--dur-reveal) var(--ease);
  }
  .degree {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-weight: 500;
  }
  [data-mode="tentative"] .degree {
    font-style: italic;
  }
  .dots {
    min-height: 0.5rem;
    font-size: 0.625rem;
    line-height: 0.5rem;
    letter-spacing: -0.1em;
  }
  kbd {
    font: inherit;
    font-size: 0.6875rem;
  }
  .black kbd {
    font-size: 0.5625rem;
  }

  /* Before a demo guess nothing key-relative shows; confirming fades it in. */
  [data-mode="hidden"] .labels {
    opacity: 0;
    visibility: hidden;
  }
</style>
