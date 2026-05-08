#!/usr/bin/env node
// posttool-roadmap-render.mjs — PostToolUse hook on Write|Edit.
//
// When roadmap/roadmap.yml is edited, auto-run `node roadmap/render.mjs`
// and `git add ROADMAP.md` so the rendered markdown stays in sync with
// the YAML source. Prevents the yml/markdown drift that currently relies
// on the skill remembering to run the renderer.
//
// Non-fatal — always exits 0, never blocks the pipeline.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readStdinSync() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

const raw = readStdinSync();
if (!raw) process.exit(0);

let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

const filePath = payload?.tool_input?.file_path || payload?.tool_response?.filePath;
if (!filePath) process.exit(0);

const rel = relative(PROJECT_ROOT, filePath).replaceAll('\\', '/');
if (rel !== 'roadmap/roadmap.yml') process.exit(0);

process.stderr.write('[posttool-roadmap-render] roadmap.yml changed, re-rendering ROADMAP.md\n');

try {
  execSync('node roadmap/render.mjs', {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });
  execSync('git add ROADMAP.md', {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5_000,
  });
  process.stderr.write('[posttool-roadmap-render] ROADMAP.md re-rendered and staged\n');
} catch (err) {
  process.stderr.write(`[posttool-roadmap-render] render failed (non-fatal): ${err.message}\n`);
}

process.exit(0);
