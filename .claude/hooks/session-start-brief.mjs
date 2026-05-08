#!/usr/bin/env node
// session-start-brief.mjs — SessionStart hook.
//
// One-screen status briefing at the start of every Claude Code session:
//   - Next autonomous-cycle timer fire time
//   - Last AGENT-LOG entry (task + outcome + deploy)
//   - Pending review-PR count (gh pr list, non-fatal if gh missing/unauth)
//   - Current branch + dirty-tree indicator
//
// Prints to stdout so Claude Code can surface it as context. Exits 0
// always; briefing failures never block the session.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const slug = basename(PROJECT_ROOT);

function tryExec(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: opts.timeout ?? 3000,
      ...opts,
    }).toString().trim();
  } catch {
    return null;
  }
}

function nextTimerFire() {
  const line = tryExec(
    `systemctl list-timers claude-${slug}.timer --no-pager --no-legend 2>/dev/null`,
  );
  if (!line) return null;
  // Format: <NEXT> <LEFT> <LAST> <PASSED> <UNIT> <ACTIVATES>
  const parts = line.split(/\s{2,}/);
  return parts[0] && parts[1] ? `${parts[0]} (${parts[1]})` : null;
}

function lastAgentLogEntry() {
  const log = resolve(PROJECT_ROOT, 'AGENT-LOG.md');
  if (!existsSync(log)) return null;
  let text;
  try { text = readFileSync(log, 'utf8'); } catch { return null; }
  // Pick the chronologically-latest entry via normalised timestamp compare.
  const blocks = text.split(/^### Run /m).slice(1);
  if (blocks.length === 0) return null;
  let best = null;
  let bestTs = '';
  for (const b of blocks) {
    const m = b.match(/^\[(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?Z?\]/);
    if (!m) continue;
    const ts = `${m[1]} ${m[2]}:${m[3] ?? '00'}`;
    if (ts > bestTs) { bestTs = ts; best = b; }
  }
  if (!best) return null;
  const head = best.split('\n')[0];
  const task = best.match(/^- Task: (.+)$/m)?.[1] ?? '(unknown task)';
  const outcome = best.match(/^- Outcome: (.+)$/m)?.[1] ?? '?';
  const deploy = best.match(/^- Deploy: (\S+)/m)?.[1] ?? 'n/a';
  return `[${head.replace(/^\[|\]$/g, '')}] ${task} — ${outcome}, deploy: ${deploy}`;
}

function pendingReviewPRs() {
  const out = tryExec('gh pr list --search "in:title review:" --state open --json number 2>/dev/null');
  if (!out) return null;
  try {
    const arr = JSON.parse(out);
    return Array.isArray(arr) ? arr.length : null;
  } catch {
    return null;
  }
}

function branchStatus() {
  const branch = tryExec('git branch --show-current 2>/dev/null') || '(detached)';
  const dirty = tryExec('git status --porcelain 2>/dev/null');
  const mark = dirty ? ` [${dirty.split('\n').filter(Boolean).length} dirty]` : '';
  return `${branch}${mark}`;
}

const lines = [`## ${slug} session briefing`];
const next = nextTimerFire();
if (next) lines.push(`- Next cycle: ${next}`);
const last = lastAgentLogEntry();
if (last) lines.push(`- Last cycle: ${last}`);
const reviews = pendingReviewPRs();
if (reviews !== null && reviews > 0) lines.push(`- Pending review PRs: ${reviews}`);
lines.push(`- Branch: ${branchStatus()}`);

process.stdout.write(lines.join('\n') + '\n');
process.exit(0);
