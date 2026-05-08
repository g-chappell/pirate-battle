---
name: vps-setup
description: One-time VPS bootstrap. Installs Docker + nginx + gh CLI, authenticates gh, writes systemd unit for Claude Code agent, writes nginx reverse-proxy config, prompts for .env secrets. Run ONCE on the VPS per project. Not for local dev machines.
user-invocable: true
disable-model-invocation: true
---

# /vps-setup

One-time bootstrap on the VPS. Converts a bare Ubuntu/Debian host into a
working autonomous-dev VPS with the project's app and CC agent both running
under systemd.

**Not idempotent for destructive ops** — always reviews before `apt install`
or overwriting `/etc/nginx/*`. But fully safe to re-run: re-detects what's
already installed and skips.

## Prerequisites

- Ubuntu 22+ or Debian 12+
- User with sudo
- Current directory is the cloned project repo at `/opt/<slug>/`
- `.claude/project.json` already filled by `/init-autonomous` Phase 2 (at
  least `project.slug`, `project.name`, `deploy.*`, `host.serviceName`)

## Phases

### 1. Detect + confirm

Run:
```bash
lsb_release -a                       # Ubuntu/Debian?
whoami                                # current user
groups | grep -E "sudo|docker"        # sudo + docker groups
which docker nginx gh node            # which tools already installed
systemctl --version                   # systemd?
```

Print findings, ask user to confirm before any install.

### 2. Install missing dependencies

For each missing tool, prompt before installing:

```bash
# Docker (official)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# (logout + login required to pick up group; tell user)

# nginx
sudo apt update && sudo apt install -y nginx

# gh CLI
# Follow https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Node 20 (for roadmap scripts + CC agent)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. gh auth

```bash
gh auth login
```

Prompt user to follow the interactive flow; verify with `gh auth status`.

### 4. Environment variables (.env)

If `.env` doesn't exist, copy from `.env.example` and prompt the user for
each required secret one at a time. Never log the values. Write to `.env`
with mode 0600.

Required at minimum:
- `ANTHROPIC_API_KEY` — for the autonomous agent
- Any DB credentials, app secrets the user has from `.env.example`

Auto-generate if blank in `.env.example` (do not prompt — random is strictly
better than a human-chosen string for these):

- `NTFY_TOPIC` — per-project push-notification topic. Public-by-URL, so
  the randomness is the only secret. Generate with:

  ```bash
  echo "NTFY_TOPIC={{slug}}-agent-$(openssl rand -hex 8)" >> .env
  ```

  Collision-proof across projects (the slug prefix disambiguates) and
  unguessable (the 16-hex-char suffix).

### 5. Systemd units for Claude Code

Two units per project. Both are slug-namespaced so multiple autonomous-dev
projects can coexist on one VPS without collision.

#### 5a. `claude-{{slug}}.service` — scheduled dev-cycle oneshot

Write `/etc/systemd/system/claude-{{slug}}.service`:

```ini
[Unit]
Description=Claude Code autonomous agent for {{project_name}}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={{os_user}}
WorkingDirectory=/opt/{{slug}}
EnvironmentFile=/opt/{{slug}}/.env
# Marker for .claude/hooks/userprompt-cycle-guard.mjs so the hook skips
# itself when the session is the autonomous cycle (prevents the cycle
# from warning about itself + bailing out on its own /autonomous-run).
Environment=AUTODEV_AUTONOMOUS_CYCLE=1
# The actual CC CLI command; adjust for your CC install location:
ExecStart=/usr/local/bin/claude-code --scheduled
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### 5b. `claude-rc-{{slug}}.service` — persistent Remote Control server

Copy `systemd/claude-rc.service.tmpl` from the project scaffold to
`/etc/systemd/system/claude-rc-{{slug}}.service`, substituting `{{slug}}`.
This gives the mobile Claude app a per-project entry named
`{{slug}}-vps`. The unit includes:

- `--name {{slug}}-vps` — the session-name prefix the mobile app shows.
  One per project keeps sessions distinguishable and prevents two
  daemons from registering under the same relay key.
- `Restart=always` + `RuntimeMaxSec=21600` — periodic recycle every 6 h
  to avoid relay-registration drift (observed: long-lived RC daemons
  become unreachable from mobile after ~11 h; forced recycle fixes it).
- `KillSignal=SIGINT` + `TimeoutStopSec=10` — graceful disconnect on
  stop so stale session entries don't accumulate in the mobile app.

#### 5c. Reload + enable

```bash
sudo systemctl daemon-reload
sudo systemctl enable claude-{{slug}}.service
sudo systemctl enable --now claude-rc-{{slug}}.service
# Don't start claude-{{slug}}.service yet — user should flip
# schedule.enabled in project.json first. RC can start immediately so
# the mobile app can pair.
```

#### 5d. autodev-mcp group enrollment (if MCP HTTP is provisioned)

If `autodev-mcp-http.service` is running on this VPS, add the project's
service user to the `autodev-mcp` group so the per-cycle stdio MCP
subprocess can write to the shared SQLite at `/opt/autodev-mcp/var/`:

```bash
if id autodev-mcp >/dev/null 2>&1; then
  sudo usermod -a -G autodev-mcp {{os_user}}
  # Group membership is picked up on next login / next service start —
  # claude-{{slug}}.service hasn't been started yet, so no further action.
fi
```

Without this the cycle still completes locally (Step 5 / Step 10 mirrors
are best-effort) but emits "MCP mirror failed (readonly DB)" in the
journal and rows never reach the dashboard. Skip this phase if the VPS
doesn't yet host autodev-mcp; add the user later when the MCP server is
provisioned.

### 6. nginx reverse proxy

Copy `docker/nginx.conf` to `/etc/nginx/sites-available/{{slug}}.conf` and
link:

```bash
sudo cp docker/nginx.conf /etc/nginx/sites-available/{{slug}}.conf
sudo ln -sf /etc/nginx/sites-available/{{slug}}.conf \
           /etc/nginx/sites-enabled/{{slug}}.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 7. TLS (optional)

Prompt: "Enable HTTPS via Let's Encrypt now? [Y/n]"

If yes:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d {{app_domain}}
```

### 8. First deploy verification

```bash
bash scripts/deploy.sh          # build + up + health check
bash scripts/healthcheck.sh     # independent verification
```

If health check passes: done. Print next steps:

```
VPS setup complete.

Next:
  1. Flip schedule.enabled to true in .claude/project.json
     (or via: mcp__scheduled-tasks__update_scheduled_task)
  2. sudo systemctl start claude-{{slug}}
  3. Watch: sudo journalctl -u claude-{{slug}} -f

Troubleshooting:
  - App logs:     docker compose -f docker/docker-compose.yml logs -f app
  - nginx logs:   sudo tail -f /var/log/nginx/error.log
  - CC agent:     sudo journalctl -u claude-{{slug}} -n 100
```

## Failure modes

- **User not in `docker` group:** installer adds them, but group membership
  only takes effect on new login. Tell the user to `exit` and SSH back in.
- **systemd not available:** e.g. Alpine, some container hosts. Fall back
  to writing a `/root/claude-{{slug}}.sh` loop script and suggest running
  it in `tmux` — but warn about lack of auto-restart.
- **SELinux enforcing on RHEL-family:** not covered; refer to
  `docs/VPS-SETUP.md` troubleshooting.
- **nginx conflict with existing site:** detect if `/etc/nginx/sites-enabled/default`
  exists; offer to disable it.
- **Firewall blocking:** check `ufw status`; offer `sudo ufw allow 80,443/tcp`.
