#!/usr/bin/env node
// stop-format-check.mjs — Stop hook.
//
// At session end, run `prettier --check` on modified files in the
// working tree. If any are unformatted, auto-fix with `--write` and
// report the change. Subsumes the Step 8 prettier-first-pass so the
// autonomous cycle never trips `format:check` for mechanical reasons.
//
// Exits 0 always — this is a housekeeping hook, not a gate.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function listDirtyFiles() {
  try {
    const out = execSync('git diff --name-only --diff-filter=AM', {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).toString();
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const PRETTIER_EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css|html)$/;

const dirty = listDirtyFiles().filter((f) => PRETTIER_EXTS.test(f));
if (dirty.length === 0) process.exit(0);

// Skip if prettier isn't installed (non-Node projects).
if (!existsSync(resolve(PROJECT_ROOT, 'node_modules', '.bin', 'prettier'))) {
  process.exit(0);
}

// Check first; only auto-fix if drift detected.
try {
  execSync(`npx prettier --check ${dirty.map((f) => `"${f}"`).join(' ')}`, {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
  // Clean — no action needed.
  process.exit(0);
} catch {
  // Drift detected. Auto-fix.
  process.stderr.write('[stop-format-check] prettier drift detected, auto-fixing\n');
  try {
    execSync(`npx prettier --write ${dirty.map((f) => `"${f}"`).join(' ')}`, {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    process.stderr.write(`[stop-format-check] formatted ${dirty.length} file(s): ${dirty.join(', ')}\n`);
  } catch (err) {
    process.stderr.write(`[stop-format-check] auto-fix failed (non-fatal): ${err.message}\n`);
  }
}

process.exit(0);
