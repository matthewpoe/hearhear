export const meta = {
  name: 'build-round',
  description: 'Build a round of new streams in parallel worktrees from a shared base, each followed by a time-boxed Fable merge-gate review',
  whenToUse: 'args: { base: branch name on origin, streams: [{ id, name, owns, brief }] }. Each stream gets stream/<id> from origin/<base>.',
  phases: [
    { title: 'Build', detail: 'one builder per stream, each in its own git worktree' },
    { title: 'Review', detail: 'one Fable merge-gate reviewer per stream', model: 'fable' },
  ],
}

const COMMON = `
You are a builder for one workstream of Hear Hear, an ear-training tool, in a git worktree of the hearhear repo. Other builders are working on other streams in parallel, in their own worktrees.

Setup, in this order:
1. \`git fetch origin && git checkout -b stream/{ID} origin/{BASE}\`. That base is main plus the merged theory core (A) and tutor backend (E).
2. \`npm ci\` and \`uv sync\` (each worktree needs its own node_modules and .venv).

Read before writing any code:
- docs/PRD.md, end to end. This is the spec.
- DECISIONS.md, end to end, and especially the Phase 1 steers at the bottom. These are Matthew's decisions and they override the PRD where they differ.
- contracts/README.md, plus every contract file your stream uses.

Rules:
- **Edit only the paths your stream owns** (listed below). Never edit contracts/, src/App.svelte, src/tokens.css, src/global.css, src/store/, src/types.js, src/lib/, another stream's files, DECISIONS.md, README.md, or TIMELOG.md. If you need a contract change or a new token, don't make it: record it in contractRequests, then work within your own files.
- **No new dependencies.** Everything Phase 0 pinned is installed. If you need another package, record it in contractRequests and don't add it.
- **Hold to the cut lines.** Build only the scope below. If you see something worth adding, put it in proposedAdditions; don't build it.
- **Code standard:** plain JavaScript with JSDoc (no TypeScript), Svelte 5 runes only, no {@html}. Colors come only from tokens.css custom properties. Every view works in both themes, honors keyLabelMode (hidden, tentative, or confirmed) wherever it shows key-relative labels, works by keyboard with visible focus, gives controls accessible names, and respects prefers-reduced-motion. Small files named by concept, no dead code, no speculative abstractions. Clear over clever.
- **Async boundaries** (samples, the API, the stream) all have visible loading, failed, and retry states. No empty catches.
- **Tests:** theory unit tests (node:test, in tests/theory/) and backend tests (pytest) only. No UI tests.
- **Don't run Playwright.** Its server port collides across parallel worktrees; the smoke test runs at integration.
- **Before you finish,** \`make check\` must pass in your worktree (lint, types, tests, contract drift, content validation, build, audits).
- **Commits:** small Conventional Commits on stream/{ID}, each ending with a blank line and "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Stage files by name, never \`git add .\`. Do not push, open a PR, or touch main.
- **Decision log:** write docs/decisions/{ID}.md. For each decision: date (2026-10-07), the decision, why, and the alternatives you rejected. Include every deviation from the PRD or the contracts.
- There is no API key in this phase and you must not ask for one. The tutor runs in fixture mode.
- Time matters: the golden path and Matthew's documentation hour are waiting. Work directly toward the brief; don't explore beyond what it needs. If a part turns out much larger than the brief implies, build the core and list the rest in knownGaps.

When you're done, the worktree must be clean (everything committed). Return the structured result.`

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    summary: { type: 'string', description: 'What was built, in 3-6 sentences' },
    makeCheckPassed: { type: 'boolean' },
    commits: { type: 'array', items: { type: 'string' } },
    contractRequests: { type: 'array', items: { type: 'string' }, description: 'Contract, token, dependency, or CSP changes needed; not made' },
    proposedAdditions: { type: 'array', items: { type: 'string' }, description: 'Ideas beyond scope; not built' },
    knownGaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['branch', 'summary', 'makeCheckPassed', 'commits', 'contractRequests', 'proposedAdditions', 'knownGaps'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    stream: { type: 'string' },
    recommendation: { enum: ['merge', 'merge-after-fixes', 'do-not-merge'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { enum: ['high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          problem: { type: 'string' },
          scenario: { type: 'string', description: 'Concrete failure scenario' },
          fix: { type: 'string' },
          verified: { type: 'boolean', description: 'True if confirmed by reading code or running a command' },
        },
        required: ['severity', 'file', 'problem', 'scenario', 'fix', 'verified'],
      },
    },
    contractConcerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['stream', 'recommendation', 'findings', 'contractConcerns'],
}

const reviewPrompt = (s) => `You are an independent merge-gate reviewer for stream ${s.name} of Hear Hear. You have not seen how this code was produced; judge only the code.

Read docs/PRD.md, DECISIONS.md, and contracts/README.md. The stream's assignment:
${s.brief}

It owns: ${s.owns}

Check out the branch detached in your own worktree (\`git fetch origin && git checkout --detach stream/${s.id}\`), run \`npm ci\`, \`uv sync\` and \`make check\`, and read \`git diff origin/${args.base}...stream/${s.id}\` in full. Don't run Playwright on port 8000. Don't edit, commit, or push anything.

This is a time-boxed merge gate. Report only HIGH or MEDIUM problems: correctness, security, the brief not met, contract fit, edits outside owned paths, accessibility, both themes where there is UI. Skip lows and open-ended exploration. Verify each finding by reading code or running a command, with a concrete failure scenario and a fix.`

const results = await pipeline(
  args.streams,
  (s) =>
    agent(COMMON.replaceAll('{ID}', s.id).replaceAll('{BASE}', args.base) + `\n\nYour stream: ${s.name}\nYou own: ${s.owns}\n\nScope:\n${s.brief}`, {
      label: `build ${s.id}`,
      phase: 'Build',
      isolation: 'worktree',
      schema: RESULT_SCHEMA,
    }),
  (built, s) =>
    built === null
      ? null
      : agent(reviewPrompt(s), {
          label: `review ${s.id}`,
          phase: 'Review',
          model: 'fable',
          isolation: 'worktree',
          schema: REVIEW_SCHEMA,
        }).then((review) => ({ stream: s.id, built, review })),
)

const missing = args.streams.filter((s, i) => !results[i]).map((s) => s.id)
if (missing.length) log(`No result for: ${missing.join(', ')}`)
return { results: results.filter(Boolean), missing }
