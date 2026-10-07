<script>
  // "How much should you trust the tutor?" The latest eval run's headline
  // numbers, each with a plain-language gloss and its sample size. A fixture
  // run replays canned replies, so it says so instead of showing its numbers
  // as a measurement of the model. Only the summaries are imported (Vite's
  // named JSON exports), so the per-reply records stay out of the bundle.
  import { run, headline, byTune } from "../../evals/results/latest.json";

  /** @typedef {{ count: number, total: number } | null} Rate */

  const date = new Date(run.date).toLocaleDateString(undefined, { dateStyle: "medium" });
  const isFixture = run.mode !== "live";

  /** @param {Rate} rate */
  function percent(rate) {
    return rate && rate.total ? `${Math.round((100 * rate.count) / rate.total)}%` : "—";
  }

  /** @param {Rate} rate */
  function outOf(rate) {
    return rate && rate.total ? `${rate.count} of ${rate.total}` : "nothing to count";
  }

  const changePoints = byTune.reduce((sum, t) => sum + t.changePoints, 0);

  const measures = [
    {
      label: "Offers the hymnal's chord",
      rate: headline.hitRate,
      gloss: `At ${changePoints} chord changes in ${byTune.length} public-domain hymns, how often the tutor's candidates included the chord a published hymnal uses. A miss isn't always wrong: a hymnal picks one good chord of several.`,
    },
    {
      label: "The app's own top pick, for comparison",
      rate: headline.baseline.hitRate,
      gloss:
        "The same test for the dropdown's best-fitting chord, which uses rules, not Claude. Where the tutor beats this, it's earning its keep.",
    },
    {
      label: "Clashes with the melody",
      rate: headline.clashRate,
      gloss:
        "How often a suggested chord rubs against the melody note it sits under. Lower is better, and your ear will catch the ones that slip through.",
    },
    {
      label: "Holds back at a nudge",
      rate: headline.pedagogy,
      gloss:
        "How often the first hint pointed you where to listen without naming a chord. The tutor is meant to leave the guess to you.",
    },
    {
      label: "Replies the app could read",
      rate: headline.schemaValidity,
      gloss:
        "Replies in the exact shape the app expects. Anything else is set aside, never played.",
    },
    {
      label: "Chord numbers and names agree",
      rate: headline.agreement,
      gloss:
        "Suggestions whose Roman numeral and letter name are the same chord. The app drops the ones that don't.",
    },
  ];
</script>

<!-- Collapsed under the tutor: the heading is the summary, so the region
     keeps its name and stays one click away. -->
<section class="trust" aria-labelledby="trust-heading">
  <details>
    <summary><h2 id="trust-heading">How much should you trust the tutor?</h2></summary>
    <div class="body">
      {#if isFixture}
        <p class="notice">
          <strong>No measurement yet.</strong> The last eval run, on {date}, used recorded stand-in
          replies instead of Claude. It checked that the eval's plumbing works (asking, streaming,
          and scoring {headline.replies} replies), not how good the tutor's suggestions are. Real numbers
          arrive with the first live run.
        </p>
      {:else}
        <p class="meta">
          From the eval run on {date}, against <span class="model">{run.model}</span>, with
          {headline.replies} questions about {byTune.length} public-domain hymns.
        </p>

        <dl class="measures">
          {#each measures as measure (measure.label)}
            <div class="measure">
              <dt>{measure.label}</dt>
              <dd class="figure">
                {percent(measure.rate)} <span class="count">({outOf(measure.rate)})</span>
              </dd>
              <dd class="gloss">{measure.gloss}</dd>
            </div>
          {/each}
          <div class="measure">
            <dt>Time to a full reply</dt>
            <dd class="figure">
              {headline.latencyMs.p50 ?? "—"} ms typical, {headline.latencyMs.p95 ?? "—"} ms slowest
            </dd>
            <dd class="gloss">
              The middle of the pack, and the slowest one in twenty. The first words usually appear
              after {headline.firstDeltaMs.p50 ?? "—"} ms.
            </dd>
          </div>
        </dl>

        {#if headline.excluded}
          <p class="meta">
            {headline.excluded} replies that a fallback model helped write were left out.
          </p>
        {/if}
      {/if}

      <p class="meta">
        Every number here is a reason to listen, not to believe: the tutor suggests, and your ear
        decides.
      </p>
    </div>
  </details>
</section>

<style>
  .trust {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
  }
  summary {
    padding: var(--space-1) 0;
    cursor: pointer;
  }
  h2 {
    display: inline;
    margin: 0;
    font-size: var(--text-md);
    font-weight: 500;
  }
  .body {
    display: grid;
    gap: var(--space-3);
    padding-top: var(--space-2);
  }
  .notice {
    margin: 0;
    padding: var(--space-3);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--paper);
  }
  .meta {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
  .model {
    font-weight: 500;
    color: var(--ink);
  }
  .measures {
    display: grid;
    gap: var(--space-3);
    margin: 0;
  }
  .measure {
    display: grid;
    gap: var(--space-1);
  }
  dt {
    font-weight: 500;
  }
  dd {
    margin: 0;
  }
  .figure {
    font-size: var(--text-lg);
  }
  .count,
  .gloss {
    color: var(--ink-muted);
    font-size: var(--text-sm);
  }
</style>
