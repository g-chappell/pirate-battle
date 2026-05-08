---
name: Proactively check and fix CI after opening a PR
description: After `gh pr create`, poll CI status and fix failures immediately without waiting for the user to report them.
type: feedback
---

After opening a PR, don't assume CI will pass. Poll it; fix failures on the spot.

**Why:** CI feedback loops work best when the agent treats "PR opened" as
"implementation ongoing," not "handoff done." Auto-merge PRs that silently
sit with failing CI cost hours of context-switch later.

**How to apply:**

1. Immediately after `gh pr create`, run:
   ```bash
   gh pr checks <pr-number> --watch   # or poll manually
   ```
2. If a required check fails:
   - Fetch the failing run ID and log tail:
     ```bash
     run_id=$(gh run list --branch <branch> --json databaseId,conclusion \
       --jq '[.[] | select(.conclusion=="failure")][0].databaseId')
     gh run view $run_id --log-failed | tail -150
     ```
   - Read the exact error; edit only files named in the error
   - Run local validation to confirm the fix
   - `git commit -m "fix: <brief description>"` and push
3. Max 3 fix attempts per PR. If all 3 fail or the failure is infra/flake,
   stop and report — do NOT let the agent flail.
4. Do NOT wait for CI to re-run before picking the next task — local
   validation passing is sufficient signal.

**Counter-pattern to avoid:** "opened PR, it'll merge when it merges" —
this is how broken main happens.
