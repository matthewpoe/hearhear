<script>
  /**
   * One listening test: the melody alone, or over a drone. While it plays the
   * button stops it; if playback fails it says so and offers a retry.
   * @import { Key } from "../types.js"
   */
  import { listen, stopListening } from "./listen.js";

  /** @type {{ label: string, droneKey?: Key | null }} */
  let { label, droneKey = null } = $props();

  /** @type {"idle" | "playing" | "failed"} */
  let status = $state("idle");

  async function play() {
    status = "playing";
    try {
      await listen(droneKey);
      status = "idle";
    } catch (error) {
      console.error("Listening test failed", error);
      status = "failed";
    }
  }

  $effect(() => () => {
    if (status === "playing") stopListening();
  });
</script>

<span class="listen">
  {#if status === "playing"}
    <button type="button" class="playing" onclick={stopListening}>
      <span class="icon stop" aria-hidden="true"></span>
      Stop <span class="visually-hidden">{label}</span>
    </button>
  {:else}
    <button type="button" onclick={play}>
      <span class="icon play" aria-hidden="true"></span>
      {status === "failed" ? `Try again: ${label}` : label}
    </button>
  {/if}
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
    border: 1px solid var(--ink);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease);
  }
  button:hover,
  .playing {
    background: var(--paper);
  }
  .icon {
    width: 0.7rem;
    height: 0.7rem;
    background: var(--ink);
  }
  .play {
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
  .stop {
    border-radius: 2px;
  }
  .failed {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
</style>
