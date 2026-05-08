---
name: autonomous-approve
description: DEPRECATED — self-improvement approval is no longer gated. This skill now functions as a revert helper for rolling back a bad self-improvement refinement. Lists recent review PRs and walks you through `gh pr close` (pre-merge) or `gh pr revert` (post-merge) for the refinement you want out.
user-invocable: true
---

# /autonomous-approve (DEPRECATED — revert helper only)

## What changed

Previously this skill was the human approval gate for self-improvement
proposals. It read `.claude/approvals/PENDING.md`, prompted you per-proposal,
applied accepted ones to CLAUDE.md, and re-enabled the paused cron.

**That flow is retired.** `/autonomous-review` now writes refinements
directly to a branch + PR and enables auto-merge. The PR itself is the
audit trail. The cron keeps firing. No filesystem gate.

This skill remains only as a convenience for reverting a bad refinement.

## When to use

- You saw a `🔄 review PR #N opened` push notification
- You inspected PR #N and don't want some (or all) of its refinements
- You want a guided revert instead of raw git / gh commands

## Steps

### 1. Find the target refinement

```bash
# Recent review PRs (open + merged)
gh pr list --search "review: self-improvement" --state all --limit 10 \
    --json number,state,mergedAt,title
```

### 2. Decide the scope

| Goal | Command |
|---|---|
| Block an entire review PR before merge | `gh pr close <num> --comment "<reason>"` |
| Revert an entire merged review PR | `gh pr revert <num>` — opens a revert PR |
| Keep most of a review PR but drop one refinement | see below |

Because this repo uses squash-merges, a merged review PR collapses to one
commit on main. `gh pr revert` is the right tool — it opens a clean
revert PR you can merge like any other PR.

### 3. Walk-through: revert a merged review

```bash
# 1. Confirm the PR number
gh pr list --search "review:" --state merged --limit 5 \
    --json number,title,mergedAt

# 2. Open a revert PR
gh pr revert <num>

# 3. Check the revert PR, then:
gh pr merge <revert-pr-num> --auto --squash --delete-branch
```

Next autonomous-run cycle proceeds on top of the reverted state.

### 4. Walk-through: close an open review before it auto-merges

If the review PR is still open (CI running or waiting on something):

```bash
gh pr close <num> --comment "Closing — refinement X is incorrect because Y."
```

Optionally record the rejection so `/autonomous-review` doesn't re-propose:

```bash
cat >> .claude/approvals/history.md <<EOF
---
rejected_at: $(date -Iseconds)
pr: <num>
reason: Y
content: |
  <one-line summary of the bad refinement>
EOF
git add .claude/approvals/history.md
git commit -m "approvals: record rejection of PR #<num> (<one-line reason>)"
git push origin main
```

### 5. Keep-most, drop-one refinement from a review PR

If an open PR has N refinements but only 1 is bad:

```bash
# Check out the branch
gh pr checkout <pr-num>

# Identify the specific commit for the bad refinement
git log --oneline main..HEAD

# Revert just that commit on the branch
git revert <bad-sha>
git push
```

The PR updates automatically. Good refinements stay; the bad one is
reverted before merge.

## What this skill does NOT do

- Touch `.claude/approvals/PENDING.md` — that file is retired; delete if
  it exists from an old install
- Pause or re-enable the cron — that's `systemctl {start,stop} claude-pirate-battle.timer`
- Talk to the Claude.ai scheduled-tasks MCP — retired

## Related

- `/autonomous-review` — drafts + ships self-improvement PRs
- `/autonomous-run` — the hourly cycle; invokes `/autonomous-review` on the 5th success
- Stop the agent entirely: `systemctl stop claude-pirate-battle.timer`
