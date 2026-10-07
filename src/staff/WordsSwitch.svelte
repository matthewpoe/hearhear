<script>
  // The "Words" switch: shows or hides the song's syllables on the lyric line
  // under the staff. It appears only when the song has words; on by default.
  // It sits in the tool row because it changes how the staff itself reads.
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { hasLyrics } from "./abc.js";
  import Switch from "../toolbar/Switch.svelte";
  import { CONTROLS } from "../lib/controls.js";

  const shown = $derived(hasLyrics($song));
</script>

{#if shown}
  <Switch
    id="words"
    label={CONTROLS.words}
    tip={explainers.options.words}
    checked={$ui.showWords}
    onchange={() => ui.update({ showWords: !$ui.showWords })}
  />
{/if}
