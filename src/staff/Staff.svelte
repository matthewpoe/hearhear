<script>
  // Placeholder (Phase 0). Owned by Stream C; see contracts/README.md.
  import { song } from "../store/song.js";
</script>

<section id="staff" class="placeholder" aria-label="Staff">
  <h2>Staff</h2>
  <p>Stream C builds this. The song has {$song.notes.length} notes.</p>
</section>

<style>
  .placeholder {
    padding: var(--space-4);
    border: 1px dashed var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-lg);
    font-weight: 500;
  }
  p {
    margin: 0;
    color: var(--ink-muted);
  }
</style>
