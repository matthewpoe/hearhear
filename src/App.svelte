<script>
  // Layout only. Each region is one stream's component; they talk through the
  // stores (src/store) and staff events, never to each other directly.
  import Landing from "./finding/Landing.svelte";
  import Staff from "./staff/Staff.svelte";
  import ChordDropdown from "./chords/ChordDropdown.svelte";
  import TutorPanel from "./tutor/TutorPanel.svelte";
  import Piano from "./input/Piano.svelte";
  import ThemeToggle from "./ThemeToggle.svelte";
  import Toolbar from "./toolbar/Toolbar.svelte";
  import Callouts from "./callouts/Callouts.svelte";
  import { song } from "./store/song.js";
</script>

<header class="masthead">
  <h1>Hear Hear</h1>
  <p class="tagline">Think in relationships, not pitches.</p>
  <div class="masthead-tools">
    <Callouts />
    <ThemeToggle />
  </div>
</header>

<main class="workspace">
  <Landing />
  <Staff />
  {#if $song.notes.length > 0}
    <Toolbar />
  {/if}
  <ChordDropdown />
  <TutorPanel />
</main>

<footer class="keyboard-dock">
  <Piano />
</footer>

<style>
  .masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
  h1 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 700;
  }
  .tagline {
    margin: 0;
    color: var(--ink-muted);
  }
  .masthead-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-left: auto;
  }
  .workspace {
    display: grid;
    gap: var(--space-4);
    max-width: 72rem;
    margin: 0 auto;
    padding: var(--space-4);
  }
  .keyboard-dock {
    position: sticky;
    bottom: 0;
    background: var(--surface);
    border-top: 1px solid var(--rule);
  }
</style>
