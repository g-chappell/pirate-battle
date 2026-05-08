#!/usr/bin/env node
// post-edit.mjs — single PostToolUse hook dispatcher
//
// Replaces the 4+ inline Node one-liners seen in earlier projects. Reads the
// tool-use payload from stdin, decides which typecheck/test commands to run
// based on the edited file's extension and its workspace, then runs them.
//
// Wired into .claude/settings.json as:
//   { "matcher": "Write|Edit", "hooks": [{ "type": "command",
//     "command": "node .claude/hooks/post-edit.mjs" }] }
//
// Never aborts on error — prints diagnostics, exits 0 so subsequent tools fire.

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { langOf, DEFAULT_COMMANDS } from './lang-matchers.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SELF_DIR, '..', '..');
const CONFIG_PATH = resolve(PROJECT_ROOT, '.claude', 'project.json');

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    console.error(`[post-edit] cannot parse project.json: ${err.message}`);
    return null;
  }
}

function readStdinJSON() {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(buf)); }
      catch { resolve(null); }
    });
    setTimeout(() => resolve(null), 500);
  });
}

function workspaceFor(filePath, workspaces) {
  if (!Array.isArray(workspaces)) return null;
  const rel = relative(PROJECT_ROOT, filePath).replaceAll('\\', '/');
  for (const ws of workspaces) {
    const p = (ws.path || ws.name || '').replaceAll('\\', '/');
    if (p && (rel === p || rel.startsWith(p + '/'))) return ws;
  }
  return null;
}

function run(label, cmd, cwd) {
  if (!cmd) return;
  // Skip unresolved template placeholders — starter hasn't been initialised yet.
  if (typeof cmd === 'string' && cmd.includes('{{') && cmd.includes('}}')) return;
  process.stderr.write(`[post-edit] ${label}: ${cmd}\n`);
  try {
    const out = execSync(cmd, {
      cwd: cwd || PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    const tail = out.toString().split(/\r?\n/).slice(-20).join('\n');
    if (tail.trim()) process.stderr.write(tail + '\n');
  } catch (err) {
    const tail = (err.stdout?.toString() || '' + err.stderr?.toString() || '')
      .split(/\r?\n/).slice(-20).join('\n');
    process.stderr.write(`[post-edit] ${label} FAILED\n${tail}\n`);
  }
}

async function main() {
  const config = loadConfig();
  if (!config) {
    // No project.json yet — starter not initialised. Be silent.
    return;
  }

  const payload = await readStdinJSON();
  const filePath = payload?.tool_input?.file_path || payload?.tool_response?.filePath;
  if (!filePath) return;

  const lang = langOf(filePath);
  if (!lang) return;

  const ws = workspaceFor(filePath, config.workspaces);
  const cwd = ws?.path ? resolve(PROJECT_ROOT, ws.path) : PROJECT_ROOT;

  // Commands: workspace-level > project-level > lang default
  const wsCmds = ws?.commands || {};
  const projCmds = config.commands || {};
  const defaults = DEFAULT_COMMANDS[lang] || {};

  const typecheck = wsCmds.typecheck ?? projCmds.typecheck ?? defaults.typecheck;
  const test = wsCmds.test ?? projCmds.test ?? defaults.test;

  run('typecheck', typecheck, cwd);
  run('test', test, cwd);
}

main().catch((err) => {
  process.stderr.write(`[post-edit] fatal: ${err.message}\n`);
});
