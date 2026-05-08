#!/usr/bin/env node
// userprompt-cycle-guard.mjs — UserPromptSubmit hook.
//
// Injects a one-line warning before the user's turn when the autonomous
// cycle is active. Catches exactly the deploy-vs-cycle collision hazard
// (manual `scripts/deploy.sh` while an autonomous-run is mid-edit).
//
// ⚠ Self-collision avoidance: the hook fires inside EVERY Claude Code
// session, including the one spawned by the systemd autonomous cycle
// itself. If we warn unconditionally, the cycle sees "a cycle is
// running" (itself!), asks the human how to proceed, gets no reply,
// and bails out without doing work. Guards:
//
//   1. Env var `AUTODEV_AUTONOMOUS_CYCLE=1` — set by the systemd unit;
//      if present, skip entirely. Belt.
//   2. The user prompt itself begins with `/autonomous-run` or
//      `/autonomous-review` — that's the cycle's own entry prompt, so
//      warning is not just redundant, it's actively destructive. Suspenders.
//
// Exits 0 always; the warning is printed to stdout so Claude Code can
// prepend it to the conversation as a system reminder.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

// Belt: cycle's systemd unit sets this env var.
if (process.env.AUTODEV_AUTONOMOUS_CYCLE === '1') process.exit(0);

// Suspenders: if the user's prompt is itself the cycle entry-point,
// skip. Read stdin JSON — UserPromptSubmit payload includes `prompt`.
try {
  const raw = readFileSync(0, 'utf8');
  if (raw) {
    const payload = JSON.parse(raw);
    const prompt = (payload?.prompt || payload?.user_prompt || '').trim();
    if (
      /^\/(autonomous-run|autonomous-review|autonomous-approve)\b/.test(prompt)
    ) {
      process.exit(0);
    }
  }
} catch {
  // Bad stdin — carry on with the probe; better to warn spuriously in a
  // non-cycle session than to silently skip a real cycle collision.
}

const slug = basename(process.cwd());
const unit = `claude-${slug}.service`;

let state = '';
try {
  state = execSync(`systemctl show ${unit} -p ActiveState --value 2>/dev/null`, {
    timeout: 2000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  process.exit(0);
}

if (state === 'activating' || state === 'active') {
  const msg =
    `⚠ Autonomous cycle (${unit}) is currently ${state}. ` +
    `Destructive commands (scripts/deploy.sh, git reset, branch switches) ` +
    `may collide with in-flight edits. Consider 'systemctl stop claude-${slug}.timer' ` +
    `before proceeding.`;
  process.stdout.write(msg + '\n');
}

process.exit(0);
