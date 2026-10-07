export const meta = {
  name: 'fix-round',
  description: 'Apply Matthew-accepted review calls to stream branches in worktrees, each followed by an independent Fable re-review of the fix diff',
  whenToUse: 'After triage of a build round. args: { rebase: boolean, streams: [{ letter, id, name, owns, tip, decisions[], findings[] }] }, generated from the triage data. Each stream/<id> branch must not be checked out in any other worktree when the run starts (git refuses to check out a branch twice).',
  phases: [
    { title: 'Fix', detail: 'one fixer per stream, on its existing branch, in its own worktree' },
    { title: 'Re-review', detail: 'one Fable reviewer per stream: accepted calls, the fix diff, and regressions', model: 'fable' },
  ],
}

const fixPrompt = (s) => `You are fixing stream ${s.name} of Hear Hear, an ear-training tool, in a git worktree of the hearhear repo. A Fable reviewer reviewed this stream; Matthew triaged every finding and decided the calls below. Apply them carefully. The bar is enterprise-grade code and a tool that works and delights. Speed never justifies a shortcut.

Setup:
1. \`git checkout stream/${s.id}\`${args.rebase ? `, then \`git rebase main\`. main has new shared contracts; resolve conflicts in favor of your stream's implementation while adopting every new contract signature and shared piece from main.` : '.'}
2. \`npm ci\` and \`uv sync\`.

Read: docs/PRD.md, DECISIONS.md (the "Wave 1 triage" section holds Matthew's decisions D1-D19), contracts/README.md, and docs/decisions/${s.id}.md.

You own ${s.owns}. Edit nothing else unless a decision below explicitly authorizes that exact file.

Matthew's decisions for this stream:
${s.decisions.map((d) => `- ${d}`).join('\n')}

The reviewer's findings, each with Matthew's call (the reviewer's text, verbatim):
${s.findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.file}${f.line ? ':' + f.line : ''}
   Problem: ${f.problem}
   Reviewer's fix: ${f.fix}
   CALL: ${f.call}`).join('\n')}

Rules:
- Apply every decision and every call. "Fix as proposed" means the reviewer's fix, unless you find a better fix for the same problem; if so, say why in the decision log. "Covered by decision Dx" is handled by that decision. "Wave 2" means don't build it now; only correct any doc or comment the finding says is wrong.
- If you can't apply a call well (it conflicts with another decision, needs another stream's code, or is wrong on inspection), don't force it. Record it in deferred with the reason. It goes to a tracked list for Matthew, and it is never silently skipped.
- Add tests where a fix changes behavior that the repo's test rules cover: theory, the store, backend, and, per decision D6, pure non-UI modules. No UI tests. Don't run Playwright on port 8000.
- Append a "Wave-1 fixes" section to docs/decisions/${s.id}.md listing what changed and why, including anything you did differently from the reviewer's proposal.
- \`make check\` must pass. Make small Conventional Commits on stream/${s.id}, each ending with a blank line and "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". Stage by name. Do not push or open a PR.
- Leave the worktree clean.`

const reviewPrompt = (s, fixed) => `You are an independent, adversarial re-reviewer for stream ${s.name} of Hear Hear. A fixer has just applied Matthew's accepted calls from an earlier review. You have not seen the fixer's work or reasoning; judge only the code.

Read docs/PRD.md, DECISIONS.md (especially the "Wave 1 triage" section), and contracts/README.md. Then check out the branch detached in your own worktree: \`git checkout --detach stream/${s.id}\`, then \`npm ci\` and \`uv sync\`. Read the fix diff with \`git diff ${s.tip}..stream/${s.id}\`${args.rebase ? ' (the branch was rebased onto main, so also compare against main where that is clearer)' : ''}, and read the changed files in full. Run \`make check\`. Don't run Playwright on port 8000. Don't edit, commit, or push anything.

The accepted calls the fixer was asked to apply:
Decisions:
${s.decisions.map((d) => `- ${d}`).join('\n')}
Findings and calls:
${s.findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.file}${f.line ? ':' + f.line : ''}: ${f.problem}\n   CALL: ${f.call}`).join('\n')}

Items the fixer reports deferring, with reasons (judge whether each deferral is justified):
${(fixed?.deferred || []).map((d) => `- ${d.item}: ${d.reason}`).join('\n') || '- none'}

Report:
- For each decision and call, whether it was applied correctly. List any not applied, or applied wrongly, in unaddressed.
- Every new problem the fix diff introduces, at any severity: correctness, security, readability, contract fit, edits outside the stream's owned or authorized paths, both themes, keyLabelMode, accessibility, and reduced motion where the stream has UI.
Verify each finding by reading code or running a command, and give a concrete failure scenario and a fix for each.`

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    makeCheckPassed: { type: 'boolean' },
    applied: { type: 'array', items: { type: 'string' } },
    deferred: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, reason: { type: 'string' } }, required: ['item', 'reason'] } },
    commits: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['branch', 'makeCheckPassed', 'applied', 'deferred', 'commits', 'notes'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    stream: { type: 'string' },
    recommendation: { enum: ['merge', 'merge-after-fixes', 'do-not-merge'] },
    unaddressed: { type: 'array', items: { type: 'string' } },
    deferralsJustified: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, justified: { type: 'boolean' }, why: { type: 'string' } }, required: ['item', 'justified', 'why'] } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { enum: ['high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          problem: { type: 'string' },
          scenario: { type: 'string' },
          fix: { type: 'string' },
          verified: { type: 'boolean' },
        },
        required: ['severity', 'file', 'problem', 'scenario', 'fix', 'verified'],
      },
    },
  },
  required: ['stream', 'recommendation', 'unaddressed', 'deferralsJustified', 'findings'],
}

const results = await pipeline(
  args.streams,
  (s) => agent(fixPrompt(s), { label: `fix ${s.id}`, phase: 'Fix', isolation: 'worktree', schema: FIX_SCHEMA }),
  (fixed, s) =>
    fixed === null
      ? null
      : agent(reviewPrompt(s, fixed), {
          label: `re-review ${s.id}`,
          phase: 'Re-review',
          model: 'fable',
          isolation: 'worktree',
          schema: REVIEW_SCHEMA,
        }).then((review) => ({ stream: s.id, fixed, review })),
)

const missing = args.streams.filter((s, i) => !results[i]).map((s) => s.id)
if (missing.length) log(`No result for: ${missing.join(', ')}`)
return { results: results.filter(Boolean), missing }
