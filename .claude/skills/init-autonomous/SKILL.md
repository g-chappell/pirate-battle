---
name: init-autonomous
description: THE setup wizard — bootstrap a new project end-to-end (env check, GitHub, PM, architect, VPS, workspace, roadmap, cadence, first deploy). One command from empty directory to running autonomous agent.
user-invocable: true
disable-model-invocation: true
---

# /init-autonomous

One entry point for an entire new project. Walks the user through **9 phases**,
each idempotent and skippable. Re-running resumes from the last completed phase
(progress tracked in `.claude/.setup-progress`).

## When to use

- First time setting up a project with this starter.
- To re-run a specific phase later (e.g. `--phase=4` to re-do VPS setup).

## Design principle

Every phase checks if its work is already done before running. The user can
say "skip" to any phase, come back later. All artifacts idempotent.

## Progress tracking

File: `.claude/.setup-progress` (JSON)

```json
{
  "lastCompletedPhase": 4,
  "startedAt": "2026-04-20T12:00:00Z",
  "answers": {
    "projectName": "...", "projectSlug": "...",
    "language": "...", "workspaces": [...],
    "hasVps": true, "vpsHost": "...", "appDomain": "...",
    "autoDeployOnMerge": true, ...
  }
}
```

Re-run: `/init-autonomous` → read progress, ask "resume from Phase N? (y/n) or [s]tart over".

## Phase 0 — Environment check (no prompts)

Run these checks; fail hard on missing required tools:

```bash
node --version           # require ≥ 20
gh auth status           # require logged-in
git --version            # require ≥ 2
docker --version         # optional, warn if missing
ssh -V 2>&1              # optional, warn if missing
python3 --version 2>&1   # optional (viewer convenience)
```

Also detect project context:

```bash
git rev-parse --show-toplevel     # inside a repo?
ls package.json pyproject.toml go.mod Cargo.toml 2>/dev/null
# count source files per extension (help detect existing stack)
```

Report findings to user before asking anything. Abort with install instructions
if required tools missing.

## Phase 1 — Product discovery (PM mindset)

Hand off to the `pm-brainstorm` skill for the interview. Key outputs captured
back into the wizard's progress file:

- One-sentence pitch
- Primary user + job-to-be-done
- Why-now
- MVP success signal
- 3–5 epic drafts (each with 2–4 story drafts)
- 2–3 non-goals

Write: `~/.claude/memory/project_{{slug}}_vision.md`

## Phase 2 — Tech stack (architect mindset)

If an existing codebase was detected in Phase 0, confirm the stack and ask
only about gaps (test commands, lint, etc.).

Otherwise, present 3 recommended stack options based on MVP requirements
gathered in Phase 1:

- **Web app:** TypeScript + React + Postgres (for apps with UI)
- **API / service:** Python + FastAPI + Postgres (for data APIs)
- **CLI tool:** Go or Rust (for distributable binaries)

Ask about:
- Monorepo vs. single package (workspaces list)
- Test framework, typecheck command, lint command, build command, dev command
- `gh` binary path (probe `which gh`, fall back to OS-specific)

Write: `.claude/project.json` (fill `language`, `workspaces[]`, `commands.*`, `ghBin`)
Write: `~/.claude/memory/techstack_<name>.md` per major technology (one per
framework/library — reusable across future projects).

## Phase 3 — GitHub setup

```bash
# Ask public/private
gh repo create <slug> --private --source=. --remote=origin
git add . && git commit -m "initial commit: autonomous starter scaffolding"
git push -u origin main
```

Install CI workflow from `.github/workflows/ci.yml.tmpl`, filling
language-appropriate blocks based on `project.json.language`.

Run `bash .github/branch-protection.sh` to:
- require the `ci` check on main
- enable squash auto-merge

Write: `.github/workflows/ci.yml`, `.github/pull_request_template.md`

## Phase 4 — VPS setup (optional)

Ask: "Do you have a VPS to auto-deploy to? (yes/no/later)"

If **yes**, collect:
- VPS hostname or IP
- SSH user
- SSH key path
- App domain
- Deploy method: docker (default) / systemd / pm2
- Auto-deploy policy: every merge / tagged releases / manual
- Health check URL (default `http://localhost:3000/health`)
- Rollback on health-check fail: yes/no
- Strategy: rolling / restart

Write all answers into `project.json.deploy`.

Then tell the user to run these on the VPS:

```bash
git clone <repo-url> /opt/<slug>
cd /opt/<slug>
# open Claude Code on the VPS:
/vps-setup
```

The `/vps-setup` sub-skill (runs on the VPS, not here) handles: apt installs
(docker, nginx, gh), `gh auth login`, systemd unit for `claude-<slug>`,
nginx reverse-proxy config, `.env` generation from `.env.example`,
`systemctl enable --now`.

If the user picks **no/later**, skip — deploy fields remain empty and the
`deploy` skill is inert. Everything else still works.

## Phase 5 — Workspace scaffolding

Always runs. Writes:

- `CLAUDE.md` — filled from `CLAUDE.md.tmpl` with Phase 1/2 answers
- `.claude/settings.json` — from template (the `.tmpl` → final rename)
- `.claude/launch.json` — dev server commands from Phase 2
- `.mcp.json` — from `.mcp.json.tmpl` (registers the autodev-mcp stdio
  server). Remove this file if the project is not on the VPS / has no
  access to `/opt/autodev-mcp` — the settings.json
  `enabledMcpjsonServers: ["autodev-mcp"]` entry becomes a no-op
  without the `.mcp.json` registration.
