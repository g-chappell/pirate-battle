#!/usr/bin/env bash
# check-cycle-running.sh — probe whether the autonomous cycle is currently
# executing. Consumed by hooks (.claude/hooks/userprompt-cycle-guard.mjs),
# by scripts (scripts/deploy.sh collision guard), and by anyone who wants
# to know "is it safe to touch the working tree right now?".
#
# Exit 0: cycle is active (systemctl reports active OR activating).
# Exit 1: cycle is not active (inactive, failed, or unit missing).
#
# Prints the unit's ActiveState to stdout for diagnostic use.
#
# Path-agnostic: derives the slug from the project root basename so the
# same script works for any derived project whose systemd unit follows
# the `claude-<slug>.service` convention.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SLUG="$(basename "$ROOT")"
UNIT="claude-${SLUG}.service"

state="$(systemctl show "$UNIT" -p ActiveState --value 2>/dev/null)"
echo "$state"

case "$state" in
  active|activating) exit 0 ;;
  *)                 exit 1 ;;
esac
