---
name: autonomous-run
description: THE scheduled entry point. Runs one autonomous dev cycle: sync main, recover any stuck CI, select next task, branch, implement, validate locally, open PR with auto-merge, log. Every 10th-13th step handles optional VPS auto-deploy. Do NOT invoke when a self-improvement review is pending approval.
user-invocable: true
disable-model-invocation: true
---

# /autonomous-run

One cycle of the autonomous dev loop. Designed to be safe to re-run.

This is a **13-step** procedure. Steps 11–13 only fire when VPS auto-deploy
is configured (`project.json.deploy.autoDeployOnMerge: true`).

## Pre-run: check for pending review

FIRST, before anything else:

```bash
test -f .claude/approvals/PENDING.md && echo "PENDING"
```

If `PENDING.md` exists AND is not marked `approved: true` in its frontmatter:
- Write an AGENT-LOG entry with `outcome: skipped`, `reason: review_pending`
- Notify user: "Self-improvement review pending — run `/autonomous-approve` to clear"
- **Stop execution.** Do not continue to Step 1.

If `PENDING.md` exists AND is `approved: true`: hand off to
`autonomous-approve` to finalize and resume.

---

## Step 1 — LOAD CONFIG

Read `.claude/project.json`. Extract:
- `commands.{typecheck,test,lint,build,dev}`
- `workspaces[]`
- `branchPrefix`, `ghBin`, `successThreshold`
- `schedule`, `deploy`, `host`

All subsequent steps use these values — never hardcode paths.

## Step 2 — PRECHECKS

```bash
node roadmap/validate.mjs        # roadmap integrity
git fetch origin main --prune    # sync refs
git status --porcelain           # must be clean
```

If roadmap invalid, write AGENT-LOG `outcome: blocked, reason: roadmap_invalid`
and stop.

If working tree dirty, write `outcome: skipped, reason: dirty_tree` and stop.

## Step 3 — SYNC + CLEANUP

```bash
git checkout main
git pull origin main
git remote prune origin

# Delete local branches whose remote is gone
git branch --merged main | grep -E "^\s*${branchPrefix}TASK-" \
  | xargs -r git branch -d
```

## Step 4 — CI AUTO-RECOVERY

Delegate the 3-attempts-per-PR loop to `scripts/ci-fix-recover.mjs`:

```bash
node scripts/ci-fix-recover.mjs
```

The script lists open PRs with a failing `ci` check, spawns a scoped
Claude subprocess (allowlist: `Bash(npm *), Bash(git *), Bash(node *),
Edit, Read, Grep, Glob`) per PR with up to `--max-attempts 3`, and runs
local validation before pushing. Exit codes:

- `0` — zero failing PRs OR all recovered
- `1` — some PRs still failing (script emits JSON summary)
- `2` — infra error (gh CLI missing, claude CLI missing, project.json
  unreadable)

