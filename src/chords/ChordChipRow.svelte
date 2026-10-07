<script>
  // The placed chords in song order, each a chip with shape, color, and label
  // in the user's label style; choosing one reopens the dropdown on its note.
  // Below them, the tutor's suggestions as alternatives to hear. A suggestion
  // never changes the song: the user tries it in the dropdown and decides.
  /** @import { ChordSpec } from "../types.js" */
  import { song } from "../store/song.js";
  import { ui, keyLabelMode } from "../store/ui.js";
  import { suggestions, isStale } from "../store/suggestions.js";
  import ChordBadge from "./ChordBadge.svelte";
  import { chordView } from "./chordView.js";
  import { whereOf } from "./where.js";

  /**
   * @type {{
   *   onopen: (noteId: string, anchor: HTMLElement) => void,
   *   onhear: (noteId: string, chord: ChordSpec) => void,
   * }}
   */
  const { onopen, onhear } = $props();

  const labelMode = $derived(keyLabelMode($song, $ui));

  /** @param {ChordSpec} chord */
  const viewOf = (chord) => chordView(chord, $song.key, labelMode, $ui.labelStyle);

  /** @param {string} noteId */
  function placeOf(noteId) {
    const note = $song.notes.find((n) => n.id === noteId);
    if (!note) return null;
    return { start: note.start, where: whereOf(note, $song.meter) };
  }

  const chips = $derived(
    $song.chords
      .map((chord) => ({ chord, place: placeOf(chord.noteId) }))
      .filter((c) => c.place !== null)
      .sort((a, b) => (a.place?.start ?? 0) - (b.place?.start ?? 0)),
  );

  // A suggestion whose note is gone can't be placed honestly, so it is
  // counted, not re-anchored.
  const ideas = $derived(
    $suggestions.items
      .map((idea) => ({ idea, place: placeOf(idea.noteId) }))
      .filter((s) => s.place !== null),
  );
  const unplaced = $derived($suggestions.items.length - ideas.length);
  const stale = $derived(isStale($suggestions, $song.version));
</script>

{#if chips.length === 0}
  <p class="empty">
    {#if $song.notes.length === 0}
      Load a tune, then click a note on the staff to try chords under it.
    {:else if labelMode === "hidden"}
      Choose the key first, then click a note to try chords under it.
    {:else}
      Click a note on the staff to try chords under it.
    {/if}
  </p>
{:else}
  <ol class="chips" aria-label="Placed chords">
    {#each chips as { chord, place } (chord.id)}
      {@const view = viewOf(chord)}
      <li>
        <button
          type="button"
          class="chip"
          aria-label="{view.name}, {place?.where}. Change chord"
          onclick={(event) => onopen(chord.noteId, event.currentTarget)}
        >
          <ChordBadge {view} />
          <span class="where" aria-hidden="true">{place?.where}</span>
        </button>
      </li>
    {/each}
  </ol>
{/if}

{#if ideas.length > 0 || unplaced > 0}
  <section class="ideas" class:stale aria-labelledby="tutor-ideas-title">
    <h3 id="tutor-ideas-title">Tutor's ideas to try</h3>
    {#if stale}
      <p class="note">
        You've changed the song since the tutor suggested these. Hear them before you trust them.
      </p>
    {/if}
    {#if unplaced > 0}
      <p class="note">
        {unplaced === 1 ? "One idea was" : `${unplaced} ideas were`} for a note that's no longer there.
      </p>
    {/if}
    <ul>
      {#each ideas as { idea, place } (idea.id)}
        {@const view = viewOf(idea.chord)}
        <li class="idea">
          <ChordBadge {view} />
          <span class="where">{place?.where}</span>
          <span class="confidence">{idea.confidence} confidence</span>
          <span class="actions">
            <button
              type="button"
              aria-label="Hear {view.name} at {place?.where}"
              onclick={() => onhear(idea.noteId, idea.chord)}>Hear it</button
            >
            <button
              type="button"
              aria-label="Compare {view.name} with other chords at {place?.where}"
              onclick={(event) => onopen(idea.noteId, event.currentTarget)}>Compare</button
            >
          </span>
          <p class="reason">{idea.reason}</p>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .empty,
  .note {
    margin: 0;
    color: var(--ink-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chip {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-1);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--rule);
  }
  .where,
  .confidence {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .ideas {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  .ideas ul {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .idea {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    padding: var(--space-2);
    border: 1px dashed var(--rule);
    border-radius: var(--radius-md);
  }
  .stale .idea {
    border-style: dotted;
  }
  .actions {
    display: inline-flex;
    gap: var(--space-1);
    margin-left: auto;
  }
  .actions button {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .reason {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--text-sm);
  }
</style>
