---
name: autonomous-approve
description: Human approval gate for self-improvement proposals. Reads PENDING.md, opens it for editing, then applies accepted proposals to CLAUDE.md, archives PENDING.md to a dated file under approvals/, appends everything (approved + rejected) to approvals/history.md, and re-enables the scheduled task. Run after /autonomous-review drafts a PENDING.md.
user-invocable: true
---

# /autonomous-approve

Close the loop on a pending self-improvement review. The human reads each
proposal, flips `approved: true/false`, saves, and runs this skill to apply.

## Preconditions

- `.claude/approvals/PENDING.md` exists
- The scheduled task is paused (`enabled: false`)

If PENDING.md doesn't exist: "No pending review — nothing to approve."
If the task isn't paused: warn, but proceed (the human may have unpaused).

## Steps

### 1. Open PENDING.md

Show the user the current state of PENDING.md and ask:

```
Open PENDING.md in your editor and flip `approved: true/false` on each
proposal. Save the file, then say 'ready' here.

(Or: 'auto' to accept all; 'reject-all' to reject all; 'abort' to cancel.)
```

Support three shortcuts beyond manual editing:
- `auto` — treat every proposal as approved (rare — only if user trusts the batch blindly)
- `reject-all` — treat every proposal as rejected
- `abort` — leave PENDING.md in place, don't modify anything else, stop

### 2. Parse the user's edits

Re-read PENDING.md. Parse each `### PROP-*` block. Extract `approved:` per
proposal. Validate that at least the top-level `approved:` or each
proposal's `approved:` is set (we require per-proposal to be explicit).

### 3. Apply approved proposals to CLAUDE.md

For each proposal with `approved: true`:
- Find the right section in CLAUDE.md (the `section:` field names it)
- Append the content (not replace) to that section
- Preserve section order; never touch Tier 1 (Universal rules — frozen)
- Use 2-newline spacing between additions
- Preview the full CLAUDE.md diff back to the user; ask final confirmation

### 4. Append to approvals/history.md

For **every** proposal (approved AND rejected), append to
`.claude/approvals/history.md`:

```markdown
### PROP-2026-04-20-01
- reviewed: 2026-04-20T14:00:00Z
- status: approved
- section: Testing patterns
- content: |
    <the exact proposed text>

### PROP-2026-04-20-02
- reviewed: 2026-04-20T14:15:00Z
- status: rejected
- section: Architecture notes
- content: |
    <the exact proposed text>
```

This is the de-dup source for future reviews. Both approved AND rejected
items must land here so they never get re-proposed.

### 5. Archive PENDING.md

Move `PENDING.md` → `.claude/approvals/<ISO-timestamp>.md` (e.g.
`2026-04-20T14-30.md`). This preserves the full review context (streak, basis
runs, draft text) in git history.

### 6. Re-enable the scheduled task

```
mcp__scheduled-tasks__update_scheduled_task({
  taskId: "autonomous-run-<slug>",
  enabled: true
})
```

### 7. Commit + push

All the changes (CLAUDE.md, history.md, archived PENDING.md) are in-repo
artifacts. Commit on a dedicated branch and open a PR:

```bash
git checkout -b approvals/<date>-review
git add CLAUDE.md .claude/approvals/
git commit -m "review: apply N of M approved proposals ($(date +%Y-%m-%d))"
git push -u origin HEAD
gh pr create --title "Review $(date +%Y-%m-%d): apply approved proposals" \
             --body "..."
gh pr merge --auto --squash
```

### 8. Confirm

```
Review complete.
 - N proposals approved and added to CLAUDE.md
 - M proposals rejected
 - All logged to approvals/history.md
 - PENDING.md archived to approvals/<timestamp>.md
 - Scheduled task re-enabled (next run in ~<time>)
 - PR opened: <url>
```

## Edge cases

- **User sets top-level `approved: false`**: treat all proposals as
  rejected; archive anyway; re-enable cron.
- **User doesn't set any approved field**: ask again; do not guess.
- **User types `abort`**: leave PENDING.md; do NOT archive; do NOT re-enable
  cron. Next `autonomous-run` will still see the pending review and skip.
- **CLAUDE.md section doesn't exist**: create the section; warn the user.
- **PENDING.md malformed YAML**: show the parse error and ask the user to fix.
- **Cron re-enable via MCP fails**: print the error; ask user to run
  `mcp__scheduled-tasks__update_scheduled_task({ enabled: true })` manually.

## Not this skill's job

- Drafting proposals → `/autonomous-review` did that
- Running the next autonomous run → the cron will fire
- Reverting a previously approved proposal → edit CLAUDE.md manually
  (also consider adding a `never_propose` entry to `history.md`)
