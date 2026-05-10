#!/usr/bin/env bash
# deploy.sh — build + up -d + health-check + auto-rollback on fail
#
# Reads .claude/project.json for deploy settings. Invoked by /deploy skill
# or directly by operators.
#
# Exit codes:
#   0  success, healthy
#   1  build failed
#   2  container start failed
#   3  health check failed AND rollback failed (critical)
#   4  health check failed, rollback succeeded (app on previous image)
#   5  prisma migrate deploy failed (db unchanged, app not recreated)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Read project.json with node (no jq dependency) ---
read_config() {
  node -e "
    const p = require('$PROJECT_ROOT/.claude/project.json');
    console.log(p.deploy?.$1 ?? '');
  " 2>/dev/null || echo ""
}

HEALTH_URL=$(read_config healthCheckUrl)
TIMEOUT=$(read_config healthCheckTimeoutSec)
ROLLBACK_ON_FAIL=$(read_config rollbackOnFail)
STRATEGY=$(read_config strategy)
SLUG=$(node -e "console.log(require('$PROJECT_ROOT/.claude/project.json').project?.slug ?? 'app')" 2>/dev/null || echo "app")

HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
TIMEOUT="${TIMEOUT:-90}"
STRATEGY="${STRATEGY:-rolling}"

COMPOSE="docker compose -f docker/docker-compose.yml"

# --- Record previous image tag for rollback ---
if docker image inspect "${SLUG}:latest" >/dev/null 2>&1; then
  PREV_ID=$(docker image inspect "${SLUG}:latest" --format '{{.Id}}')
  echo "$PREV_ID" > "$SCRIPT_DIR/.previous-image"
  docker tag "${SLUG}:latest" "${SLUG}:previous" || true
fi

# --- Build ---
echo "==> Building ${SLUG}:latest"
$COMPOSE build --no-cache app || { echo "build failed" >&2; exit 1; }

# --- Apply DB migrations (against the freshly built image) ---
# Runs `prisma migrate deploy` in a one-shot container off the new image
# BEFORE swapping the live app. Migrations are additive (Prisma's
# expand-contract pattern) so the old container can still serve while
# the new schema lands; if migrate fails we exit before any swap, leaving
# the previous image serving with the previous schema.
# `compose run` honours the app service's `depends_on: db: service_healthy`,
# so db is started + waited on automatically.
echo "==> Applying Prisma migrations"
$COMPOSE run --rm app npx prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma \
  || { echo "migration failed" >&2; exit 5; }

# --- Start / reload ---
echo "==> Deploying (strategy: $STRATEGY)"
if [[ "$STRATEGY" == "restart" ]]; then
  $COMPOSE down
  $COMPOSE up -d
else
  # rolling strategy: ensure dependent services (db, redis, mailcatcher, …)
  # are running first, then force-recreate just the app container. The
  # `up -d --no-recreate` pass starts any missing services without touching
  # already-healthy ones; the second pass swaps the app with minimal gap.
  # Without the first pass, a freshly-introduced compose service (e.g. a
  # postgres `db` added in a later task) is never started and the rolling
  # app recreate fails its healthcheck because its dependencies don't exist.
  $COMPOSE up -d --no-recreate
  $COMPOSE up -d --no-deps --force-recreate app
fi

# --- Health check ---
echo "==> Health check: $HEALTH_URL (timeout ${TIMEOUT}s)"
if bash "$SCRIPT_DIR/healthcheck.sh" "$HEALTH_URL" "$TIMEOUT"; then
  echo "==> Deploy successful"
  # tag old image as n-1 for quick rollback if future deploy fails
  rm -f "$SCRIPT_DIR/.previous-image"
  exit 0
fi

# --- Health failed: rollback? ---
echo "==> Health check FAILED"
if [[ "$ROLLBACK_ON_FAIL" != "true" ]]; then
  echo "==> Rollback disabled; leaving failed deploy in place" >&2
  exit 4
fi

echo "==> Rolling back..."
if bash "$SCRIPT_DIR/rollback.sh"; then
  echo "==> Rollback successful; previous image restored"
  exit 4
else
  echo "==> Rollback FAILED — app may be in a broken state" >&2
  exit 3
fi
