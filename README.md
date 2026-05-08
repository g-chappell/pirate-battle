# Autonomous Dev — New Project Setup

This project uses an autonomous dev workflow. **Two ways to set up, same result:**

- **Wizard (recommended):** open in Claude Code and run `/init-autonomous`
- **Manual (this document):** follow the 9 phases below

---

## Prerequisites

- Node 20+ (`node --version`)
- `gh` CLI authenticated (`gh auth status`)
- git installed
- GitHub account with repo-creation rights
- (For auto-deploy) a Linux VPS with SSH + sudo + Docker
- (Optional) Claude Code CLI for running skills

---

## Phase 0 — Environment check

```bash
node --version          # ≥ 20
gh auth status          # logged in
git --version           # ≥ 2
docker --version        # for auto-deploy
ssh -V                  # for VPS deploy
```

Abort with install instructions if anything required is missing. GitHub CLI:
`winget install GitHub.cli` (Windows) / `brew install gh` (Mac) /
`sudo apt install gh` (Linux).

---

## Phase 1 — Product discovery

Answer these (or let `/pm-brainstorm` ask):

- **One-sentence pitch** — who, what, why
- **Primary user** + their job-to-be-done
- **Why now?** What triggered this project?
- **MVP success signal** — how will we know it works?
- **3–5 initial epics** (each with 2–4 stories)
- **2–3 non-goals** — explicit out-of-scope

Record in `~/.claude/memory/project_<slug>_vision.md`.

---

## Phase 2 — Tech stack

Either confirm what's detected in an existing repo, or pick from 3 options:

1. **Web app:** TypeScript + React + Postgres
2. **API / service:** Python + FastAPI + Postgres
3. **CLI tool:** Go or Rust

Record in `.claude/project.json`:

```json
{
  "language": "typescript",
  "workspaces": [
    { "name": "client", "path": "client", "commands": {"test": "npm test --workspace=client"} }
  ],
  "commands": {
    "typecheck": "npx tsc -b",
    "test": "npm test",
    "lint": "npx eslint .",
    "build": "npm run build",
    "dev": "npm run dev"
  }
}
```

Create `~/.claude/memory/techstack_<name>.md` per major technology (reused
across future projects).

---

## Phase 3 — GitHub setup

```bash
gh repo create my-project --private --source=. --remote=origin
git add . && git commit -m "initial commit: autonomous starter"
git push -u origin main
bash .github/branch-protection.sh    # requires ci check + enables auto-merge
```

Verify: https://github.com/\<you\>/\<project\>/settings/branches

---

## Phase 4 — VPS setup (optional, skip if laptop-only)

