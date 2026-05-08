#!/usr/bin/env bash
# branch-protection.sh — apply branch protection rules + enable auto-merge
#
# Run once after the GitHub repo is created. Requires `gh` authenticated.
#
# Usage: bash .github/branch-protection.sh
#
# What it does:
#   - Requires the `ci` status check on main (strict — commits must be up to date)
#   - Disables force pushes
#   - Disables branch deletion
#   - Enables squash auto-merge on the repo

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not installed. See https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
if [[ -z "$REPO" ]]; then
  echo "error: no GitHub remote detected. Run 'gh repo create' first." >&2
  exit 1
fi

echo "Applying branch protection to $REPO:main"

# NOTE: required_status_checks.contexts should include exactly the job names
# in .github/workflows/ci.yml. If you add more jobs (e.g. e2e), edit this
# list accordingly.
PROTECTION_PAYLOAD=$(cat <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["ci"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
EOF
)

echo "$PROTECTION_PAYLOAD" | gh api \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/$REPO/branches/main/protection" \
  --input -

echo "Branch protection applied."

echo "Enabling squash auto-merge on the repo..."
gh repo edit --enable-auto-merge --enable-squash-merge

echo "Done. Verify at: https://github.com/$REPO/settings/branches"
