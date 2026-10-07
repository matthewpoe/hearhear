<script>
  // Scale-degree numbers under the melody, with the Key step: the numbers
  // count from home.
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { CONTROLS } from "../lib/controls.js";
  import { ui } from "../store/ui.js";
  import Switch from "./Switch.svelte";
</script>

<Switch
  id="degrees"
  label={CONTROLS.degrees}
  tip={explainers.options.degrees}
  checked={$ui.showDegrees}
  onchange={() => ui.update({ showDegrees: !$ui.showDegrees })}
/>
