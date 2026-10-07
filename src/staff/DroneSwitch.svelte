<script>
  // The "Drone on home" switch, with the Key step: while on, playing the song
  // holds its home chord underneath (homeDrone.js). Before the key is chosen
  // it is disabled, and its tooltip leads with the reason: until then the
  // drone test is the key finder's.
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { CONTROLS } from "../lib/controls.js";
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { droneBlocked } from "./homeDrone.js";
  import Switch from "../toolbar/Switch.svelte";

  const ABOUT = explainers.options.drone;

  const blocked = $derived(droneBlocked($song, $ui));
  const on = $derived($ui.droneOn && !blocked);
</script>

<Switch
  id="drone"
  label={CONTROLS.drone}
  tip={blocked ? `${blocked} ${ABOUT}` : ABOUT}
  checked={on}
  disabled={blocked !== null}
  onchange={() => ui.update({ droneOn: !$ui.droneOn })}
/>
