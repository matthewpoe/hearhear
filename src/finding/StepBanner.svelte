<script>
  /**
   * The three first steps as one banner over the workspace: pick a song,
   * identify the key, place a chord. It sits in the same place for each step
   * and bounces once when a step lands. The action words carry the app's
   * colors: violet for what you do, green for what you hear. It hides
   * everything else nothing; once a chord is placed it goes away.
   */
  import { tick } from "svelte";
  import { song } from "../store/song.js";
  import { DEMO_TUNES } from "./demoTunes.js";
  import { recorder } from "../record/tunes.js";

  const PICKED = "hearhear.stepBanner.picked";

  /** @returns {boolean} */
  function readPicked() {
    try {
      return sessionStorage.getItem(PICKED) === "true";
    } catch {
      return false;
    }
  }

  let picked = $state(readPicked());
  const firstSongId = $song.id;

  /** Step 1 is done once a song is chosen, or the open one is changed or keyed. */
  $effect(() => {
    if (picked) return;
    if ($song.id !== firstSongId || !$song.key.provisional) markPicked();
  });

  function markPicked() {
    picked = true;
    try {
      sessionStorage.setItem(PICKED, "true");
    } catch {
      // Storage blocked: the banner still moves on for this page.
    }
  }

  const rec = recorder;
  const busy = $derived($rec.status === "armed" || $rec.status === "recording");

  /** @type {1 | 2 | 3 | null} */
  const step = $derived(
    busy || $song.notes.length === 0
      ? null
      : !picked
        ? 1
        : $song.key.provisional
          ? 2
          : $song.chords.length === 0
            ? 3
            : null,
  );

  /** @param {import("../types.js").Song} tune */
  function choose(tune) {
    markPicked();
    if (tune.id !== $song.id) song.open(tune);
  }

  // Step 2's buttons press the real controls, so they behave exactly as the
  // ones on the page do: the transport's Play, and the key box's by-ear path.
  function press(/** @type {string} */ selector) {
    /** @type {HTMLButtonElement | null} */ (document.querySelector(selector))?.click();
  }

  async function findByEar() {
    const box = document.getElementById("key-prompt");
    box?.classList.remove("banner-ring");
    press("#key-prompt button.help[aria-expanded='false']");
    await tick();
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Restart the ring so it pulses on every press.
    void box?.offsetWidth;
    box?.classList.add("banner-ring");
  }
</script>

{#if step}
  {#key step}
    <section class="banner" aria-labelledby="step-banner-title" aria-live="polite">
      <span class="num" aria-hidden="true">{step}</span>
      <div class="text">
        {#if step === 1}
          <h2 id="step-banner-title">Pick a song</h2>
          <p>
            <b class="do">Choose a tune</b>, or keep Ode to Joy, which is open below. Its key is
            hidden, so your ear finds home.
          </p>
          <div class="chips" role="group" aria-label="Songs">
            {#each DEMO_TUNES as { song: tune } (tune.id)}
              <button
                type="button"
                class="chip"
                aria-pressed={tune.id === $song.id}
                onclick={() => choose(tune)}>{tune.title}</button
              >
            {/each}
            <button
              type="button"
              class="chip record"
              onclick={() => {
                markPicked();
                recorder.record();
              }}><span aria-hidden="true">●</span> Record your own</button
            >
          </div>
        {:else if step === 2}
          <h2 id="step-banner-title">Identify the key</h2>
          <p>
            <b class="hear">Press Play</b> and listen for the note that feels like home, then
            <b class="do">pick it below</b>. Not sure? <b class="hear">Help me find it</b> plays the tune
            over three candidate homes; choose the one that settles.
          </p>
          <div class="chips">
            <button
              type="button"
              class="action hear"
              onclick={() => press(".transport button.control")}>▶ Play</button
            >
            <button type="button" class="action hear-soft" onclick={findByEar}
              >Help me find it</button
            >
          </div>
        {:else}
          <h2 id="step-banner-title">Place a chord</h2>
          <p>
            <b class="do">Click a note on the staff</b>, then
            <b class="hear">hover the chords to hear each one</b> under the melody.
            <b class="do">Pick the one that sounds right.</b>
          </p>
        {/if}
      </div>
      <span class="count">Step {step} of 3</span>
    </section>
  {/key}
{/if}

<style>
  .banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3, 16px);
    margin: 0 0 var(--space-3, 12px);
    padding: 16px 20px;
    border: 2px solid var(--accent);
    border-left-width: 8px;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--ink);
    box-shadow: 0 4px 0 color-mix(in srgb, var(--accent) 35%, transparent);
    animation: land 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes land {
    0% {
      opacity: 0;
      transform: translateY(-14px) scale(0.98);
    }
    60% {
      opacity: 1;
      transform: translateY(4px) scale(1.01);
    }
    100% {
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .banner {
      animation: none;
    }
  }
  .num {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 20px;
    font-weight: 700;
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: var(--text-xl, 1.5rem);
    font-weight: 700;
    line-height: 1.15;
  }
  p {
    margin: 0;
    max-width: 62rem;
  }
  .do {
    color: var(--accent);
  }
  .hear {
    color: var(--sound);
  }
  .count {
    flex: none;
    color: var(--ink-muted);
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
  .chip,
  .action {
    min-height: 40px;
    padding: 6px 14px;
    border: 1.5px solid var(--accent);
    border-radius: 999px;
    background: var(--surface);
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .chip.record span {
    color: #c7362b;
  }
  .action.hear {
    border-color: var(--sound);
    background: var(--sound);
    color: var(--sound-ink);
  }
  .action.hear-soft {
    border-color: var(--sound);
    background: var(--surface);
    color: var(--sound);
  }
  .chip:hover,
  .action:hover {
    filter: brightness(0.95);
  }
  .chip:focus-visible,
  .action:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  /* The key box, ringed when step 2 sends the student to it. */
  :global(#key-prompt.banner-ring) {
    border-radius: 12px;
    animation: ring 1.6s ease-out 1;
  }
  @keyframes ring {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent);
    }
    100% {
      box-shadow: 0 0 0 14px transparent;
    }
  }
  @media (max-width: 640px) {
    .count {
      display: none;
    }
  }
</style>
