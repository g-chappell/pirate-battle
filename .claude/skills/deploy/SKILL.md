---
name: deploy
description: Build + deploy the app via docker compose, then run a health check, rolling back to the previous image if health fails. Reads deploy config from .claude/project.json. Inert if deploy.target is empty.
user-invocable: true
---

# /deploy

Deploy the current code to the configured target. Uses `scripts/deploy.sh`
which reads `.claude/project.json.deploy`.

## When to use

- Invoked automatically by `/autonomous-run` Step 11 when a PR merges and
  `deploy.autoDeployOnMerge: true`
- Manually by the user for a first deploy or an emergency redeploy

## Steps

1. **Sanity check config:**
   - Read `.claude/project.json.deploy`
   - If `target` is empty: print "deploy not configured — run /init-autonomous --phase=4" and stop
   - If `method` isn't `docker`: print "only docker method implemented; edit scripts/deploy.sh" and stop

2. **Pre-flight:**
   - `git status --porcelain` — must be clean
   - `git pull origin main` — deploy from latest main
   - Verify `.env` exists on the host (not `.env.example`)

3. **Invoke deploy script:**
   ```bash
   bash scripts/deploy.sh
   ```

4. **Interpret exit code:**
   - 0: success → update AGENT-LOG with `deploy: success`, print app URL
   - 1: build failed → report build error; no rollback needed (nothing deployed)
   - 2: container failed to start → check `docker compose logs`
   - 3: health failed AND rollback failed → **CRITICAL** — alert user, app broken
   - 4: health failed, rollback succeeded → app running on previous image;
        mark the triggering task `blocked` with `blocked_reason: "deploy failed health check"`

5. **Log outcome in AGENT-LOG** (if called from `/autonomous-run`):
   ```
   - Deploy: success | failed | rolled_back
   - Deploy details: <exit code, duration, URL verified>
   ```

## Failure isolation

If deploy fails and rolls back (exit 4), this does NOT cascade — other tasks
in the roadmap remain pickupable. Only the task that triggered the bad
deploy is blocked, so the agent can continue on other work.

## Manual recovery

If exit code 3 (rollback failed):

```bash
# ssh to the VPS
sudo systemctl status claude-<slug>    # check CC agent status
cd /opt/<slug>
docker compose -f docker/docker-compose.yml logs --tail=200 app
# if needed, pull the image manually and restart:
docker image ls | grep <slug>
docker tag <slug>:<good-tag> <slug>:latest
docker compose -f docker/docker-compose.yml up -d --force-recreate app
```

Then investigate why the automated rollback failed (image corrupted?
docker daemon unhealthy?) and fix underlying cause.

## Not this skill's job

- Building the Docker image separately → just runs the deploy.sh flow
- Managing secrets / `.env` — that's `/vps-setup` and operator responsibility
- Running tests — `/autonomous-run` already did local validation before
  the PR merged
