#!/usr/bin/env bash
# mcp-heartbeat.sh — POST a heartbeat to autodev-mcp's HTTP API so the
# dashboard + cross-project aggregates see this project as active.
#
# Path-agnostic: derives project root from its own location so the
# same file can sit under any /opt/<slug>/scripts/ without edits.
# Keeps this file identical to the autodev-template master copy.
#
# Requires (in .env, sourced via EnvironmentFile):
#   MCP_HTTP_URL     — e.g. http://127.0.0.1:4000  (no trailing slash)
#   MCP_BEARER_TOKEN — shared secret matching the MCP's BEARER_TOKEN
#
# Exits 0 always — a failed heartbeat must not fail the cycle.

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT/.env"; set +a
fi

if [[ -z "${MCP_HTTP_URL:-}" || -z "${MCP_BEARER_TOKEN:-}" ]]; then
  echo "mcp-heartbeat: MCP_HTTP_URL or MCP_BEARER_TOKEN not set; skipping" >&2
  exit 0
fi

# Prefer project.json for metadata; fall back to directory basename.
slug=""
display_name=""
repo_url=""
deploy_url=""
tech_stack=""
if command -v jq >/dev/null 2>&1 && [[ -f "$ROOT/.claude/project.json" ]]; then
  slug="$(jq -r '.project.slug // empty' "$ROOT/.claude/project.json" 2>/dev/null)"
  display_name="$(jq -r '.project.name // empty' "$ROOT/.claude/project.json" 2>/dev/null)"
  deploy_url="$(jq -r '.deploy.url // empty' "$ROOT/.claude/project.json" 2>/dev/null)"
  tech_stack="$(jq -r '.framework // .language // empty' "$ROOT/.claude/project.json" 2>/dev/null)"
fi
slug="${slug:-$(basename "$ROOT")}"
display_name="${display_name:-$slug}"

# Derive repo_url from git origin.
repo_url="$(git -C "$ROOT" remote get-url origin 2>/dev/null | sed 's|\.git$||')"

# Assemble JSON payload defensively — only include fields we actually have.
payload="$(jq -nc \
  --arg displayName "$display_name" \
  --arg repoUrl "$repo_url" \
  --arg vpsPath "$ROOT" \
  --arg deployUrl "$deploy_url" \
  --arg techStack "$tech_stack" \
  '{
    displayName: (if $displayName == "" then null else $displayName end),
    repoUrl:     (if $repoUrl == ""     then null else $repoUrl     end),
    vpsPath:     (if $vpsPath == ""     then null else $vpsPath     end),
    deployUrl:   (if $deployUrl == ""   then null else $deployUrl   end),
    techStack:   (if $techStack == ""   then null else $techStack   end)
  } | with_entries(select(.value != null))' 2>/dev/null)"

[[ -z "$payload" ]] && payload='{}'

curl -fsSL --max-time 10 \
  -X POST \
  -H "Authorization: Bearer ${MCP_BEARER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "${MCP_HTTP_URL%/}/api/heartbeat/${slug}" >/dev/null || {
    echo "mcp-heartbeat: POST failed (not fatal)" >&2
    exit 0
}

echo "mcp-heartbeat: sent slug=$slug"
