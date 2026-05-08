---
name: Enable auto-merge after creating a PR
description: Chain `gh pr merge --auto --squash` after `gh pr create` so the PR lands itself when CI goes green.
type: feedback
---

After `gh pr create`, always enable auto-merge with squash + delete branch:

```bash
gh pr merge <pr-number> --auto --squash --delete-branch
```

**Why:** Manual merge after CI passes is a coordination cost. PRs that sit
open waiting for someone to click "merge" create stale branches, divergence
with main, and forgotten work.

**How to apply:**

- Chain it immediately after `gh pr create`. If the PR is already green by
  that point, GitHub merges right away.
- If CI is slow and not yet green, auto-merge fires when checks pass — no
  babysitting needed.
- The `--delete-branch` flag cleans up the feature branch on GitHub so
  `git remote prune origin` on next sync removes it locally.

**Caveats:**

- If the repo has **required checks** that are SLOW (e.g. e2e job takes
  2 min), auto-merge will fire as soon as the FAST required check passes
  but BEFORE the slow one completes. Confirm required checks list covers
  all jobs that must be green.
- If you are making a change that needs human review (destructive,
  security-sensitive), explicitly skip auto-merge and use `gh pr merge`
  interactively.
- Auto-merge with squash loses individual commits from the feature branch
  — that's fine for feature PRs, but don't squash-merge a branch you
  need to preserve history for.

**Verify branch protection:** auto-merge only works if the repo has
"allow auto-merge" enabled. The starter's `.github/branch-protection.sh`
script does this via `gh repo edit --enable-auto-merge`.
