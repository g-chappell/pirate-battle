#!/usr/bin/env bash
# notify-cycle.sh — parse the last AGENT-LOG entry and push a one-line
# summary to ntfy.sh. Used by claude-<slug>.service as Stage 2
# (replaces the earlier PushNotification approach which hit the
# Anthropic "user active" suppression guard).
#
# Path-agnostic: derives project root from its own location, so the
# same file can sit under any /opt/<slug>/scripts/ without edits.
#
# Requires: NTFY_TOPIC + NTFY_SERVER (in .env, sourced via EnvironmentFile)
# Exits 0 always — a failed notify must not fail the cycle.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/AGENT-LOG.md"

# Source .env explicitly since systemd's EnvironmentFile= sets vars but
# doesn't "source"; this script may be invoked outside systemd too.
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT/.env"; set +a
fi

# Project name for the notification title. Prefer project.json, fall
# back to the directory basename if jq is missing or the file is stale.
PROJECT_NAME=""
if command -v jq >/dev/null 2>&1 && [[ -f "$ROOT/.claude/project.json" ]]; then
  PROJECT_NAME="$(jq -r '.project.name // empty' "$ROOT/.claude/project.json" 2>/dev/null)"
fi
PROJECT_NAME="${PROJECT_NAME:-$(basename "$ROOT")}"

NTFY_SERVER="${NTFY_SERVER:-https://ntfy.sh}"
if [[ -z "${NTFY_TOPIC:-}" ]]; then
  echo "notify-cycle: NTFY_TOPIC not set; skipping" >&2
  exit 0
fi

if [[ ! -f "$LOG" ]]; then
  curl -fsSL --max-time 10 \
    -H "Title: ${PROJECT_NAME} — log missing" \
    -H "Priority: urgent" \
    -H "Tags: warning" \
    -d "AGENT-LOG.md not found at $LOG. Cycle ran but log wasn't written." \
    "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null || true
  exit 0
fi

