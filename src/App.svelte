<script>
  // Layout only. Each region is one stream's component; they talk through the
  // stores (src/store) and staff events, never to each other directly.
  // The music is the hero: the staff comes first in <main>, under a slim
  // masthead. Below it, the step column (the key question, then the chords)
  // and, on wide screens, the tutor beside it. The keyboard stays docked.
  import Landing from "./finding/Landing.svelte";
  import Staff from "./staff/Staff.svelte";
  import ChordDropdown from "./chords/ChordDropdown.svelte";
  import TutorPanel from "./tutor/TutorPanel.svelte";
  import TrustPanel from "./trust/TrustPanel.svelte";
  import Piano from "./input/Piano.svelte";
  import ThemeToggle from "./ThemeToggle.svelte";
  import SongPicker from "./toolbar/SongPicker.svelte";
  import Callouts from "./callouts/Callouts.svelte";
  import { song } from "./store/song.js";

  /** @type {HTMLElement | undefined} */
  let dock = $state();

  // The page keeps the dock's height as scroll padding (global.css), so focus
  // and scrollIntoView never leave a control under the keyboard.
  $effect(() => {
    if (!dock) return;
    const root = document.documentElement;
    const target = dock;
    const observer = new ResizeObserver(() =>
      root.style.setProperty("--dock-height", `${target.offsetHeight}px`),
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--dock-height");
    };
  });
</script>

<header class="masthead">
  <h1>Hear Hear</h1>
  <p class="tagline">Think in relationships, not pitches.</p>
  {#if $song.notes.length > 0}
    <SongPicker />
  {/if}
  <div class="masthead-tools">
    <Callouts />
    <ThemeToggle />
  </div>
</header>

<main class="workspace">
  <Staff />
  <div class="columns">
    <div class="step">
      <Landing />
      <ChordDropdown />
    </div>
    <div class="side">
      <TutorPanel />
      <TrustPanel />
    </div>
  </div>
  <p class="credits">
    Piano samples: Salamander Grand Piano by Alexander Holm,
    <a href="https://creativecommons.org/licenses/by/3.0/" rel="license noopener" target="_blank"
      >CC BY 3.0</a
    >.
  </p>
</main>

<footer class="keyboard-dock" bind:this={dock}>
  <Piano />
</footer>

<style>
  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-4);
  }
  h1 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
  }
  .tagline {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .masthead-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
  }
  /* No positioned or transformed wrappers here: the chord dropdown is placed
     in page coordinates and audits its ancestors for containing blocks. */
  .workspace {
    display: grid;
    gap: var(--space-3);
    max-width: 80rem;
    margin: 0 auto;
    padding: 0 var(--space-4) var(--space-4);
  }
  .columns,
  .step,
  .side {
    display: grid;
    gap: var(--space-3);
    align-content: start;
    min-width: 0;
  }
  @media (min-width: 1100px) {
    .columns {
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: start;
    }
  }
  /* On phones the tagline would cost a line of the music's space. */
  @media (max-width: 40rem) {
    .tagline {
      display: none;
    }
    .masthead,
    .workspace {
      padding-inline: var(--space-3);
    }
    /* Title and toggles share the first line; the song picker takes the next. */
    .masthead-tools {
      order: 1;
    }
    .masthead > :global(.picker) {
      order: 2;
    }
  }
  .credits {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-muted);
  }
  .credits a {
    color: inherit;
  }
  .keyboard-dock {
    position: sticky;
    bottom: 0;
    background: var(--surface);
    border-top: 1px solid var(--rule);
  }
</style>
