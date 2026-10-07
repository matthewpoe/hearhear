<script>
  // The audition voicing switch (decision D4), with the Chords step. "as-song"
  // is off: only the tested chord changes. Its newcomer gloss is the switch's
  // tooltip, like every other option's.
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { CONTROLS } from "../lib/controls.js";
  import { ui } from "../store/ui.js";
  import Switch from "./Switch.svelte";

  const on = $derived($ui.auditionVoicing === "from-candidate");
</script>

<Switch
  id="voice-leading"
  label={CONTROLS.voiceLeading}
  tip={explainers.options.voiceLeading}
  checked={on}
  onchange={() => ui.update({ auditionVoicing: on ? "as-song" : "from-candidate" })}
/>