If exit=1: write AGENT-LOG `outcome: blocked, reason:
ci_auto_fix_failed`, include the JSON summary in the entry body, and
stop the run (don't pick a new task while one is stuck).

If exit=2: write AGENT-LOG `outcome: blocked, reason: infra` and stop.

## Step 5 — SELECT TASK

Walk `roadmap.yml` tasks; eligible tasks satisfy ALL:
- `status == "ready"`
- Every `depends_on[i]` has `status == "done"`
- No open PR on `${branchPrefix}<id>-*`
- `attempt_count < 3`

Order by priority (`high > med > low`) then by ID sequence. Pick the first.

Increment `attempt_count` on the selected task, set `last_attempted` to
current ISO timestamp. Commit this on the feature branch — see Step 6.

If no eligible task:
- Write AGENT-LOG `outcome: skipped, reason: no_ready_tasks`
- If fewer than 3 ready tasks in the roadmap, include a "roadmap running
  low — consider running `/pm-brainstorm`" hint
- **Cross-project mirror (autodev-mcp).** Same as Step 10's mirror block,
  but for skipped/blocked exits — without this, the dashboard's cycle
  history shows only successful cycles, hiding skipped/blocked cadence.
  Both calls are best-effort:
  1. `mcp__autodev-mcp__cycleMetrics.record` with `{projectSlug,
     startedAt, finishedAt, outcome:"skipped"}` (token + cost fields
     omitted — no Claude work happened past Step 5).
  2. `mcp__autodev-mcp__agentLog.recordEntry` with `{projectSlug,
     timestamp, outcome:"skipped", body}` where `body` is the AGENT-LOG
     bullet just written.
- Stop.

## Step 6 — BRANCH + CLAIM (branch-as-payload)

Delegate the mechanical part to `scripts/new-branch.sh`:

```bash
branch=$(scripts/new-branch.sh <TASK-ID>)
```

The script reads the task's title from roadmap, derives a slug,
`git checkout -b ${branchPrefix}<id>-<slug> main`, flips the task's
status to `in-progress`, bumps `attempt_count`, stamps
`last_attempted` with the current UTC ISO, re-renders ROADMAP.md, and
commits `roadmap: mark <id> in-progress`. The branch name is printed
on stdout for downstream steps.

Exit codes: `0` ok, `1` if task id missing from roadmap, `2` on setup
errors (missing project.json, slug derivation failed, branch exists).

**All status changes live on the feature branch. Never commit them to main.**

## Step 7 — IMPLEMENT

Follow CLAUDE.md Tier 1 rules:
- One file at a time
- Typecheck + targeted tests between edits (the `post-edit.mjs` hook does this automatically)
- Read whole components before editing
- Write tests for new behavior

Task description drives the work. Consult:
- CLAUDE.md Tier 2/3 (conventions, testing patterns)
- Relevant `techstack_*.md` memory files

Commit implementation with a descriptive message:

```bash
git add <specific-files>
git commit -m "feat/fix: <summary> (<TASK-ID>)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Step 8 — LOCAL VALIDATION

Before running validation, apply Prettier (or the stack-equivalent
formatter) to the files you edited. New files and edits that cross the
print-width boundary reliably trip `format:check` on the first pass,
costing a full fix-cycle for a mechanical reformatting:

```bash
npx prettier --write <every file you touched in Step 7>
```

For non-Node stacks, substitute the equivalent: `black`, `ruff format`,
`gofmt`, `rustfmt`, etc.

Then run every workspace command from `project.json.commands`:

```bash
commands.typecheck   # must pass
commands.lint        # must pass
commands.test        # must pass
commands.build       # must pass (if defined)
```

Record test counts per workspace (for regression detection in Step 10).

If any fail after 3 fix attempts:
- Reset: `git checkout -- .`
- Checkout main, delete branch: `git branch -D <branch>`
- Mark task `status: blocked` with a `blocked_reason` in roadmap.yml on main
- Write AGENT-LOG `outcome: blocked`
- Stop.

## Step 9 — PUSH + PR

```bash
git push -u origin "$branch"

gh pr create \
  --title "<TASK-ID>: <title>" \
  --body "$(cat <<'EOF'
## Summary
Automated implementation of <TASK-ID>.

<1-3 bullets on what was done>

## Task details
- ID: <TASK-ID>
- Priority: <priority>
- Complexity: <complexity>
- Workspaces: <list>

## Test results
- <workspace>: <N> tests passed
- Typecheck: clean
- Lint: clean

## Automated
Generated by /autonomous-run.
EOF
)"

