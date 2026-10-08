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

  /** The celebration closes on the student's own ×, never on its own. */
  let dismissed = $state(false);

  const rec = recorder;
  const busy = $derived($rec.status === "armed" || $rec.status === "recording");

  /** 4: the first three are done; the banner stays so the page never jumps. @type {1 | 2 | 3 | 4 | null} */
  const step = $derived(
    busy || $song.notes.length === 0
      ? null
      : !picked
        ? 1
        : $song.key.provisional
          ? 2
          : $song.chords.length === 0
            ? 3
            : dismissed
              ? null
              : 4,
  );

  /** The masthead's Guided lesson button pulses when the celebration lands. */
  $effect(() => {
    if (step !== 4) return;
    tick().then(() => {
      const entry = guidedEntry();
      entry?.classList.remove("celebrate-pulse");
      void entry?.offsetWidth;
      entry?.classList.add("celebrate-pulse");
    });
  });

  /** @returns {HTMLButtonElement | null} */
  function guidedEntry() {
    return /** @type {HTMLButtonElement | null} */ (document.querySelector("#guided-entry"));
  }

  /** Step 2 sends the student to the key box: scroll to it and ring it. */
  function toKeyBox(scroll = true) {
    const box = document.getElementById("key-prompt");
    if (!box) return;
    box.classList.remove("banner-ring");
    if (scroll) box.scrollIntoView({ behavior: "smooth", block: "center" });
    void box.offsetWidth;
    box.classList.add("banner-ring");
  }

  $effect(() => {
    if (step === 2) tick().then(() => toKeyBox(false));
  });

  /** @param {import("../types.js").Song} tune */
  function choose(tune) {
    markPicked();
    if (tune.id !== $song.id) song.open(tune);
  }
</script>

{#if step}
  {#key step}
    <section class="banner" aria-labelledby="step-banner-title" aria-live="polite">
      <span class="num" aria-hidden="true">{step === 4 ? "✓" : step}</span>
      <div class="text">
        {#if step === 1}
          <h2 id="step-banner-title">Pick a song</h2>
          <p>
            <b class="do">Choose a tune</b>, or keep Ode to Joy, which is open below. Its key is
            hidden, so your ear finds home.
          </p>
          <div class="chips" id="song-chooser" role="group" aria-label="Songs">
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
            Your ear finds home in the box below:
            <button type="button" class="link" onclick={() => toKeyBox()}
              ><b class="do">by eye or by ear ↓</b></button
            >
          </p>
        {:else if step === 4}
          <h2 id="step-banner-title">
            Nice, your first chord!
            <span class="burst" aria-hidden="true"
              ><i class="tonic"></i><i class="sub"></i><i class="dom"></i></span
            >
          </h2>
          <p>
            Keep going, then press <b class="do">Review my chords</b> for the tutor's read of your
            chart. Want to learn more?
            <button type="button" class="link" onclick={() => guidedEntry()?.click()}
              ><b class="do">Try the guided lesson</b></button
            >.
          </p>
        {:else}
          <h2 id="step-banner-title">Place a chord</h2>
          <p>
            <b class="do">Click a note on the staff</b>, then
            <b class="hear">hover the chords to hear each one</b> under the melody.
            <b class="do">Pick the one that sounds right.</b>
          </p>
        {/if}
      </div>
      {#if step < 4}<span class="count">Step {step} of 3</span>
      {:else}<button
          type="button"
          class="close"
          aria-label="Close"
          onclick={() => (dismissed = true)}>×</button
        >{/if}
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
  /* Darker than --sound, so green text keeps 4.5:1 on the banner's tint. */
  .hear {
    color: color-mix(in srgb, var(--sound) 78%, #000);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 0.2em;
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
  .chip {
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
  .chip:hover {
    filter: brightness(0.95);
  }
  .chip:focus-visible {
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
  .close {
    flex: none;
    width: 36px;
    height: 36px;
    border: 1.5px solid var(--accent);
    border-radius: 50%;
    background: var(--surface);
    color: var(--accent);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }
  .burst {
    display: inline-flex;
    gap: 6px;
    margin-left: 10px;
    vertical-align: middle;
  }
  .burst i {
    display: inline-block;
    width: 14px;
    height: 14px;
    animation: pop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .burst .tonic {
    border-radius: 50%;
    background: var(--fn-tonic);
  }
  .burst .sub {
    background: var(--fn-subdominant);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
    animation-delay: 90ms;
  }
  .burst .dom {
    background: var(--fn-dominant);
    animation-delay: 180ms;
  }
  @keyframes pop {
    0% {
      opacity: 0;
      transform: translateY(8px) scale(0.2) rotate(-40deg);
    }
    70% {
      opacity: 1;
      transform: translateY(-6px) scale(1.25) rotate(8deg);
    }
    100% {
      transform: none;
    }
  }
  :global(#guided-entry.celebrate-pulse) {
    animation: entry-pulse 1.4s ease-out 2;
  }
  @keyframes entry-pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent);
    }
    100% {
      box-shadow: 0 0 0 14px transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .burst i,
    :global(#guided-entry.celebrate-pulse) {
      animation: none;
    }
  }
  @media (max-width: 640px) {
    .count {
      display: none;
    }
  }
</style>