# Extract the most recent "### Run" block. Picks the block whose
# timestamp is chronologically largest, NOT the last one by file
# position — defends against the log briefly drifting out of
# chronological order (seen historically when a cycle inserted its
# entry near the top of the file instead of appending).
#
# Accepts two timestamp formats so format drift in the write path
# doesn't silently drop entries:
#   [YYYY-MM-DD HH:MM]          — canonical, written by scripts/append-agent-log.sh
#   [YYYY-MM-DDTHH:MM(:SS)?Z]   — ISO-8601 variant, sometimes emitted by hand
#
# Normalises both to `YYYY-MM-DD HH:MM:SS` before the lexicographic compare
# so that a same-day ISO entry (e.g. `2026-04-23T05:00:00Z`) does NOT
# dominate a later canonical entry (e.g. `2026-04-23 14:49`). A raw string
# compare would pick the ISO entry because 'T' > ' ' in ASCII; normalising
# first avoids the trap.
LAST_ENTRY="$(awk '
  function normalise(ts,    n) {
    # Strip trailing Z (UTC marker) and replace T with space.
    n = ts
    sub(/Z$/, "", n)
    sub(/T/, " ", n)
    # Pad ":SS" when seconds are missing, so all keys are the same width.
    if (n ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$/) n = n ":00"
    return n
  }
  function flush(   _raw, _ts) {
    if (buf == "") return
    _ts = ""
    if (match(buf, /^### Run \[[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?Z?\]/)) {
      # Strip leading "### Run [" (9 chars) and trailing "]" (1 char).
      _raw = substr(buf, RSTART + 9, RLENGTH - 10)
      _ts = normalise(_raw)
    }
    if (_ts > best_ts) { best_ts = _ts; best = buf }
  }
  /^### Run/ { flush(); buf = $0; next }
  buf        { buf = buf "\n" $0 }
  END        { flush(); print best }
' "$LOG")"

if [[ -z "$LAST_ENTRY" ]]; then
  echo "notify-cycle: no ### Run entries in $LOG; skipping" >&2
  exit 0
fi

# Pull key fields. Missing ones stay empty.
heading="$(printf '%s' "$LAST_ENTRY" | head -n1 | sed 's/^### Run *//;s/[][]//g')"
task="$(printf '%s' "$LAST_ENTRY" | grep -m1 '^- Task:'    | sed 's/^- Task: *//')"
outcome="$(printf '%s' "$LAST_ENTRY" | grep -m1 '^- Outcome:' | sed 's/^- Outcome: *//')"
pr="$(printf '%s' "$LAST_ENTRY" | grep -m1 '^- PR:'      | sed 's/^- PR: *//')"
deploy="$(printf '%s' "$LAST_ENTRY" | grep -m1 '^- Deploy:'  | sed 's/^- Deploy: *//')"
review="$(printf '%s' "$LAST_ENTRY" | grep -m1 '^- Review proposed:' | sed 's/^- Review proposed: *//')"
reg="$(printf '%s' "$LAST_ENTRY" | grep -m1 '^- Regression alert:' | sed 's/^- Regression alert: *//')"

# Plain-language description from the PR body's "## Summary" section.
# Best-effort — a failed `gh` call silently drops the blurb.
blurb=""
pr_num="$(printf '%s' "$pr" | sed -nE 's|.*pull/([0-9]+).*|\1|p' | head -1)"
if [[ -n "$pr_num" ]] && command -v gh >/dev/null 2>&1; then
  blurb="$(gh pr view "$pr_num" --json body --jq '.body' 2>/dev/null \
    | awk '
        /^## Summary$/ { on=1; next }
        /^## / && on   { exit }
        on             { print }
      ' \
    | sed '/^[[:space:]]*$/d' \
    | awk 'BEGIN{budget=500} { if (budget - length - 1 < 0) exit; print; budget -= length + 1 }')"
fi

# Short deploy verdict ("success" / "failure") — full line is a paragraph.
deploy_short="$(printf '%s' "$deploy" | awk '{print $1}')"

# Pick priority + emoji based on outcome.
case "$outcome" in
  success)              prio="default"; tag="white_check_mark" ;;
  success_with_warning) prio="high";    tag="warning" ;;
  skipped)              prio="low";     tag="pause_button" ;;
  blocked)              prio="urgent";  tag="no_entry" ;;
  *)                    prio="default"; tag="robot" ;;
esac

# Compose body: one block per field. Title = a short summary line.
title="${PROJECT_NAME} ${task:-cycle}"

body=""
[[ -n "$blurb" ]] && body="${blurb}

"
body="${body}Outcome: ${outcome:-unknown} · Deploy: ${deploy_short:-n/a}
Time: ${heading:-?}"

review_first="$(printf '%s' "$review" | awk '{print $1}')"
if [[ -n "$review_first" && "$review_first" != "false" && "$review_first" != "null" ]]; then
  body="$body
Review: $review"
fi

if [[ -n "$reg" && "$reg" == "true" ]]; then
  body="$body
⚠ Regression alert"
fi

# Fire the push. --max-time 10 so a wedged ntfy server can't stall
# the systemd unit's completion. Failure is non-fatal.
curl -fsSL --max-time 10 \
  -H "Title: $title" \
  -H "Priority: $prio" \
  -H "Tags: $tag" \
  -d "$body" \
  "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null || {
    echo "notify-cycle: ntfy POST failed (not fatal)" >&2
    exit 0
}

echo "notify-cycle: pushed to $NTFY_SERVER/<topic> — outcome=$outcome, task=$task"

# Best-effort heartbeat to autodev-mcp. Never fails the cycle — the MCP
# may be down or unreachable and that must not block the ntfy push
# above or the systemd unit's completion.
if [[ -x "$ROOT/scripts/mcp-heartbeat.sh" ]]; then
  "$ROOT/scripts/mcp-heartbeat.sh" || true
fi
