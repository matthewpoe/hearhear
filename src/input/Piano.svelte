<script>
  /**
   * The on-screen piano, C2 to C6: a second way to play and a teaching
   * surface. Each key shows its scale degree in jianpu style (dots above or
   * below for the octave around home) and the computer key that plays it,
   * both following keyLabelMode. Keys light from ui.keyboardLights (chord
   * tones in their function color, melody neutral) while a writer owns
   * them, and sink while held. The number row listens from here, since this
   * is the instrument. While the bottom row plays chords, its keys' labels
   * name their chords, and a held chord lights in its function color.
   */
  import { audioStatus, preload } from "../audio/index.js";
  import FunctionMark from "../lib/FunctionMark.svelte";
  import { song } from "../store/song.js";
  import { keyLabelMode, ui } from "../store/ui.js";
  import { midiToDegree, spell } from "../theory/index.js";
  import { spokenNote } from "../theory/noteDisplay.js";
  import {
    HIGHEST,
    LOWEST,
    bindingLabel,
    bindingSpoken,
    chordRowKeys,
    clampWindow,
    keyBindings,
  } from "./keyBindings.js";
  import { chordForCode, chordKeyLabel, chordRowHelp } from "./chordRow.js";
  import { heldNotes, press, release } from "./liveNotes.js";
  import { flatArmed, heldChord, listenToNumberRow } from "./NumberRow.js";
  import Tip from "../toolbar/Tip.svelte";
  import explainers from "../../content/explainers.json" with { type: "json" };

  const BLACK = new Set([1, 3, 6, 8, 10]);
  /** How long a screen-reader activation (a click with no press) holds the note. */
  const TAP_MS = 400;
  /** Matches --dur-reveal: how long the confirm reveal's slow fade lasts. */
  const REVEAL_MS = 700;

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
  const chordsOnBottomRow = $derived($ui.bottomRow === "chords");
  const bindings = $derived(keyBindings($song.key, $ui.windowOctave, $ui.bottomRow));
  /** MIDI → the chord-row key labelled there and its chord's short name. */
  const chordKeys = $derived.by(() => {
    if (!chordsOnBottomRow) return new Map();
    const placed = chordRowKeys($song.key, $ui.windowOctave);
    return new Map(
      [...placed].map(([midi, code]) => {
        const { chord } = /** @type {NonNullable<ReturnType<typeof chordForCode>>} */ (
          chordForCode(code, $song.key)
        );
        return [
          midi,
          { key: code.replace(/^Key/, ""), name: chordKeyLabel(chord, $song.key, $ui.labelStyle) },
        ];
      }),
    );
  });
  const degrees = $derived(new Map(KEYS.map((k) => [k.midi, midiToDegree(k.midi, $song.key)])));
  // Lights show only while a writer (playback or hover) owns them.
  const lights = $derived($ui.keyboardLights.source ? $ui.keyboardLights : null);
  // A chord held on the chord row lights in its function color when no writer owns the lights.
  const chord = $derived(lights?.chord ?? $heldChord);
  const chordTones = $derived(new Set(chord?.midi ?? []));
  const melody = $derived(new Set(lights?.melody ?? []));
  const drone = $derived(new Set(lights?.drone ?? []));

  // Confirming a key is a reveal: the chord fill fades in slowly once, then
  // follows playback at the usual pace.
  let revealing = $state(false);
  /** @type {string | null} */
  let previousMode = null;
  $effect(() => {
    const entering = mode === "confirmed" && previousMode !== null && previousMode !== "confirmed";
    previousMode = mode;
    if (!entering) return;
    revealing = true;
    const timer = setTimeout(() => (revealing = false), REVEAL_MS);
    return () => clearTimeout(timer);
  });

  const windowText = $derived.by(() => {
    const w = clampWindow($song.key, $ui.windowOctave);
    if (w === 0) return "Number row: home octave";
    return `Number row: ${Math.abs(w)} octave${Math.abs(w) > 1 ? "s" : ""} ${w > 0 ? "up" : "down"}`;
  });

  /** How an accidental reads on a key and aloud. */
  const ACCIDENTAL = {
    "-1": { glyph: "♭", spoken: "flat " },
    0: { glyph: "", spoken: "" },
    1: { glyph: "♯", spoken: "sharp " },
  };

  /** @param {number} octave */
  function speakOctave(octave) {
    if (octave === 0) return "";
    const count = Math.abs(octave) === 1 ? "an octave" : `${Math.abs(octave)} octaves`;
    return `, ${count} ${octave > 0 ? "above" : "below"} home`;
  }

  /** @param {number} midi */
  function accessibleName(midi) {
    // "C sharp 4", so screen readers don't say "number".
    const pitch = spokenNote(spell(midi, $song.key));
    const chordKey = chordKeys.get(midi);
    if (mode === "hidden") return chordKey ? `${pitch}, key ${chordKey.key} plays a chord` : pitch;
    const { degree, accidental, octave } = /** @type {import("../types.js").ScaleDegree} */ (
      degrees.get(midi)
    );
    const binding = bindings.get(midi);
    const played = chordKey
      ? `, key ${chordKey.key} plays chord ${spokenNote(chordKey.name)}`
      : binding
        ? `, key ${bindingSpoken(binding)}`
        : "";
    const tentative = mode === "tentative" ? ", tentative" : "";
    return `${pitch}, degree ${ACCIDENTAL[accidental].spoken}${degree}${speakOctave(octave)}${played}${tentative}`;
  }

  /** @param {"chords" | "notes"} bottomRow */
  function setBottomRow(bottomRow) {
    ui.update({ bottomRow });
  }

  // Pointer and touch: each pointer holds the key it went down on, captured so
  // sliding onto a neighbour doesn't end the note, as on a real piano. A drag
  // along the keys pans the scroller instead (touch-action: pan-x), which
  // cancels the pointer and releases the note. Bookkeeping only; nothing
  // renders from it, so it isn't reactive.
  /** @type {Map<number, number>} pointerId → MIDI */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map();

  /** @param {PointerEvent} event @param {number} midi */
  function pointerDown(event, midi) {
    if (event.button !== 0) return;
    /** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, midi);
    press(midi, `pointer:${event.pointerId}`);
  }

  /** @param {PointerEvent} event */
  function pointerUp(event) {
    const midi = pointers.get(event.pointerId);
    if (midi === undefined) return;
    pointers.delete(event.pointerId);
    release(midi, `pointer:${event.pointerId}`);
  }

  let taps = 0;

  /**
   * A click with no pointer press behind it comes from assistive tech: play a short note.
   * @param {MouseEvent} event
   * @param {number} midi
   */
  function assistiveClick(event, midi) {
    if (event.detail !== 0) return;
    const source = `tap:${++taps}`;
    press(midi, source);
    setTimeout(() => release(midi, source), TAP_MS);
  }

  // Keyboard: one tab stop for the whole piano (roving tabindex), arrows move
  // along it, and Space or Enter holds the focused key. The held key is
  // remembered, so moving focus while holding never strands a note.
  let focusMidi = $state(60);
  /** @type {HTMLButtonElement[]} */
  const buttons = $state.raw([]);
  /** @type {number | null} */
  let keyboardHeld = null;

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
      if (event.repeat || keyboardHeld !== null) return;
      keyboardHeld = midi;
      press(midi, "focus");
    }
  }

  /** @param {KeyboardEvent} event */
  function keyUp(event) {
    if (!playsKey(event)) return;
    event.preventDefault();
    releaseKeyboard();
  }

  /** Let go of the key Space or Enter pressed, wherever focus is now. */
  function releaseKeyboard() {
    if (keyboardHeld === null) return;
    release(keyboardHeld, "focus");
    keyboardHeld = null;
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
    <div class="switch" role="group" aria-label="Bottom row">
      <span class="switch-label" aria-hidden="true">Bottom row:</span>
      <Tip id="bottom-row-chords-tip" text={explainers.options.bottomRowChords} above>
        <button
          type="button"
          aria-pressed={chordsOnBottomRow}
          aria-describedby="bottom-row-chords-tip"
          onclick={() => setBottomRow("chords")}>Chords</button
        >
      </Tip>
      <Tip id="bottom-row-notes-tip" text={explainers.options.bottomRowNotes} above>
        <button
          type="button"
          aria-pressed={!chordsOnBottomRow}
          aria-describedby="bottom-row-notes-tip"
          onclick={() => setBottomRow("notes")}>Notes</button
        >
      </Tip>
    </div>
    {#if chordsOnBottomRow}
      <p class="help" id="chord-row-help">{chordRowHelp(mode)}</p>
    {/if}
    {#if $audioStatus === "failed"}
      <p class="sound" role="alert">
        Couldn't load the piano sound.
        <button type="button" class="retry" onclick={retrySamples}>Retry</button>
      </p>
    {/if}
  </header>

  <div class="scroller">
    <div
      class="keys"
      class:revealing
      role="group"
      aria-label="Piano keys, C2 to C6"
      data-mode={mode}
      style:--whites={WHITE_COUNT}
      onfocusout={releaseKeyboard}
    >
      {#each KEYS as k, i (k.midi)}
        {@const degree = degrees.get(k.midi)}
        {@const binding = bindings.get(k.midi)}
        {@const chordKey = chordKeys.get(k.midi)}
        {@const inChord = chordTones.has(k.midi)}
        <button
          bind:this={buttons[i]}
          type="button"
          class="key fn-{chord?.fn ?? 'other'}"
          class:black={k.black}
          class:chord={inChord}
          class:melody={melody.has(k.midi)}
          class:held={$heldNotes.has(k.midi)}
          class:drone={drone.has(k.midi)}
          style:--slot={k.slot}
          tabindex={k.midi === focusMidi ? 0 : -1}
          aria-label={accessibleName(k.midi)}
          onpointerdown={(event) => pointerDown(event, k.midi)}
          onpointerup={pointerUp}
          onpointercancel={pointerUp}
          onclick={(event) => assistiveClick(event, k.midi)}
          onkeydown={(event) => keyDown(event, k.midi)}
          onkeyup={keyUp}
          onfocus={() => (focusMidi = k.midi)}
          oncontextmenu={(event) => event.preventDefault()}
        >
          <span class="labels" aria-hidden="true">
            {#if inChord && chord && mode !== "hidden"}
              <FunctionMark fn={chord.fn} outline={mode === "tentative"} />
            {/if}
            {#if chordKey && mode === "hidden"}
              <!-- The chord row waits for home: its keys show as unavailable. -->
              <kbd class="off">{chordKey.key}</kbd>
            {:else if chordKey}
              <span class="chord-name">{chordKey.name}</span>
              <kbd>{chordKey.key}</kbd>
            {:else if degree}
              <span class="degree">
                <span class="dots">{"•".repeat(Math.max(0, degree.octave))}</span>
                <span class="number">{ACCIDENTAL[degree.accidental].glyph}{degree.degree}</span>
                <span class="dots">{"•".repeat(Math.max(0, -degree.octave))}</span>
              </span>
            {/if}
            {#if binding && !chordKey}
              {@const label = bindingLabel(binding)}
              {@const shifted = label.startsWith("⇧")}
              <!-- Jost has no ⇧, so the arrow comes from a system font. -->
              <kbd
                >{#if shifted}<span class="shift">⇧</span>{/if}{shifted
                  ? label.slice(1)
                  : label}</kbd
              >
            {/if}
          </span>
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  /* Keys are about 1.5x the old 5.5rem where the window is tall enough, and
     shrink with the viewport's height so the staff stays the hero. */
  .piano {
    padding: var(--space-1) var(--space-3) var(--space-2);
  }
  /* On a wide screen the bar's controls and help sit in a column beside the
     keys instead of in rows above them, so the taller keys cost the page no
     more height than the old dock did. Below 72rem the column would squeeze
     the keys under their 1.75rem minimum, so they stack as before. */
  @media (min-width: 72rem) {
    .piano {
      display: grid;
      grid-template-columns: 18rem minmax(0, 1fr);
      gap: var(--space-3);
      align-items: start;
      padding-top: var(--space-2);
    }
    .bar {
      align-content: start;
      gap: var(--space-1) var(--space-2);
      margin-bottom: 0;
    }
    .help {
      flex-basis: 100%;
      font-size: 0.8125rem;
      line-height: 1.35;
    }
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    margin-bottom: var(--space-1);
  }
  h2 {
    margin: 0;
    color: var(--sound);
    font-size: var(--text-sm);
    font-weight: 700;
  }
  .status,
  .sound,
  .help {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }
  .switch {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }
  .switch-label {
    color: var(--ink-muted);
  }
  .switch button {
    min-height: 2rem;
    padding: 0 var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  .switch button[aria-pressed="true"] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
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
    height: clamp(5.5rem, 16vh, 8.25rem);
  }
  /* A phone already gives the dock a third of the screen. */
  @media (max-width: 40rem) {
    .keys {
      height: clamp(5.5rem, 11vh, 7rem);
    }
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
    padding: 0 0 var(--space-1);
    border: 1px solid var(--key-edge);
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    background: var(--key-white);
    color: var(--key-black);
    cursor: pointer;
    /* Taps and holds play; a horizontal drag scrolls the keys on a phone. */
    touch-action: pan-x;
    user-select: none;
    -webkit-touch-callout: none;
    transition:
      transform var(--dur-fast) var(--ease),
      background-color var(--dur-fast) var(--ease),
      box-shadow var(--dur-melody-out) var(--ease);
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

  /* Function colors for lit chord tones. Tentative outlines and marks use the
     per-key-surface tokens, which meet 3:1 on ivory and black keys in both themes. */
  .fn-tonic {
    --fn: var(--fn-tonic);
    --fn-ink: var(--fn-tonic-ink);
    --fn-edge: var(--fn-tonic-on-white-key);
  }
  .fn-tonic.black {
    --fn-edge: var(--fn-tonic-on-black-key);
  }
  .fn-subdominant {
    --fn: var(--fn-subdominant);
    --fn-ink: var(--fn-subdominant-ink);
    --fn-edge: var(--fn-subdominant-on-white-key);
  }
  .fn-subdominant.black {
    --fn-edge: var(--fn-subdominant-on-black-key);
  }
  .fn-dominant {
    --fn: var(--fn-dominant);
    --fn-ink: var(--fn-dominant-ink);
    --fn-edge: var(--fn-dominant-on-white-key);
  }
  .fn-dominant.black {
    --fn-edge: var(--fn-dominant-on-black-key);
  }
  .fn-other {
    --fn: var(--fn-other);
    --fn-ink: var(--fn-other-ink);
    --fn-edge: var(--fn-other-on-white-key);
  }
  .fn-other.black {
    --fn-edge: var(--fn-other-on-black-key);
  }

  /* Chord tones before a guess glow neutral: no color may hint at the key. */
  [data-mode="hidden"] .key.chord {
    background: var(--key-glow-melody);
    color: var(--key-black);
  }

  /* Each light has its own form (tokens.css: gold is the melody sounding now).
     - Melody and held keys: a gold fill, pale champagne at the top deepening
       to ochre where the labels sit, with an inner glow. It lights quickly
       and fades out on release.
     - Chord tones: a flat function-color fill with the function's shape.
     - Drone: a pale green tint with a green bar across the top, the color of
       the drone switch. */
  .key::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(to bottom, var(--melody-soft), var(--melody) 45%);
    box-shadow: inset 0 0 0.6rem var(--melody-glow);
    opacity: 0;
    transition: opacity var(--dur-melody-out) var(--ease);
    pointer-events: none;
  }
  .key.melody::before,
  .key.held::before {
    opacity: 1;
    transition-duration: var(--dur-fast);
  }
  .key.melody,
  .key.held {
    color: var(--key-black);
  }
  /* The glow comes on fast and fades with the fill (--dur-melody-out) on
     release, from the base transition. */
  .key.melody,
  .key.held {
    transition-duration: var(--dur-fast);
  }
  .key.melody:not(.black),
  .key.held:not(.black) {
    box-shadow: 0 0 0.9rem var(--melody-glow);
  }
  .key.held {
    transform: translateY(2px);
  }
  /* A melody note inside a lit chord keeps the chord's fill, ringed in gold. */
  [data-mode="confirmed"] .key.chord.melody::before,
  [data-mode="confirmed"] .key.chord.held::before {
    opacity: 0;
  }
  [data-mode="confirmed"] .key.chord.melody,
  [data-mode="confirmed"] .key.chord.held {
    --ring: var(--melody);
    box-shadow: inset 0 0 0 0.25rem var(--ring);
  }
  /* White keys keep the outer glow under the ring. */
  [data-mode="confirmed"] .key.chord.melody:not(.black),
  [data-mode="confirmed"] .key.chord.held:not(.black) {
    box-shadow:
      inset 0 0 0 0.25rem var(--ring),
      0 0 0.9rem var(--melody-glow);
  }
  /* Gold on subdominant yellow is only 1.85:1, so on a yellow fill the ring
     takes the subdominant edge color instead (3.1:1). */
  [data-mode="confirmed"] .key.chord.fn-subdominant.melody,
  [data-mode="confirmed"] .key.chord.fn-subdominant.held {
    --ring: var(--fn-subdominant-on-white-key);
  }
  /* A green tint with a top border, so the bar still shows over a gold or
     function fill. */
  .key.drone {
    border-top: 0.5rem solid var(--drone-on-white-key);
    background: var(--drone-tint-white-key);
  }
  .key.black.drone {
    border-top-color: var(--drone-on-black-key);
    background: var(--drone-tint-black-key);
  }
  @media (prefers-reduced-motion: reduce) {
    /* No glow and no fade: the gold fill alone. */
    .key::before {
      box-shadow: none;
    }
    .key.melody:not(.black),
    .key.held:not(.black) {
      box-shadow: none;
    }
    [data-mode="confirmed"] .key.chord.melody:not(.black),
    [data-mode="confirmed"] .key.chord.held:not(.black) {
      box-shadow: inset 0 0 0 0.25rem var(--ring);
    }
  }

  /* Confirmed: chord tones fill with their function color and shape. */
  [data-mode="confirmed"] .key.chord {
    background: var(--fn);
    color: var(--fn-ink);
  }

  /* The reveal: when a key is confirmed, the fill fades in at --dur-reveal. */
  .revealing .key {
    transition-duration: var(--dur-fast), var(--dur-reveal), var(--dur-melody-out);
  }

  /* Tentative: an outline and mark in the key-surface function color, full opacity, no fill. */
  [data-mode="tentative"] .key.chord::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 calc(2 * var(--tentative-stroke)) var(--fn-edge);
    pointer-events: none;
  }
  [data-mode="tentative"] .key.chord :global(.mark) {
    color: var(--fn-edge);
  }

  .labels {
    position: relative;
    z-index: 1;
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
  .chord-name {
    font-size: 0.6875rem;
    font-weight: 600;
  }
  [data-mode="tentative"] .degree,
  [data-mode="tentative"] .chord-name {
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
  .shift {
    font-family: system-ui, sans-serif;
    font-size: 1.15em;
    line-height: 1;
  }

  /* Before a demo guess nothing key-relative shows; confirming fades it in. */
  [data-mode="hidden"] .labels {
    opacity: 0;
    visibility: hidden;
  }
</style>
