#!/usr/bin/env bash
# new-branch.sh — extract /autonomous-run Step 6 (BRANCH + CLAIM) into a
# deterministic script. The cycle still decides WHICH task to pick; this
# script does the mechanical part: slug from title → branch off main →
# flip roadmap status → bump attempt_count → re-render → commit.
#
# Usage:   scripts/new-branch.sh <TASK-ID>
# Stdout:  the new branch name (for callers that need to push it later)
# Exit:    0 on success, 1 if task id missing from roadmap, 2 on setup errors
#
# Requires a clean working tree on `main` (or at least mergeable to main).

set -euo pipefail

TASK_ID="${1:-}"
if [[ -z "$TASK_ID" ]]; then
  echo "usage: $0 <TASK-ID>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_JSON="$ROOT/.claude/project.json"
if [[ ! -f "$PROJECT_JSON" ]]; then
  echo "new-branch: $PROJECT_JSON missing" >&2
  exit 2
fi
BRANCH_PREFIX="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).branchPrefix ?? 'auto/')" "$PROJECT_JSON")"

TITLE="$(node "$ROOT/scripts/roadmap-update-task.mjs" "$TASK_ID" --print-title)" || {
  echo "new-branch: $TASK_ID not found in roadmap/roadmap.yml" >&2
  exit 1
}

# Slugify: lowercase, replace whitespace and non-alphanumeric runs with
# a single `-`, strip leading/trailing `-`, clip at 50 chars.
SLUG="$(printf '%s' "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
  | cut -c1-50 \
  | sed -E 's/-+$//')"

if [[ -z "$SLUG" ]]; then
  echo "new-branch: slug derivation produced empty string from title '$TITLE'" >&2
  exit 2
fi

BRANCH="${BRANCH_PREFIX}${TASK_ID}-${SLUG}"

git checkout -b "$BRANCH" main >/dev/null 2>&1 || {
  echo "new-branch: could not create branch $BRANCH (already exists?)" >&2
  exit 2
}

node "$ROOT/scripts/roadmap-update-task.mjs" "$TASK_ID" \
  --status in-progress \
  --increment-attempt-count \
  --last-attempted-now

node "$ROOT/roadmap/render.mjs"

git add roadmap/roadmap.yml ROADMAP.md
git commit -m "roadmap: mark $TASK_ID in-progress" >/dev/null

echo "$BRANCH"
