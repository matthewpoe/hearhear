<script>
  // The "Drone on home" switch: while on, playing the song holds its home
  // chord underneath (homeDrone.js). Before the key is chosen it is disabled,
  // with the reason beside it: until then the drone test is the key finder's.
  import { song } from "../store/song.js";
  import { ui } from "../store/ui.js";
  import { droneBlocked } from "./homeDrone.js";

  const blocked = $derived(droneBlocked($song, $ui));
  const on = $derived($ui.droneOn && !blocked);
</script>

<span class="drone">
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={on}
    aria-describedby={blocked ? "drone-blocked" : undefined}
    title="Hold the home chord under the tune while it plays"
    disabled={blocked !== null}
    onclick={() => ui.update({ droneOn: !$ui.droneOn })}
  >
    <span class="dot" aria-hidden="true"></span>
    Drone on home
  </button>
  {#if blocked}
    <span id="drone-blocked" class="reason">{blocked}</span>
  {/if}
</span>

<style>
  .drone {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .switch:disabled {
    color: var(--ink-muted);
    cursor: not-allowed;
  }
  .dot {
    width: 0.7rem;
    height: 0.7rem;
    border: 2px solid currentColor;
    border-radius: 50%;
    transition: background var(--dur-fast) var(--ease);
  }
  /* On, the drone is sounding: its switch takes the --sound color. */
  .switch[aria-checked="true"] {
    border-color: var(--sound);
    background: var(--sound-soft);
  }
  [aria-checked="true"] .dot {
    border-color: var(--sound);
    background: var(--sound);
  }
  .reason {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
</style>
