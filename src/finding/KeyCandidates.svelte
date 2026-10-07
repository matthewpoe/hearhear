<script>
  /**
   * "Help me find it", the easy mode: the keyFinding explainer verbatim, then a
   * two-drone comparison, the tune over the current home (the provisional C in
   * a fresh demo) and then over the top-ranked candidate (rankKeys). The user
   * picks the one that feels like home. Drones are unnamed until the choice,
   * which names the key and reveals the colors. The other top candidates
   * follow as further drones. No scores, no "best", no key names before then.
   * @import { Key } from "../types.js"
   */
  import explainers from "../../content/explainers.json" with { type: "json" };
  import { song } from "../store/song.js";
  import { rankKeys } from "../theory/index.js";
  import { easyModeHomes } from "./keys.js";
  import ListenButton from "./ListenButton.svelte";

  /** @type {{ onguess: (key: Pick<Key, "tonic" | "mode">) => void }} */
  let { onguess } = $props();

  /** Ranked candidates offered after the current home: one to compare, two more. */
  const CANDIDATES = 3;
  const { title, body } = explainers.keyFinding;

  // Fixed when easy mode opens, so the drones don't reshuffle under the user.
  const homes = easyModeHomes(song.get().key, rankKeys(song.get().notes), CANDIDATES);
  const pair = homes.slice(0, 2);
  const more = homes.slice(2);

  let showMore = $state(false);
</script>

{#snippet drone(/** @type {Pick<Key, "tonic" | "mode">} */ home, /** @type {number} */ n)}
  <li>
    <span class="name">Drone {n}</span>
    <span class="tests">
      <ListenButton label="Hear the tune over drone {n}" droneKey={home} />
      <button type="button" class="choose" onclick={() => onguess(home)}>
        Drone {n} feels like home
      </button>
    </span>
  </li>
{/snippet}

<div class="help" role="group" aria-labelledby="key-help-title">
  <h4 id="key-help-title">{title}</h4>
  <p class="explainer">{body}</p>

  <p>Play the tune over each drone. Which one feels like home?</p>
  <ol>
    {#each pair as home, index (index)}
      {@render drone(home, index + 1)}
    {/each}
  </ol>

  {#if more.length > 0}
    {#if showMore}
      <p>Neither? Try these homes too.</p>
      <ol>
        {#each more as home, index (index)}
          {@render drone(home, index + 3)}
        {/each}
      </ol>
    {:else}
      <button type="button" class="more" onclick={() => (showMore = true)}>
        Neither feels like home? Try more drones
      </button>
    {/if}
  {/if}
</div>

<style>
  .help {
    display: grid;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--paper);
  }
  h4 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  p {
    margin: 0;
    color: var(--ink-muted);
  }
  .explainer {
    max-width: 40rem;
    color: var(--ink);
  }
  ol {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .name {
    min-width: 6rem;
    font-weight: 500;
  }
  .tests {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: auto;
  }
  button.choose,
  button.more {
    justify-self: start;
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
</style>