# Before enabling auto-merge, mark task done on the branch so the PR is atomic
# (implementation + status change merge together, never diverging)
```

Delegate the done-marking mechanics to `scripts/finalize-task.sh`:

```bash
scripts/finalize-task.sh <TASK-ID> <PR-URL>
```

The script flips the roadmap task's status to `done`, stamps `pr` +
`completed`, re-renders ROADMAP.md, commits
`roadmap: mark <id> done (PR #<num>)`, and pushes to origin. It prints
the commit SHA on stdout. Exit codes: `0` ok, `1` if task id missing,
`2` on setup errors (invalid PR URL, running on main, etc.).

Then enable auto-merge:

```bash
gh pr merge <num> --auto --squash --delete-branch
```

## Step 10 — LOG + MAYBE REVIEW

Append to `AGENT-LOG.md` via the helper script `scripts/append-agent-log.sh`.
The helper stamps a canonical `YYYY-MM-DD HH:MM` UTC timestamp, appends
after the last existing `### Run` block, and normalises the trailing `---`
separator — all invariants that `scripts/notify-cycle.sh`'s selector
depends on. **Do not write the heading line by hand or use `Edit` / `Write`
to prepend near the top of the file** — format drift there silently breaks
notifications (the lexicographic-max selector falls back to a prior entry
and ntfy pushes announce the wrong cycle).

Feed the entry body (everything below the heading) via stdin:

```bash
scripts/append-agent-log.sh <<'EOF'
- Task: <TASK-ID> — <title>
- Outcome: success
- PR: <url>
- Test counts: <workspace>=<N>, <workspace>=<N>, ...
- Files changed: <list>
- Regression alert: <true if any count decreased, else false>
- Review proposed: <true if success-threshold reached, else false>
- Deploy: <filled in Step 13 if applicable>
- Tokens: <input>/<output>/<total> (cost: $<USD>)   # omit if CLI didn't expose it
- Lessons learned: <optional free text>
EOF
```

The helper prints the heading it used (e.g. `### Run [2026-04-23 07:30]`)
on stdout — capture it if Steps 11–13 need to amend the entry in place
with `Edit`.

**Regression check:** run `scripts/regression-check.mjs` with the current
test counts; it parses the previous `success` entry's counts from
AGENT-LOG and compares per workspace.

```bash
node scripts/regression-check.mjs 'core=938, content=181, web=551'
```

The script emits JSON `{regressed, workspaces: {name: {prev, curr, delta}}, missingInCurrent}`
and exits 1 on regression, 0 on clean, 2 on unreadable prior entry.
If exit=1, set `regression_alert: true` and outcome →
`success_with_warning`. If exit=2, treat the comparison as not-applicable
(first run of the cycle, fresh log) and leave `regression_alert: false`.

**Review trigger:** count trailing consecutive `success` / `success_with_warning`
entries. If `>= successThreshold` AND no REVIEW-LOG entry exists in that
streak, invoke `/autonomous-review` (adds a PENDING.md + pauses cron).

**Cross-project mirror (autodev-mcp).** If the MCP server is configured
in `.mcp.json` (connection name `autodev-mcp`), also mirror this cycle
into the cross-project store so the dashboard + cross-project
aggregates stay current:

1. Call `mcp__autodev-mcp__cycleMetrics.record` with `{projectSlug,
   startedAt, outcome, taskId?, prUrl?, inputTokens?, outputTokens?,
   costUsd?, ciDurationS?, regressionAlert?}` — same shape as the
   AGENT-LOG bullets.
2. Call `mcp__autodev-mcp__agentLog.recordEntry` with `{projectSlug,
   timestamp, taskId?, outcome, body}` where `body` is the full bullet
   list written above (kept intact for full-text search).

Both calls are best-effort — if the MCP connection is absent or the
tool errors (e.g. the MCP HTTP server is down), log a warning line and
continue. Never fail the cycle over a cross-project mirror failure;
the local `AGENT-LOG.md` remains the source of truth.

---

**Steps 11–13 only run if `deploy.autoDeployOnMerge: true`.**

## Step 11 — WAIT FOR MERGE + DEPLOY

Poll for up to 10 minutes (120 * 5s) waiting for PR merge:

```bash
gh pr view <num> --json state | jq -r .state  # expect: MERGED
```

Once merged, pull main:

```bash
git checkout main && git pull origin main
```

Invoke the `/deploy` skill.

If PR doesn't merge in 10 min (CI slow or failing): write AGENT-LOG
`deploy: deferred, reason: pr_not_merged_in_time` and stop (next run picks up).

## Step 12 — HEALTH CHECK

`/deploy` runs `scripts/healthcheck.sh` which polls `deploy.healthCheckUrl`
until 200 OK or `healthCheckTimeoutSec` elapses.

## Step 13 — ROLLBACK (if health fails)

If health check times out:
1. `/deploy` runs `scripts/rollback.sh` (restores previous image tag)
2. Mark THIS TASK as `blocked` with `blocked_reason: "deploy failed health check"`
   on main (direct commit — exceptional case)
3. Write AGENT-LOG `deploy: rolled_back`
4. Send notification
5. Do NOT cascade: other tasks are still pickupable. Next run proceeds.

---

## After Step 13 (or Step 10 if no deploy): done.

Return control to the scheduler. Next fire will be on the configured cron.
