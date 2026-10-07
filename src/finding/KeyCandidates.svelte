<script>
  /**
   * "Help me find it": the three keys the melody's notes point to most
   * (Krumhansl-Schmuckler, via rankKeys), offered as candidates to test with a
   * drone, never as a verdict. No scores, no "best". Notes outside a key are
   * an annotation, not a reason to drop it.
   * @import { Key } from "../types.js"
   */
  import { song } from "../store/song.js";
  import { rankKeys } from "../theory/index.js";
  import { keyName } from "./keys.js";
  import ListenButton from "./ListenButton.svelte";

  /** @type {{ onguess: (key: Pick<Key, "tonic" | "mode">) => void }} */
  let { onguess } = $props();

  const CANDIDATES = 3;
  const candidates = $derived(rankKeys($song.notes).slice(0, CANDIDATES));

  /**
   * "F natural, C" from spelled pitches like "F4", "C5", deduplicated.
   * @param {{ pitch: string }[]} outOfScale
   */
  function outsideNotes(outOfScale) {
    const names = new Set(outOfScale.map(({ pitch }) => pitch.replace(/-?\d+$/, "")));
    return [...names].map((name) => (name.length === 1 ? `${name} natural` : name)).join(", ");
  }
</script>

<div class="help" role="group" aria-labelledby="key-help-title">
  <h4 id="key-help-title">Three places home might be</h4>
  <p>Hold this note underneath. Does the melody settle or itch?</p>
  <ul>
    {#each candidates as { key, outOfScale } (keyName(key))}
      <li>
        <span class="name">{keyName(key)}</span>
        {#if outOfScale.length > 0}
          <span class="aside">Outside {keyName(key)}: {outsideNotes(outOfScale)}</span>
        {/if}
        <span class="tests">
          <ListenButton label="Hold {key.tonic} underneath" droneKey={key} />
          <button type="button" class="choose" onclick={() => onguess(key)}>
            Make {keyName(key)} home
          </button>
        </span>
      </li>
    {/each}
  </ul>
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
  ul {
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
  .aside {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .tests {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-left: auto;
  }
  .choose {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
</style>
