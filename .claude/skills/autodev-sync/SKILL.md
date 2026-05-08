---
name: autodev-sync
description: Heartbeat this project to the autodev-mcp cross-project server. Updates last_heartbeat_at + project metadata (repo URL, display name, tech stack) so the dashboard at dashboard.blacksail.dev sees the project as active. Invoked automatically by notify-cycle.sh at the end of every autonomous cycle; also user-invocable for manual syncs after editing roadmap.yml or project.json outside a cycle.
user-invocable: true
---

# /autodev-sync

Manually push a heartbeat to autodev-mcp. No args.

## When to invoke manually

- After editing `roadmap.yml` or `.claude/project.json` outside of a cycle —
  the dashboard picks up the new metadata on the next heartbeat.
- Debugging a missing dashboard card: confirms the MCP endpoint is
  reachable and credentials are correct.
- Before opening the dashboard to make sure the latest state is shown.

## When NOT to invoke

- **Inside an autonomous cycle** — `scripts/notify-cycle.sh` already calls
  `scripts/mcp-heartbeat.sh` as its final step. Calling again would
  duplicate the heartbeat.
- **If `MCP_HTTP_URL` or `MCP_BEARER_TOKEN` aren't set in `.env`** — the
  script no-ops (exits 0 with a skip message). That's by design: new
  projects inherit this skill from the template but only start
  heartbeating once the MCP is provisioned on the VPS.

## Steps

1. Run `scripts/mcp-heartbeat.sh`. It:
   - Sources `.env` for `MCP_HTTP_URL` + `MCP_BEARER_TOKEN`.
   - Reads slug + metadata from `.claude/project.json` (with defensive
     fallbacks to `basename` and git origin).
   - POSTs `{displayName, repoUrl, vpsPath, deployUrl, techStack}` to
     `$MCP_HTTP_URL/api/heartbeat/<slug>` with bearer auth.
   - Exits 0 on any failure (heartbeat is best-effort; never fails a
     caller).

2. Relay the script's one-line stdout output to the user
   (`mcp-heartbeat: sent slug=<slug>` or `skipping` / `POST failed`).

3. If the user asked for a sync in order to *verify* the MCP is up and
   reachable and the heartbeat failed, follow up with a curl GET against
   `$MCP_HTTP_URL/api/projects` (no bearer needed — reads are public) to
   isolate whether the HTTP server or the auth-protected write is the
   failure mode.

## Why this exists

`autodev-mcp` aggregates cycle metrics + patterns + heartbeats from
every project in the `/opt/<slug>/` family. The dashboard's "Active
projects" tile + per-project card rely on `projects.last_heartbeat_at`
being fresh — which this skill guarantees without waiting for the next
cycle to fire.
