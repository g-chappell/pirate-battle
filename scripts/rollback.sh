#!/usr/bin/env bash
# rollback.sh — restore the previous image tag and restart the app
#
# Invoked automatically by deploy.sh when healthcheck fails. Can also be
# run manually to undo the last deploy.
#
# Exit 0 if rollback succeeds (app running on previous image, health ok).
# Exit 1 if rollback fails (app in broken state — operator intervention needed).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

SLUG=$(node -e "console.log(require('$PROJECT_ROOT/.claude/project.json').project?.slug ?? 'app')" 2>/dev/null || echo "app")

HEALTH_URL=$(node -e "
  const p = require('$PROJECT_ROOT/.claude/project.json');
  console.log(p.deploy?.healthCheckUrl ?? 'http://localhost:3000/health');
" 2>/dev/null)

COMPOSE="docker compose -f docker/docker-compose.yml"

# --- Find the previous image ---
if ! docker image inspect "${SLUG}:previous" >/dev/null 2>&1; then
  echo "error: no previous image tagged ${SLUG}:previous" >&2
  echo "       (is this the first deploy? cannot rollback further.)" >&2
  exit 1
fi

echo "==> Restoring ${SLUG}:previous as ${SLUG}:latest"
docker tag "${SLUG}:previous" "${SLUG}:latest"

echo "==> Restarting app"
$COMPOSE up -d --no-deps --force-recreate app

echo "==> Verifying restored app is healthy"
if bash "$SCRIPT_DIR/healthcheck.sh" "$HEALTH_URL" 60; then
  echo "==> Rollback OK"
  exit 0
fi

echo "==> Rollback health check failed — app is in a broken state" >&2
exit 1
