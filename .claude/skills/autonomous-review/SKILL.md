---
name: autonomous-review
description: Propose CLAUDE.md refinements after N consecutive successful runs. Reads recent AGENT-LOG entries, identifies recurring patterns, de-duplicates against current CLAUDE.md and approval history, writes a PENDING.md for human review, pauses the scheduled task. Do NOT invoke directly — called by /autonomous-run Step 10.
user-invocable: false
---

# /autonomous-review

Self-improvement pass. Called by `/autonomous-run` Step 10 when the success
streak hits `project.json.successThreshold`. Drafts CLAUDE.md additions,
runs de-dup, writes a `PENDING.md` that a human approves via
`/autonomous-approve`.

## When called

- Success streak ≥ `project.json.successThreshold` (default 5)
- No REVIEW-LOG entry exists for the last N entries (prevents loops)
- No existing `.claude/approvals/PENDING.md` (one review pending at a time)

## Steps

### 1. Gather input

- Read the last N entries from `AGENT-LOG.md` (where N = successThreshold)
- Read current `CLAUDE.md` (full text)
- Read `.claude/approvals/history.md` (append-only log of prior proposals,
  approved + rejected)

### 2. Identify patterns

Look for:
- Lessons that appear in ≥ 2 AGENT-LOG entries ("learned that X")
- Gotchas mentioned in "Files changed" descriptions
- Debugging paths that cost time ("trace before patch" style)
- Framework/library idioms that were non-obvious
- Testing patterns that worked

Avoid:
- Task-specific details (what the task was about)
- One-off fixes with no general pattern
- Anything about current work-in-progress tasks

### 3. Draft proposals

For each pattern, draft a short CLAUDE.md addition (1–3 sentences).
Target the right tier:
- Universal (Tier 1): NEVER. Frozen.
- Project conventions (Tier 2): if it's about this project's structure/decisions
- Tech-coupled (Tier 3): if it's about the framework/library/runtime

Keep each proposal atomic — one idea per proposal so the human can
accept/reject individually.

### 4. De-duplicate

Load `lib/similarity.mjs`:

```javascript
import { alreadyCovered } from './lib/similarity.mjs';
```

For each proposed addition, run:

```javascript
const references = [
  currentClaudeMdText,
  approvalsHistoryText
];
if (alreadyCovered(proposalText, references, 0.85)) {
  // skip — already in CLAUDE.md or previously proposed
}
```

Threshold 0.85 is conservative. If false negatives are a recurring problem,
adjust in `lib/similarity.mjs` (one place).

### 5. Write PENDING.md

File: `.claude/approvals/PENDING.md`

```markdown
---
reviewed_at: 2026-04-20T14:00:00Z
streak: 5
basis_runs:
  - TASK-081
  - TASK-082
  - TASK-083
  - TASK-084
  - TASK-085
approved: false     # HUMAN flips to true per proposal (see below)
---

# Pending CLAUDE.md review

After the last 5 successful tasks, these patterns appeared worth codifying.
Each proposal has an `approved` field — flip to `true` to accept, leave
`false` to reject. Save and run `/autonomous-approve` when done.

## Proposals

### PROP-2026-04-20-01
- section: Testing patterns
- approved: false
- content: |
    When mocking Prisma `$transaction` in tests, declare the tx-context
    mock object separately from the outer Prisma mock. Throwing inside
    the callback propagates as a rejected promise for the route's outer
    catch.

### PROP-2026-04-20-02
- section: Architecture notes
- approved: false
- content: |
    React 19 function components accept `ref` as a regular prop — no
    `forwardRef` wrapper needed. Type as
    `{ ref: React.RefObject<HTMLDivElement | null> }`.

### (up to 5 proposals; if no non-duplicate patterns found, write
###  `## Proposals\n\n_No new proposals this cycle._`)
```

### 6. Write REVIEW-LOG.md entry

Append to `REVIEW-LOG.md`:

```markdown
---

## Review [2026-04-20 14:00] — after TASK-081 through TASK-085
- Success streak: 5
- Patterns identified: 3
- Proposals drafted: 3
- Proposals de-duplicated: 1 (matched existing CLAUDE.md content)
- Proposals written to PENDING.md: 2
- Status: pending-approval
```

### 7. Pause the scheduled task

```
mcp__scheduled-tasks__update_scheduled_task({
  taskId: "autonomous-run-<slug>",
  enabled: false
})
```

### 8. Flag in AGENT-LOG

The AGENT-LOG entry for the *current* run (the one that triggered this
review) should set `review_proposed: true`. That entry is written by
`/autonomous-run` Step 10 AFTER this skill returns.

### 9. Notify user

```
Self-improvement review pending: 2 proposals drafted. Run /autonomous-approve
when you're ready to accept/reject them. Scheduled task is paused until
approval completes.
```

## Not this skill's job

- Writing to CLAUDE.md directly → `/autonomous-approve` does that after human ok
- Re-enabling the cron → `/autonomous-approve` does that
- Fixing past incorrect proposals → they're already in `history.md`; won't reappear
