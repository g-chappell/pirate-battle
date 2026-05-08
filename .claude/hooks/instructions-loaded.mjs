#!/usr/bin/env node
// instructions-loaded.mjs — append one line per InstructionsLoaded event
// to .claude/logs/instructions-loaded.log. Observability-only: the hook
// cannot block or modify instruction loading.
//
// Log format: one human-readable line per event, grep-friendly.
//
//   [2026-04-24T06:15:22Z] session_start    CLAUDE.md
//   [2026-04-24T06:15:22Z] nested_traversal src/api/CLAUDE.md ← src/api/routes/users.ts
//
// Wired into .claude/settings.json under `InstructionsLoaded` with no
// matcher so every load reason passes through.

import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..', '..');
const LOG_DIR = resolve(ROOT, '.claude/logs');
const LOG_PATH = resolve(LOG_DIR, 'instructions-loaded.log');

function readStdinSync() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function rel(abs) {
  if (!abs) return '';
  try {
    const r = relative(ROOT, abs);
    return r.startsWith('..') ? abs : r;
  } catch {
    return abs;
  }
}

const raw = readStdinSync();
if (!raw) process.exit(0);

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const reason = (payload.load_reason ?? 'unknown').padEnd(16, ' ');
const file = rel(payload.file_path);
const trigger = rel(payload.trigger_file_path);
const parent = rel(payload.parent_file_path);
const globs = Array.isArray(payload.globs) ? payload.globs.join(', ') : '';

const pieces = [`[${ts}]`, reason, file];
if (trigger) pieces.push(`← ${trigger}`);
else if (parent) pieces.push(`⊂ ${parent}`);
if (globs) pieces.push(`[globs: ${globs}]`);

const line = pieces.join(' ') + '\n';

try {
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_PATH, line);
} catch {
  // Best-effort — observability must never break the session.
}
process.exit(0);
