# Eval results

Written by `node evals/run.js`; don't edit by hand. Metric definitions are in [../README.md](../README.md).

**Run:** 2026-10-07T06:23:45.889Z, fixture mode, model `fixture`.

Fixture run: the server replayed canned replies about a different song, so these numbers measure the plumbing (requests, streaming, parsing, scoring), not the model.

| Tune          | Level      | Replies | Excluded | Failed | Schema valid   | Numeral = letter | Hit rate    | Clash rate | Nudge withholds | Nudges clamped | Latency p50 | Latency p95 |
| ------------- | ---------- | ------- | -------- | ------ | -------------- | ---------------- | ----------- | ---------- | --------------- | -------------- | ----------- | ----------- |
| amazing-grace | nudge      | 7       | 0        | 0      | 7/7 (100%)     | —                | —           | —          | 7/7 (100%)      | 0/7 (0%)       | 968 ms      | 974 ms      |
| amazing-grace | comparison | 7       | 0        | 0      | 7/7 (100%)     | 0/14 (0%)        | 0/7 (0%)    | —          | —               | —              | 1110 ms     | 1113 ms     |
| amazing-grace | answer     | 7       | 0        | 0      | 7/7 (100%)     | 0/21 (0%)        | 0/7 (0%)    | —          | —               | —              | 1059 ms     | 1066 ms     |
| joyful-joyful | nudge      | 6       | 0        | 0      | 6/6 (100%)     | —                | —           | —          | 6/6 (100%)      | 0/6 (0%)       | 967 ms      | 973 ms      |
| joyful-joyful | comparison | 6       | 0        | 0      | 6/6 (100%)     | 0/12 (0%)        | 0/6 (0%)    | —          | —               | —              | 1108 ms     | 1114 ms     |
| joyful-joyful | answer     | 6       | 0        | 0      | 6/6 (100%)     | 0/18 (0%)        | 0/6 (0%)    | —          | —               | —              | 1061 ms     | 1065 ms     |
| veni-emmanuel | nudge      | 16      | 0        | 0      | 16/16 (100%)   | —                | —           | —          | 16/16 (100%)    | 0/16 (0%)      | 968 ms      | 974 ms      |
| veni-emmanuel | comparison | 16      | 0        | 0      | 16/16 (100%)   | 0/32 (0%)        | 0/16 (0%)   | —          | —               | —              | 1108 ms     | 1113 ms     |
| veni-emmanuel | answer     | 16      | 0        | 0      | 16/16 (100%)   | 0/48 (0%)        | 0/16 (0%)   | —          | —               | —              | 1062 ms     | 1067 ms     |
| god-rest-ye   | nudge      | 12      | 0        | 0      | 12/12 (100%)   | —                | —           | —          | 12/12 (100%)    | 0/12 (0%)      | 968 ms      | 973 ms      |
| god-rest-ye   | comparison | 12      | 0        | 0      | 12/12 (100%)   | 0/24 (0%)        | 0/12 (0%)   | —          | —               | —              | 1108 ms     | 1114 ms     |
| god-rest-ye   | answer     | 12      | 0        | 0      | 12/12 (100%)   | 0/36 (0%)        | 0/12 (0%)   | —          | —               | —              | 1060 ms     | 1063 ms     |
| **all**       | all        | 123     | 0        | 0      | 123/123 (100%) | 0/205 (0%)       | 0/41 (0%)   | —          | 41/41 (100%)    | 0/41 (0%)      | 1061 ms     | 1113 ms     |
| amazing-grace | baseline   | —       | —        | —      | —              | —                | 6/7 (86%)   | 0/7 (0%)   | —               | —              | —           | —           |
| joyful-joyful | baseline   | —       | —        | —      | —              | —                | 5/6 (83%)   | 0/6 (0%)   | —               | —              | —           | —           |
| veni-emmanuel | baseline   | —       | —        | —      | —              | —                | 4/16 (25%)  | 0/16 (0%)  | —               | —              | —           | —           |
| god-rest-ye   | baseline   | —       | —        | —      | —              | —                | 5/12 (42%)  | 0/12 (0%)  | —               | —              | —           | —           |
| **all**       | baseline   | —       | —        | —      | —              | —                | 20/41 (49%) | 0/41 (0%)  | —               | —              | —           | —           |

The **all** row's hit rate counts comparison replies only, as the hit-rate metric is defined at the comparison level.
