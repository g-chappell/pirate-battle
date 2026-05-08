#!/usr/bin/env node
// ci-fix-recover.mjs — extract /autonomous-run Step 4's "3-attempt CI
// auto-recovery" prose into a deterministic script.
//
// For each open PR whose `ci` check is failing, spawn a scoped Claude
// subprocess with a focused prompt ("read the failing-job log, apply the
// minimal fix named in the error, push"). Retry up to 3 attempts per PR.
// Skip PRs that are not auto-fixable (CI infra errors, auth issues).
//
// Usage:
//   node scripts/ci-fix-recover.mjs [--max-prs N] [--max-attempts N] [--dry-run]
//
// Stdout: JSON summary
//   { attempted: [{pr, branch, attempts, recovered, reason}], skipped: [...] }
//
// Exit codes:
//   0  zero failing PRs OR all recovered
//   1  at least one PR still failing after all attempts
//   2  infra error (gh auth missing, claude CLI missing, no .claude/project.json)

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const PROJECT_JSON = resolve(ROOT, '.claude/project.json');

const FIX_TOOLS = 'Bash(npm *),Bash(node *),Bash(git *),Bash(ls *),Edit,Read,Grep,Glob';

function parseArgs(argv) {
  const out = { maxPrs: 5, maxAttempts: 3, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max-prs') out.maxPrs = Number(argv[++i]);
    else if (a === '--max-attempts') out.maxAttempts = Number(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!Number.isFinite(out.maxPrs) || out.maxPrs < 1) throw new Error('--max-prs must be >= 1');
  if (!Number.isFinite(out.maxAttempts) || out.maxAttempts < 1)
    throw new Error('--max-attempts must be >= 1');
  return out;
}

function infraFail(msg) {
  process.stderr.write(`ci-fix-recover: ${msg}\n`);
  process.exit(2);
}

function which(binary) {
  try {
    execSync(`command -v ${binary}`, { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function loadConfig() {
  if (!existsSync(PROJECT_JSON)) infraFail(`${PROJECT_JSON} missing`);
  try {
    return JSON.parse(readFileSync(PROJECT_JSON, 'utf8'));
  } catch (err) {
    infraFail(`project.json parse error: ${err.message}`);
  }
}

function listFailingPrs() {
  const raw = execSync(
    'gh pr list --state open --json number,headRefName,title,statusCheckRollup --limit 20',
    { cwd: ROOT, encoding: 'utf8' },
  );
  const prs = JSON.parse(raw);
  const failing = [];
  for (const pr of prs) {
    const checks = pr.statusCheckRollup ?? [];
    const ci = checks.find((c) => c.name === 'ci') ?? checks[0];
    if (!ci) continue;
    const failed = ci.conclusion === 'FAILURE' || ci.conclusion === 'TIMED_OUT';
    if (failed)
      failing.push({
        pr: pr.number,
        branch: pr.headRefName,
        title: pr.title,
        checkRunId: ci.detailsUrl,
      });
  }
  return failing;
}

function fetchFailedLog(prNumber) {
  try {
    const runInfo = execSync(
      `gh pr checks ${prNumber} --json name,link --jq '.[] | select(.name=="ci") | .link'`,
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
    if (!runInfo) return '';
    const runId = runInfo.match(/runs\/(\d+)/)?.[1];
    if (!runId) return '';
    return execSync(`gh run view ${runId} --log-failed`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    })
      .split('\n')
      .slice(-200)
      .join('\n');
  } catch {
    return '';
  }
}

function runLocalValidation(config) {
  const cmds = config.commands ?? {};
  const order = ['typecheck', 'lint', 'test'];
  for (const k of order) {
    const cmd = cmds[k];
    if (!cmd) continue;
    try {
      execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return { ok: false, step: k, detail: err.stderr?.toString()?.slice(-500) ?? err.message };
    }
  }
  return { ok: true };
}

function invokeClaudeFix(pr, log, config) {
  const prompt = [
    `CI is failing on PR #${pr.pr} (branch: ${pr.branch}). Apply the minimum`,
    'fix to make CI pass. Do NOT refactor or change unrelated code.',
    '',
    `Failing-job log (tail):`,
    '```',
    log || '(log not retrievable — read gh run view manually if needed)',
    '```',
    '',
    'Steps:',
    '1. Check out the branch (git fetch origin && git checkout <branch>).',
    '2. Read the error, find the specific file(s) named.',
    '3. Apply the smallest possible fix.',
    `4. Run: ${config.commands?.typecheck ?? 'npm run typecheck'}, ${config.commands?.lint ?? 'npm run lint'}, ${config.commands?.test ?? 'npm test'}.`,
    '5. If all pass: git add + commit "fix: CI recovery — <brief>" + push.',
    '6. If you cannot fix with the allowed tools, print REASON: <why> and exit without committing.',
  ].join('\n');
  const args = ['--dangerously-skip-permissions', '--allowed-tools', FIX_TOOLS, '-p', prompt];
  const result = spawnSync('claude', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
  });
  return {
    exit: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.signal === 'SIGTERM' && result.error?.code === 'ETIMEDOUT',
  };
}

function gitSwitch(branch) {
  try {
    execSync('git fetch origin --prune', { cwd: ROOT, stdio: 'ignore' });
    execSync(`git checkout ${branch}`, { cwd: ROOT, stdio: 'ignore' });
    execSync(`git reset --hard origin/${branch}`, { cwd: ROOT, stdio: 'ignore' });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

function gitBackToMain() {
  try {
    execSync('git checkout main', { cwd: ROOT, stdio: 'ignore' });
    execSync('git reset --hard origin/main', { cwd: ROOT, stdio: 'ignore' });
  } catch {
    /* best-effort */
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!which('gh')) infraFail('gh CLI not on PATH');
  if (!which('claude')) infraFail('claude CLI not on PATH');
  const config = loadConfig();

  const failing = listFailingPrs().slice(0, args.maxPrs);
  if (failing.length === 0) {
    process.stdout.write(JSON.stringify({ attempted: [], skipped: [] }) + '\n');
    process.exit(0);
  }

  if (args.dryRun) {
    process.stdout.write(
      JSON.stringify({
        attempted: [],
        skipped: failing.map((f) => ({ ...f, reason: 'dry-run' })),
      }) + '\n',
    );
    process.exit(0);
  }

  const attempted = [];
  for (const pr of failing) {
    const sw = gitSwitch(pr.branch);
    if (!sw.ok) {
      attempted.push({
        ...pr,
        attempts: 0,
        recovered: false,
        reason: `checkout-failed: ${sw.detail}`,
      });
      continue;
    }
    let recovered = false;
    let attempts = 0;
    let reason = '';
    for (attempts = 1; attempts <= args.maxAttempts; attempts++) {
      const log = fetchFailedLog(pr.pr);
      const res = invokeClaudeFix(pr, log, config);
      if (res.timedOut) {
        reason = `attempt-${attempts}-timeout`;
        continue;
      }
      if (res.exit !== 0) {
        reason = `attempt-${attempts}-claude-exit-${res.exit}`;
        continue;
      }
      const val = runLocalValidation(config);
      if (val.ok) {
        try {
          execSync(`git push origin ${pr.branch}`, { cwd: ROOT, stdio: 'ignore' });
          recovered = true;
          reason = `recovered-attempt-${attempts}`;
        } catch (err) {
          reason = `attempt-${attempts}-push-failed: ${err.message.slice(0, 120)}`;
        }
        break;
      } else {
        reason = `attempt-${attempts}-validation-failed-${val.step}`;
      }
    }
    attempted.push({ pr: pr.pr, branch: pr.branch, attempts, recovered, reason });
    gitBackToMain();
  }

  process.stdout.write(JSON.stringify({ attempted, skipped: [] }) + '\n');
  const allRecovered = attempted.every((a) => a.recovered);
  process.exit(allRecovered ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`ci-fix-recover: unexpected: ${err.stack ?? err.message}\n`);
  process.exit(2);
});
