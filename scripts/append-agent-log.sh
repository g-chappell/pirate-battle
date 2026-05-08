#!/usr/bin/env bash
# append-agent-log.sh — append a new entry to AGENT-LOG.md with a
# canonical UTC timestamp. Reads the entry body (everything after the
# `### Run [...]` heading line) from stdin.
#
# Usage:
#   scripts/append-agent-log.sh <<'EOF'
#   - Task: TASK-XXX — title
#   - Outcome: success
#   - PR: https://...
#   - Test counts: core=123, web=45
#   - Files changed: ...
#   - Regression alert: false
#   - Review proposed: false
#   - Deploy: pending
#   - Lessons learned:
#     - ...
#   EOF
#
# Guarantees:
#   - Timestamp is always `YYYY-MM-DD HH:MM` in UTC — the single format
#     that `scripts/notify-cycle.sh`'s selector recognises.
#   - Entry is appended AFTER the last `### Run` block, never prepended.
#   - Write is atomic (tmpfile + mv).
#   - Prints the heading used so the caller can amend it later with
#     Edit-in-place (e.g. Step 14 deploy outcome, Step 15 review status).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/AGENT-LOG.md"

if [[ ! -f "$LOG" ]]; then
  echo "append-agent-log: $LOG not found" >&2
  exit 1
fi

BODY="$(cat)"
# Strip a trailing newline if one slipped in from the heredoc — we re-add
# exactly one below. Preserves intentional internal blank lines.
BODY="${BODY%$'\n'}"
if [[ -z "$BODY" ]]; then
  echo "append-agent-log: stdin empty — no body to append" >&2
  exit 1
fi

TS="$(date -u +"%Y-%m-%d %H:%M")"
HEADING="### Run [$TS]"

# Expected canonical file tail is `...content\n\n---\n\n`. Normalise to
# exactly that shape before appending, so a previously mis-written tail
# (missing separator, extra blank lines, absent trailing newline) doesn't
# compound into further drift.
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# 1. Copy file, stripping any trailing blank lines + a trailing `---`
#    block, so we can re-emit a canonical tail.
awk '
  { lines[NR] = $0 }
  END {
    # Walk backwards dropping blank lines and the trailing `---`.
    last = NR
    while (last > 0 && lines[last] == "") last--
    if (last > 0 && lines[last] == "---") {
      last--
      while (last > 0 && lines[last] == "") last--
    }
    for (i = 1; i <= last; i++) print lines[i]
  }
' "$LOG" > "$TMP"

# 2. Append the canonical separator + new entry + canonical tail.
{
  printf '\n---\n\n%s\n%s\n\n---\n\n' "$HEADING" "$BODY"
} >> "$TMP"

mv "$TMP" "$LOG"
trap - EXIT

echo "$HEADING"
