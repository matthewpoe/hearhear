<script>
  /**
   * One listening test: the melody over a candidate key's chord. One button
   * plays and stops, so keyboard focus stays on it as playback starts and
   * ends. If playback fails it says so and offers a retry.
   * @import { Key } from "../types.js"
   */
  import { listen, stopListening } from "./listen.js";

  /** @type {{ label: string, droneKey: Pick<Key, "tonic" | "mode"> }} */
  let { label, droneKey } = $props();

  /** @type {"idle" | "playing" | "failed"} */
  let status = $state("idle");
  /** Which play owns `status`: a newer play or a stop makes an older one stale. */
  let run = 0;

  async function play() {
    const mine = ++run;
    status = "playing";
    try {
      await listen(droneKey);
      if (mine === run) status = "idle";
    } catch (error) {
      console.error("Listening test failed", error);
      if (mine === run) status = "failed";
    }
  }

  function stopPlaying() {
    run++;
    status = "idle";
    stopListening();
  }

  $effect(() => () => {
    if (status === "playing") stopListening();
  });
</script>

<span class="listen">
  <button
    type="button"
    class:playing={status === "playing"}
    onclick={status === "playing" ? stopPlaying : play}
  >
    <span class="icon" class:stop={status === "playing"} aria-hidden="true"></span>
    {#if status === "playing"}
      Stop <span class="visually-hidden">{label}</span>
    {:else}
      {status === "failed" ? `Try again: ${label}` : label}
    {/if}
  </button>
  {#if status === "failed"}
    <span class="failed" role="alert">That didn't play. Check your sound and try again.</span>
  {/if}
</span>

<style>
  .listen {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--sound);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }
  /* A listening button is a sound control, so it wears --sound. */
  button:hover,
  .playing {
    background: var(--sound-soft);
  }
  .icon {
    width: 0.7rem;
    height: 0.7rem;
    background: var(--sound);
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
  .icon.stop {
    border-radius: 2px;
    clip-path: none;
  }
  .failed {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
</style>
