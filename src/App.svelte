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
  import GuidedEntry from "./guided/GuidedEntry.svelte";
  import GuidedPath from "./guided/GuidedPath.svelte";
  import RecordBar from "./record/RecordBar.svelte";
  import { song } from "./store/song.js";

  /** @type {HTMLElement | undefined} */
  let dock = $state();

  // The page keeps the dock's height as scroll padding (global.css), so focus
  // and scrollIntoView never leave a control under the keyboard.
  /**
   * A mouse press on a dock button focuses it without scrolling: the dock is
   * sticky, and Chrome would otherwise scroll its place at the page's end
   * into view. Keyboard focus and the piano keys' own pointer handling are
   * unchanged.
   * @param {MouseEvent} event
   */
  function focusInPlace(event) {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button");
    if (!button || button.disabled || button.classList.contains("key")) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
  }

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
  <GuidedEntry />
</header>

<main class="workspace">
  <!-- Record mode: the take in progress, or the open tune's title (if it's the user's). -->
  <RecordBar />
  <!-- The empty landing has nothing to play or print, so no staff yet. -->
  {#if $song.notes.length > 0}
    <Staff />
  {/if}
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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<footer class="keyboard-dock" bind:this={dock} onmousedown={focusInPlace}>
  <GuidedPath />
  <Piano />
</footer>

<style>
  /* A Bauhaus bar across the top: violet, green and ink rectangles in the
     interface's own colors (tokens.css), never the function primaries. */
  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-top: var(--band) solid;
    border-image: linear-gradient(
        to right,
        var(--accent) 0 62%,
        var(--sound) 62% 81%,
        var(--ink) 81% 100%
      )
      1;
  }
  /* The wordmark is a solid violet block, square-cornered like a poster. */
  h1 {
    margin: 0;
    padding: 0 var(--space-2);
    background: var(--accent);
    color: var(--accent-ink);
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  /* The masthead's song picker: the pressed tune takes the selected color. */
  .masthead > :global(.picker button[aria-pressed="true"]) {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
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
    flex: 1 0 auto;
    width: 100%;
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
  /* The dock is where sound comes from, so its frame is --sound. */
  .keyboard-dock {
    position: sticky;
    bottom: 0;
    background: var(--surface);
    border-top: var(--band) solid var(--sound);
  }
</style>
