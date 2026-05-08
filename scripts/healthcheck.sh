#!/usr/bin/env bash
# healthcheck.sh — poll a URL until it returns 200 or timeout
#
# Usage:  bash healthcheck.sh <url> [timeout_sec]
# Default timeout: 90s. Retries every 2s.
#
# Exit 0 on 200, exit 1 on timeout.

set -euo pipefail

URL="${1:-http://localhost:3000/health}"
TIMEOUT="${2:-90}"
INTERVAL=2

DEADLINE=$(( $(date +%s) + TIMEOUT ))
ATTEMPT=0

while true; do
  ATTEMPT=$((ATTEMPT + 1))
  if curl --silent --fail --max-time 5 --output /dev/null "$URL"; then
    echo "healthcheck ok (attempt $ATTEMPT)"
    exit 0
  fi
  if (( $(date +%s) >= DEADLINE )); then
    echo "healthcheck TIMEOUT after ${TIMEOUT}s (${ATTEMPT} attempts)" >&2
    exit 1
  fi
  sleep "$INTERVAL"
done
