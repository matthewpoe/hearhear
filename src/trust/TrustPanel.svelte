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

  const reviews = byTune.filter((t) => t.kinds.review).length;

  /**
   * One measure summed over the tunes for one kind of request.
   * @param {"review" | "check"} kind
   * @param {"alternatives"} key
   * @returns {Rate}
   */
  function kindRate(kind, key) {
    let count = 0;
    let total = 0;
    for (const tune of byTune) {
      /** @type {Record<string, Rate> | undefined} */
      const k = /** @type {any} */ (tune.kinds)[kind];
      const r = k?.[key];
      if (r) {
        count += r.count;
        total += r.total;
      }
    }
    return total ? { count, total } : null;
  }

  const measures = [
    {
      label: "Reviews give you alternatives to try",
      rate: kindRate("review", "alternatives"),
      gloss: `In a review of the whole chart (one for each of ${reviews} tunes), how often the tutor offered two or more different chords you can audition that are playable where it put them: each fits the melody, doesn't clash with it, and is a chord a musician would recognize in the key. There's rarely one right chord; the point is options your ear can compare.`,
    },
    {
      label: "“Does this work?” questions give alternatives",
      rate: kindRate("check", "alternatives"),
      gloss:
        "When you place a reasonable chord and ask about it, how often the tutor also offered two or more other playable chords to compare it with. Usually it explains your chord instead; that's the gap this line shows.",
    },
    {
      label: "Points out where the tune repeats",
      rate: headline.repeatCited,
      gloss:
        "When the melody repeats a phrase (found by code: two runs of bars with the same scale degrees), how often a review named both places, so you can reuse what you learned.",
    },
    {
      label: "Keeps it to three things to try",
      rate: headline.testsWithinThree,
      gloss: "Replies that list at most three numbered tests, so a lesson stays playable.",
    },
    {
      label: "Only cites bars the song has",
      rate: headline.barsExist,
      gloss: "Replies where every bar the tutor mentions is a bar in the song.",
    },
    {
      label: "Options, not verdicts",
      rate: headline.verdictFree,
      gloss:
        "Replies that never call a chord wrong, incorrect, or a mistake. “Nothing wrong with it” is fine.",
    },
    {
      label: "Answers “does this work?” with options, not a verdict",
      rate: headline.checkAlternatives,
      gloss:
        "When you place a reasonable chord and ask about it, how often the tutor offered two or more other playable chords to compare it with, without calling your chord wrong.",
    },
    {
      label: "The app's own top three, for comparison",
      rate: headline.baseline.alternatives,
      gloss:
        "The same alternatives test for the dropdown's three best-fitting chords at the notes you asked about, which use rules, not Claude.",
    },
    {
      label: "Ideas that miss",
      rate: headline.offTarget,
      gloss:
        "Of all the tutor's cards, how many weren't playable where it put them by the same test. Lower is better, but it's counted on its own line, so a deliberate contrast beside good options doesn't cancel them.",
    },
    {
      label: "Ideas beyond the obvious",
      rate: headline.beyond,
      gloss:
        "Of the tutor's playable ideas, how many the dropdown's top three wouldn't have shown you. This is where the tutor earns its keep.",
    },
    {
      label: "Includes the conventional choice",
      rate: headline.conventional,
      gloss:
        "When you ask about a less obvious chord, how often the tutor's ideas also included the most conventional one there (the dropdown's best fit). A miss isn't wrong: there are several good chords.",
    },
    {
      label: "Clashes with the melody",
      rate: headline.clashRate,
      gloss:
        "How often a suggested chord rubs against the melody note it sits under. Lower is better, and your ear will catch the ones that slip through.",
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
          {headline.replies} requests about {byTune.length} tunes.
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
