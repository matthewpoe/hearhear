<script>
  // The "Swing" switch: plays pairs of eighths long-short, for every song (a
  // swung Ode is a fine experiment). On when the song swings (swing > 1);
  // toggling it is one undoable song change (song.setSwing), so it persists
  // and reaches the tutor. The staff stays in straight eighths; its "Swing"
  // marking follows the switch.
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { CONTROLS } from "../lib/controls.js";
  import { song } from "../store/song.js";
  import Switch from "../toolbar/Switch.svelte";

  const on = $derived(($song.swing ?? 1) > 1);
</script>

<Switch
  id="swing"
  label={CONTROLS.swing}
  tip={explainers.options.swing}
  checked={on}
  onchange={() => song.setSwing(!on)}
/>