On the VPS (sudo):

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx gh
git clone <repo-url> /opt/my-project
cd /opt/my-project
```

Then open Claude Code on the VPS and run:

```
/vps-setup
```

This installs missing deps, authenticates `gh`, writes the systemd service for
Claude Code, writes the nginx reverse-proxy config, and prompts for `.env`
secrets. Finally:

```bash
sudo systemctl enable --now claude-my-project
sudo systemctl status claude-my-project    # confirm running
```

---

## Phase 5 — Workspace scaffolding

The wizard writes these automatically. For manual setup, rename template
files:

```bash
mv .claude/settings.json.tmpl .claude/settings.json
mv .claude/launch.json.tmpl .claude/launch.json
mv CLAUDE.md.tmpl CLAUDE.md
```

Then fill `{{placeholders}}` in `CLAUDE.md` and `.claude/project.json`.

Populate `.env` from `.env.example` (local only; gitignored).

---

## Phase 6 — Roadmap seed

Either:
- Hand your Phase 1 epics to `/roadmap-expand`, OR
- Edit `roadmap/roadmap.yml` directly, then:

```bash
node roadmap/validate.mjs          # schema + referential integrity
node roadmap/render.mjs            # regenerates ROADMAP.md
```

Open `roadmap/viewer/index.html` to see the visual tree (or serve with
`python3 -m http.server 8000 -d roadmap/viewer`).

Commit on a `roadmap/initial-seed` branch, open a PR, merge.

---

## Phase 7 — Cadence configuration

Edit `.claude/project.json`:

```json
{
  "schedule": { "cron": "0 * * * *", "enabled": false },
  "successThreshold": 5,
  "branchPrefix": "auto/"
}
```

Register the scheduled task (from Claude Code):

```
/schedule
```

Default cadence: hourly on VPS, every 4h on laptop. Flip `enabled: true`
when you're ready for the agent to start picking up tasks.

---

## Phase 8 — First deploy (VPS only)

```bash
# manual trigger
/deploy
# or let the scheduled agent pick it up
```

Verify:

```bash
bash scripts/healthcheck.sh
curl -f https://<your-domain>/health
```

---

## Phase 9 — Verify end-to-end

```bash
node roadmap/validate.mjs                         # roadmap is valid
node roadmap/render.mjs                           # ROADMAP.md regenerates
python3 -m http.server 8000 -d roadmap/viewer &   # viewer loads
ls .claude/approvals/                             # history.md + .gitkeep
cat AGENT-LOG.md                                  # header visible
```

---

## What you get

| Artifact | Purpose |
| --- | --- |
| `CLAUDE.md` | project rules (universal + project + tech-coupled) |
| `roadmap/roadmap.yml` + `ROADMAP.md` | task backlog, rendered |
| `roadmap/viewer/index.html` | visual tree |
| `.claude/project.json` | central config (paths, commands, schedule) |
| `.claude/settings.json` | hooks + permissions |
| `.claude/skills/` | setup wizard, roadmap-building, autonomous-run, review/approve, deploy |
| `.claude/hooks/post-edit.mjs` | typecheck + test dispatcher on every Write/Edit |
| `.claude/approvals/` | self-improvement approval gate + history |
| `.github/workflows/ci.yml` | typecheck + lint + test + build |
| `.github/branch-protection.sh` | enforces ci check + auto-merge |
| `docker/*` | Dockerfile, compose, nginx (if VPS) |
| `scripts/*` | deploy, rollback, healthcheck |
| `AGENT-LOG.md`, `REVIEW-LOG.md` | audit trail |

---

## Next steps

- **Add work:** `/pm-brainstorm` → `/ux-discovery` → `/roadmap-expand`
- **Run the agent:** enable the scheduled task in `.claude/project.json`,
  or invoke `/autonomous-run` manually
- **Every 5 successes:** agent proposes CLAUDE.md refinements;
  review via `/autonomous-approve`

---

## Troubleshooting

### `gh` not found
Windows: `winget install GitHub.cli`. Mac: `brew install gh`. Linux: `sudo apt install gh`.

### Wizard writes garbage for my stack
Re-run a specific phase: `/init-autonomous --phase=2`.
Or wipe progress and restart: `/init-autonomous --reset`.

### Branch protection script fails
Ensure remote exists: `git remote -v`. Ensure you own the repo.

### Hooks not firing on edit
Verify `.claude/settings.json` exists (not `.tmpl`). Run
`node .claude/hooks/post-edit.mjs` standalone to see errors. Check
`project.json.language` matches a key in `lang-matchers.mjs`.

### Scheduled task never fires (VPS)
```bash
sudo systemctl status claude-<project>
sudo journalctl -u claude-<project> -f
sudo systemctl restart claude-<project>   # if dead
```

### Deploy fails health check
`scripts/rollback.sh` runs automatically and restores the previous image.
See `docs/RUNBOOK.md` → "Deploy rollback" for manual recovery.

### App not reachable at domain
Check nginx: `sudo nginx -t && sudo systemctl status nginx`. Verify DNS:
`dig <your-domain>`. Verify firewall: `sudo ufw status`.

### Roadmap validation fails
Read the error — validate.mjs prints the exact offending path.
Common causes: duplicate task IDs, broken `depends_on` references, or a
done task that depends on a non-done task (status integrity rule).
