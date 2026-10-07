<script>
  // How the staff and chips name chords: one segmented choice. Each option's
  // tooltip is its newcomer gloss, with an example (content/explainers.json).
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { ui } from "../store/ui.js";
  import Segmented from "./Segmented.svelte";

  const GLOSS = explainers.options;

  /** @type {{ value: import("../types.js").LabelStyle, label: string, tip: string }[]} */
  const LABEL_STYLES = [
    { value: "roman", label: "Roman", tip: GLOSS.roman },
    { value: "nashville", label: "Nashville", tip: GLOSS.nashville },
    { value: "letters", label: "Letters", tip: GLOSS.letters },
    { value: "roman+letters", label: "Roman + letters", tip: GLOSS["roman+letters"] },
  ];
</script>

<Segmented
  name="label-style"
  legend="Chord labels"
  options={LABEL_STYLES}
  value={$ui.labelStyle}
  onchange={(value) =>
    ui.update({ labelStyle: /** @type {import("../types.js").LabelStyle} */ (value) })}
/>
