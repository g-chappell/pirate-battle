---
name: autonomous-review
description: Draft and auto-merge repo-wide refinements after N consecutive successful runs. Reads AGENT-LOG, produces CLAUDE.md / script / skill / workflow / roadmap edits on a dedicated PR branch, enables auto-merge. No PENDING.md, no human approval gate — the PR itself is the audit trail. Do NOT invoke directly — called by /autonomous-run Step 10.
user-invocable: false
---

# /autonomous-review

Self-improvement pass. Runs after the success streak hits
`project.json.successThreshold`. Drafts and **directly commits** refinements
anywhere in the repo (except CLAUDE.md Tier 1) on a branch, opens a PR,
enables auto-merge. The PR history IS the approval record — no filesystem
gates, no paused cron, no waiting for a human.

## When called

- Success streak ≥ `project.json.successThreshold` (default 5)
- No REVIEW-LOG entry exists within the last `successThreshold` AGENT-LOG entries (prevents loops)
- No open PR on `auto/review-*` (one review in flight at a time)

## Scope of refinements

**Fair game** — any file in the repo the agent judges worth changing to
codify a lesson learned:

- CLAUDE.md (Tier 2 project conventions; Tier 3 tech-coupled rules)
- `.claude/skills/*.md` — refine skill prose/steps
- `scripts/*` — fix or improve deploy, healthcheck, run-workspaces, etc.
- `.github/workflows/*.yml` — tune CI
- `roadmap/roadmap.yml` — add follow-up tasks, adjust priorities, split tasks (validator must still pass)
- `docker/*` — tune Dockerfile, compose, nginx config copy
- Tooling configs — eslint, prettier, tsconfig.base, etc.

**Forbidden** (validator enforces):

