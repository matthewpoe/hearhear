# Eval results

Written by `node evals/run.js`; don't edit by hand. Metric definitions are in [../README.md](../README.md).

**Run:** 2026-10-07T05:16:45.273Z, fixture mode, model `fixture`.

Fixture run: the server replayed canned replies about a different song, so these numbers measure the plumbing (requests, streaming, parsing, scoring), not the model.

| Tune          | Level      | Replies | Excluded | Failed | Schema valid   | Numeral = letter | Hit rate    | Clash rate | Nudge withholds | Latency p50 | Latency p95 |
| ------------- | ---------- | ------- | -------- | ------ | -------------- | ---------------- | ----------- | ---------- | --------------- | ----------- | ----------- |
| amazing-grace | nudge      | 7       | 0        | 0      | 7/7 (100%)     | —                | —           | —          | 7/7 (100%)      | 619 ms      | 1219 ms     |
| amazing-grace | comparison | 7       | 0        | 0      | 7/7 (100%)     | 0/14 (0%)        | 0/7 (0%)    | —          | —               | 450 ms      | 612 ms      |
| amazing-grace | answer     | 7       | 0        | 0      | 7/7 (100%)     | 0/21 (0%)        | 0/7 (0%)    | —          | —               | 683 ms      | 805 ms      |
| joyful-joyful | nudge      | 6       | 0        | 0      | 6/6 (100%)     | —                | —           | —          | 6/6 (100%)      | 552 ms      | 899 ms      |
| joyful-joyful | comparison | 6       | 0        | 0      | 6/6 (100%)     | 0/12 (0%)        | 0/6 (0%)    | —          | —               | 608 ms      | 773 ms      |
| joyful-joyful | answer     | 6       | 0        | 0      | 6/6 (100%)     | 0/18 (0%)        | 0/6 (0%)    | —          | —               | 471 ms      | 654 ms      |
| veni-emmanuel | nudge      | 16      | 0        | 0      | 16/16 (100%)   | —                | —           | —          | 16/16 (100%)    | 478 ms      | 653 ms      |
| veni-emmanuel | comparison | 16      | 0        | 0      | 16/16 (100%)   | 0/32 (0%)        | 0/16 (0%)   | —          | —               | 465 ms      | 624 ms      |
| veni-emmanuel | answer     | 16      | 0        | 0      | 16/16 (100%)   | 0/48 (0%)        | 0/16 (0%)   | —          | —               | 533 ms      | 736 ms      |
| god-rest-ye   | nudge      | 12      | 0        | 0      | 12/12 (100%)   | —                | —           | —          | 12/12 (100%)    | 437 ms      | 678 ms      |
| god-rest-ye   | comparison | 12      | 0        | 0      | 12/12 (100%)   | 0/24 (0%)        | 0/12 (0%)   | —          | —               | 381 ms      | 510 ms      |
| god-rest-ye   | answer     | 12      | 0        | 0      | 12/12 (100%)   | 0/36 (0%)        | 0/12 (0%)   | —          | —               | 538 ms      | 711 ms      |
| **all**       | all        | 123     | 0        | 0      | 123/123 (100%) | 0/205 (0%)       | 0/41 (0%)   | —          | 41/41 (100%)    | 508 ms      | 769 ms      |
| amazing-grace | baseline   | —       | —        | —      | —              | —                | 6/7 (86%)   | 0/7 (0%)   | —               | —           | —           |
| joyful-joyful | baseline   | —       | —        | —      | —              | —                | 5/6 (83%)   | 0/6 (0%)   | —               | —           | —           |
| veni-emmanuel | baseline   | —       | —        | —      | —              | —                | 4/16 (25%)  | 0/16 (0%)  | —               | —           | —           |
| god-rest-ye   | baseline   | —       | —        | —      | —              | —                | 6/12 (50%)  | 0/12 (0%)  | —               | —           | —           |
| **all**       | baseline   | —       | —        | —      | —              | —                | 21/41 (51%) | 0/41 (0%)  | —               | —           | —           |

The **all** row's hit rate counts comparison replies only, as the hit-rate metric is defined at the comparison level.
