#!/usr/bin/env bash
# finalize-task.sh — extract /autonomous-run Step 9 (roadmap done-marking
# before enabling auto-merge) into a deterministic script. Flips roadmap
# status → done, stamps pr + completed, re-renders, commits and pushes.
#
# Usage:   scripts/finalize-task.sh <TASK-ID> <PR-URL>
# Stdout:  the commit SHA of the roadmap commit
# Exit:    0 on success, 1 if task id missing, 2 on setup errors

set -euo pipefail

TASK_ID="${1:-}"
PR_URL="${2:-}"
if [[ -z "$TASK_ID" || -z "$PR_URL" ]]; then
  echo "usage: $0 <TASK-ID> <PR-URL>" >&2
  exit 2
fi

if [[ ! "$PR_URL" =~ ^https?://[^[:space:]]+/pull/[0-9]+ ]]; then
  echo "finalize-task: PR URL must look like https://.../pull/<num>, got '$PR_URL'" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Must be on a non-main branch (the feature branch owning this task).
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" || -z "$BRANCH" ]]; then
  echo "finalize-task: refusing to run on '$BRANCH' — switch to the feature branch" >&2
  exit 2
fi

node "$ROOT/scripts/roadmap-update-task.mjs" "$TASK_ID" \
  --status done \
  --pr "$PR_URL" \
  --completed-now || {
    echo "finalize-task: $TASK_ID not found in roadmap" >&2
    exit 1
  }

node "$ROOT/roadmap/render.mjs"

# Extract PR number from URL for the commit subject.
PR_NUM="${PR_URL##*/pull/}"
PR_NUM="${PR_NUM%%[![:digit:]]*}"

git add roadmap/roadmap.yml ROADMAP.md
git commit -m "roadmap: mark $TASK_ID done (PR #$PR_NUM)" >/dev/null
git push origin "$BRANCH" >/dev/null

git rev-parse HEAD