1. Any line between the `<!-- Tier 1 — UNIVERSAL RULES -->` and the next `<!-- ===... Tier 2 -->` markers in `CLAUDE.md`. Read both markers, diff must not touch any line in that range.
2. `.claude/.setup-progress` (it's runtime state, not source).
3. `.env*` (secrets).
4. `.claude/approvals/history.md` — only written via the normal merge flow, never as part of a self-improvement diff.

## Steps

### 1. Gather input

- Last N AGENT-LOG entries (N = `successThreshold`)
- Full current `CLAUDE.md`
- `.claude/approvals/history.md` (prior proposal record)
- Last 5 review PRs via `gh pr list --search "in:title review: self-improvement" --state all --limit 5 --json title,body,mergedAt`
- Relevant skill / script / workflow files for any candidate edits

### 2. Identify patterns

Look across the N AGENT-LOG entries for:
- Lessons mentioned in ≥ 2 entries
- Gotchas that cost time to diagnose ("trace before patch" style)
- Brittleness of existing scripts / skills exposed by recent runs
- Repeated CI-fix patterns
- Roadmap assumptions invalidated by implementation reality (e.g. "task description X was impossible because Y; split into X' + Y'")

Avoid:
- Task-specific implementation details
- One-off fixes already captured in the PR that fixed them
- Anything about currently in-flight work

### 3. Draft edits

For each pattern, produce a concrete edit to a specific file. Keep edits
atomic — one lesson per commit on the branch, so if one edit is bad you
can revert just that commit via `git revert`.

### 4. De-duplicate

Load `.claude/skills/autonomous-review/lib/similarity.mjs`:

```javascript
import { alreadyCovered } from './lib/similarity.mjs';
```

For each candidate edit, build reference pool = {current file content} ∪
{last 5 merged review PRs' diffs} ∪ {`approvals/history.md`}.

```javascript
if (alreadyCovered(proposalText, references, 0.85)) {
  // skip — this lesson is already codified somewhere
}
```

No rate limit: if N non-duplicate patterns exist, make N commits.

### 5. Tier-1 validator

Before staging each edit to `CLAUDE.md`:

```bash
# Find Tier-1 block line range
start=$(grep -n '<!-- Tier 1' CLAUDE.md | head -1 | cut -d: -f1)
end=$(grep -n '<!-- Tier 2' CLAUDE.md | head -1 | cut -d: -f1)
```

If the diff touches any line in `[start, end)`, abort the entire review
cycle. Write a `REVIEW-LOG.md` entry with `outcome: aborted, reason:
tier_1_violation` and stop. Do not fall back to "edit Tier 2 instead".

### 6. Fetch latest main + branch

`/autonomous-run` moves quickly between steps and may push further commits
to main (AGENT-LOG entries, deploy-outcome log) *after* this skill starts
and *before* the PR lands. Always sync before branching:

```bash
git fetch origin main --prune
git checkout main
git merge --ff-only origin/main   # pick up any commits /autonomous-run pushed
date_slug=$(date -u +%Y-%m-%d)
branch="auto/review-${date_slug}"
git checkout -b "$branch" main
```

### 7. Commit each refinement

Apply each edit as a separate commit with a message like:

```
review: <one-line summary of the lesson>

Why: <the AGENT-LOG pattern that motivated this>
Evidence: AGENT-LOG run [TASK-XXX], run [TASK-YYY]
Scope: <file path>
```

### 8. Open the PR

```bash
gh pr create \
  --title "review: self-improvement refinements (${N_REFINEMENTS})" \
  --body "$(cat <<EOF
## Summary
Self-improvement cycle after ${successThreshold} successful runs.

## Refinements
<bulleted list, one bullet per commit on this branch>

## Evidence
<list the AGENT-LOG run dates + task IDs that motivated each refinement>

## Review notes
Review PR auto-generated. CI must pass before auto-merge. To block a
specific refinement: \`gh pr close <this-pr>\` (all refinements revert),
or to keep the good ones and drop bad ones, cherry-pick from the branch.
Post-merge, a bad refinement can be reverted individually with
\`git revert <sha-of-that-commit>\`.

Generated by /autonomous-review.
EOF
)"
```

Capture `<pr_num>` from the command's output.

### 9. Enable auto-merge — mandatory, separate step

**This step is non-negotiable.** Without it review PRs stall open forever.

```bash
gh pr merge "$pr_num" --auto --squash --delete-branch
```

### 10. Handle BEHIND main (strict protection requires up-to-date branch)

Branch protection has `strict: true`. If `/autonomous-run` pushes another
commit to main in the race window between Step 6 and Step 9, the PR ends
up `mergeStateStatus: BEHIND` and auto-merge waits indefinitely.

Check once and update if needed:

```bash
state=$(gh pr view "$pr_num" --json mergeStateStatus -q .mergeStateStatus)
if [ "$state" = "BEHIND" ]; then
  gh api --method PUT "repos/${REPO}/pulls/${pr_num}/update-branch"
  # CI will re-run on the updated branch; auto-merge will trigger on pass
fi
```

Do NOT block this skill waiting for the merge — auto-merge will fire
when CI goes green. The `/autonomous-run` cycle returns immediately after
Step 10 completes.

### 11. Log to REVIEW-LOG

Append to `REVIEW-LOG.md`:

```markdown
---

## Review [ISO timestamp] — after TASK-XXX through TASK-YYY
- Success streak: N
- Patterns identified: K
- Proposals drafted: J
- Proposals de-duplicated: J - M (M survived)
- Refinements committed: M
- PR: https://github.com/.../pull/N
- Outcome: opened | aborted-tier1-violation | skipped-no-patterns
- Files touched: file1, file2, ...
```

### 12. Flag the AGENT-LOG entry

AGENT-LOG entry for the triggering run sets `review_proposed: true` —
that happens in `/autonomous-run` Step 10 after this skill returns.

### 13. Notify

Call `PushNotification` once from the calling `/autonomous-run` context
(this skill doesn't call it directly; it returns a structured result
that Step 10's notification formatter includes).

Return value shape:
```
{
  outcome: "opened" | "aborted" | "skipped-no-patterns",
  pr_number: <number or null>,
  refinement_count: <number>,
  files_touched: [...]
}
```

## What this skill does NOT do

- Write `.claude/approvals/PENDING.md` (retired)
- Pause the scheduled task (the timer keeps firing; if the PR doesn't land cleanly, CI rejects it or the user reverts)
- Touch files listed under "Forbidden" (section above)
- Make multiple PRs in one cycle (one PR per review; if more refinements emerge next cycle, a new PR opens)

## Recovery from a bad refinement

If a refinement lands and turns out wrong:

```bash
# option A — revert just the bad commit (the squash-merge preserves history)
git log --oneline --all | grep review:
git revert <sha>
git push

# option B — revert the whole review PR
gh pr list --state merged --search "review:" --limit 1  # find PR number
gh pr revert <number>                                    # opens a revert PR
```

No human gate; no special tooling; standard git.
