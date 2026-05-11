#!/usr/bin/env bash
# Opens the current UTC-month Season row if it doesn't already exist.
# Idempotent — safe to run multiple times per month.
#
# Intended as the body of a system cron entry that fires on the 1st of each
# month (~ 00:10 UTC) and on container restart, e.g.
#
#   10 0 1 * *  cd /opt/pirate-battle && scripts/season-cron.sh >> /var/log/pirate-battle-season.log 2>&1
#
# Wiring the cron itself is out of scope for TASK-046; that lands when the
# season feature is fully exercised end-to-end.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set; aborting" >&2
  exit 2
fi

npm --workspace apps/server exec -- tsx scripts/open-season.ts