- `docker/Dockerfile`, `docker/docker-compose.yml`, `docker/nginx.conf` — only if Phase 4 ran
- `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/healthcheck.sh`
- `scripts/mcp-heartbeat.sh` — called by `notify-cycle.sh` to ping
  autodev-mcp. No-op until `MCP_HTTP_URL` + `MCP_BEARER_TOKEN` are set
  in `.env`.
- `.env.example` (generic slots) — user populates `.env` locally.
  Seed `.env.example` with:
  ```
  # autodev-mcp (optional — only if project is on the VPS)
  MCP_HTTP_URL=http://127.0.0.1:4000
  MCP_BEARER_TOKEN=
  ```

Seed memory files (opt-in prompt): copy `memory-seeds/*` to `~/.claude/memory/`.

## Phase 6 — Roadmap seed

Convert Phase 1 epic/story drafts into structured tasks via `roadmap-expand`.
This writes `roadmap.yml` with auto-generated sequential IDs, runs
`validate.mjs`, re-renders `ROADMAP.md`, and commits on a
`roadmap/initial-seed` branch with a PR (preserves branch-as-payload even
at bootstrap).

## Phase 7 — Cadence configuration

Ask:
- Cron schedule (default: `0 */4 * * *` laptop / `0 * * * *` VPS)
- Success threshold for self-improvement (3–20, default 5)
- Branch prefix (default `auto/`)
- Auto-deploy policy (already captured in Phase 4 if VPS set up)

Register the scheduled task:

```
mcp__scheduled-tasks__create_scheduled_task({
  name: "autonomous-run-{{slug}}",
  prompt: "/autonomous-run",
  cronExpression: "<user's choice>",
  enabled: false      // user flips to true when ready
})
```

## Phase 7.5 — autodev-mcp registration (VPS only, optional)

Only runs if Phase 4 configured a VPS target **and** `/opt/autodev-mcp`
exists on the target host. Skip otherwise — new projects still get the
`.mcp.json` + `settings.json` wiring, but the heartbeat will no-op.

1. Ask: "Register this project with autodev-mcp at `/opt/autodev-mcp`?
   (Enables the dashboard card + cross-project pattern dedup.)" — default yes.
2. If yes, ensure `.env` on the VPS has `MCP_HTTP_URL` + `MCP_BEARER_TOKEN`
   (prompt for the bearer token if absent — same secret as the MCP's
   `BEARER_TOKEN`).
3. Fire a first heartbeat by invoking the `/autodev-sync` skill
   (which wraps `scripts/mcp-heartbeat.sh`). On success, the project
   row is created in the MCP's SQLite store and the dashboard shows
   the new card.
4. Seed initial patterns: for every `Tier 3` bullet in `CLAUDE.md`
   (generated by Phase 1–2 answers), call
   `mcp__autodev-mcp__patterns.registerPattern` so cross-project
   similarity dedup has a starting corpus. Best-effort — if the MCP is
   down, log and move on.

This phase is additive — nothing later depends on its success, so it's
safe to retry by invoking `/autodev-sync` manually after the initial run.

## Phase 8 — First deploy dry-run (VPS only)

If Phase 4 ran:
1. Merge the `roadmap/initial-seed` PR (already open from Phase 6)
2. Trigger `/deploy` manually
3. Run `scripts/healthcheck.sh`
4. Confirm app reachable at configured domain
5. On failure: `scripts/rollback.sh` runs automatically; report what broke

Skip if no VPS.

## Phase 9 — Handoff summary

Print a summary:

```
Setup complete.

Artifacts created:
 - CLAUDE.md                      (project rules)
 - .claude/project.json           (central config)
 - .claude/settings.json          (hooks + permissions)
 - roadmap/roadmap.yml            (3 epics, 12 tasks seeded)
 - ROADMAP.md                     (rendered)
 - .github/workflows/ci.yml
 - docker/*                       (if VPS)
 - scripts/*                      (if VPS)

GitHub: https://github.com/<user>/<slug>
App:    https://<domain>  (if VPS)

Next steps:
 - Add more work:   /pm-brainstorm  → /ux-discovery → /roadmap-expand
 - Run the agent:   mcp__scheduled-tasks__update_scheduled_task({ enabled: true })
                    or invoke /autonomous-run manually
 - Review:          /autonomous-approve  (fires after N=5 successes)

Docs:
 - template/README.md  — setup mirrored as a manual walkthrough
 - docs/RUNBOOK.md     — troubleshooting
 - docs/ARCHITECTURE.md — why the workflow is shaped this way
 - docs/VPS-SETUP.md   — VPS deep-dive (if you deferred Phase 4)
```

## Flags

- `/init-autonomous --phase=<N>` — re-run a specific phase (destroys that
  phase's artifacts and its successors if they depend on it; asks first)
- `/init-autonomous --reset` — wipe `.claude/.setup-progress` and start over
  (does NOT wipe existing artifacts; use carefully)

## Edge cases

- **Existing `CLAUDE.md`:** do not overwrite. Offer a 3-way diff-merge per
  section; user confirms each merge.
- **Existing `roadmap.yml` with tasks:** skip Phase 6 unless user passes
  `--phase=6`. Initial-seed PR becomes a no-op.
- **`gh` unauthenticated:** abort Phase 3 with `gh auth login` instructions.
- **No remote yet in Phase 3:** offer to create a local-only setup (CI
  templates written but not pushed).
- **Phase 4 user says "later":** write `project.json.deploy.target: ""`; the
  `deploy` skill becomes inert. Revisit via `/init-autonomous --phase=4`.
