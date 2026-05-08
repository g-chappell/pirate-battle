#!/usr/bin/env node
// roadmap-update-task.mjs — surgically mutate roadmap/roadmap.yml fields
// for one task, preserving the rest of the file byte-for-byte.
//
// Why line-based: the in-repo yaml-lite has no serialiser, and round-
// tripping through a full YAML library would reformat the whole file.
// The cycle already uses Edit-style targeted changes; this script is the
// deterministic extraction.
//
// Usage:
//   node scripts/roadmap-update-task.mjs <TASK-ID> [flags]
//
// Flags:
//   --status <value>            set status field
//   --increment-attempt-count   attempt_count += 1
//   --last-attempted-now        last_attempted = current UTC ISO
//   --pr <URL>                  set pr field
//   --completed-now             completed = current UTC ISO
//   --print-title               do not mutate; print the task's title
//   --dry-run                   do not write; print the new file to stdout
//
// Exit codes:
//   0  task found and mutated (or printed for --print-title)
//   1  task id not present in roadmap
//   2  bad arguments / io error

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SELF_DIR, '..');
const YML = resolve(ROOT, 'roadmap/roadmap.yml');

export function parseArgs(argv) {
  const args = { taskId: null, mutations: {}, flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!args.taskId && !a.startsWith('-')) {
      args.taskId = a;
      continue;
    }
    switch (a) {
      case '--status':
        args.mutations.status = argv[++i];
        break;
      case '--increment-attempt-count':
        args.flags.incAttempt = true;
        break;
      case '--last-attempted-now':
        args.flags.stampLastAttempted = true;
        break;
      case '--pr':
        args.mutations.pr = argv[++i];
        break;
      case '--completed-now':
        args.flags.stampCompleted = true;
        break;
      case '--print-title':
        args.flags.printTitle = true;
        break;
      case '--dry-run':
        args.flags.dryRun = true;
        break;
      default:
        throw new Error(`unknown arg: ${a}`);
    }
  }
  if (!args.taskId) throw new Error('task id required as first positional arg');
  return args;
}

// Return [startIdx, endIdx) of the task block whose `- id: TASK-XXX` line
// matches `taskId`. The block ends at the next line whose indent ≤ the
// `- id:` line's indent and is non-blank.
export function findTaskBlock(lines, taskId) {
  const idRe = new RegExp(`^(\\s*)-\\s+id:\\s+${taskId}\\b`);
  let start = -1;
  let baseIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(idRe);
    if (m) {
      start = i;
      baseIndent = m[1].length;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = line.match(/^( *)/)[1].length;
    if (indent <= baseIndent) {
      end = i;
      break;
    }
  }
  return { start, end, baseIndent };
}

// Inside [start, end), find the first line that matches `<keyIndent>key:`
// where keyIndent = baseIndent + 2 (child of the `- id:` entry).
function findKeyLine(lines, { start, end, baseIndent }, key) {
  const childIndent = baseIndent + 2;
  const re = new RegExp(`^ {${childIndent}}${key}\\s*:\\s*(.*)$`);
  for (let i = start; i < end; i++) {
    const m = lines[i].match(re);
    if (m) return { idx: i, value: m[1], indent: childIndent };
  }
  return null;
}

function formatYamlString(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  const s = String(value);
  // Unquoted only for simple alphanumeric tokens and URL-ish values that
  // start with a letter. ISO timestamps (start with a digit) get quoted to
  // match existing roadmap.yml style.
  if (/^[A-Za-z][\w.:/@+=-]*$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}

function setKey(lines, block, key, value) {
  const hit = findKeyLine(lines, block, key);
  if (!hit) {
    throw new Error(`key "${key}" not found in task block starting at line ${block.start + 1}`);
  }
  lines[hit.idx] = `${' '.repeat(hit.indent)}${key}: ${formatYamlString(value)}`;
}

function bumpAttemptCount(lines, block) {
  const hit = findKeyLine(lines, block, 'attempt_count');
  if (!hit) throw new Error('attempt_count not found in task block');
  const n = Number(hit.value.trim());
  if (!Number.isFinite(n)) {
    throw new Error(`attempt_count not a number: "${hit.value}"`);
  }
  lines[hit.idx] = `${' '.repeat(hit.indent)}attempt_count: ${n + 1}`;
}

function nowIsoMinute() {
  return new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:\d{2}Z$/, ':00Z');
}

export function applyMutations(text, taskId, { mutations, flags }) {
  const lines = text.split('\n');
  const block = findTaskBlock(lines, taskId);
  if (!block) return { ok: false, reason: 'task-not-found' };

  if (flags.printTitle) {
    const hit = findKeyLine(lines, block, 'title');
    return { ok: true, title: hit?.value?.trim() ?? '' };
  }

  if ('status' in mutations) setKey(lines, block, 'status', mutations.status);
  if ('pr' in mutations) setKey(lines, block, 'pr', mutations.pr);
  if (flags.incAttempt) bumpAttemptCount(lines, block);
  if (flags.stampLastAttempted) setKey(lines, block, 'last_attempted', nowIsoMinute());
  if (flags.stampCompleted) setKey(lines, block, 'completed', nowIsoMinute());

  return { ok: true, text: lines.join('\n') };
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`roadmap-update-task: ${err.message}\n`);
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(YML, 'utf8');
  } catch (err) {
    process.stderr.write(`roadmap-update-task: cannot read ${YML}: ${err.message}\n`);
    process.exit(2);
  }
  const result = applyMutations(text, args.taskId, args);
  if (!result.ok) {
    process.stderr.write(`roadmap-update-task: ${args.taskId} not found in roadmap\n`);
    process.exit(1);
  }
  if (args.flags.printTitle) {
    process.stdout.write(`${result.title}\n`);
    return;
  }
  if (args.flags.dryRun) {
    process.stdout.write(result.text);
    return;
  }
  writeFileSync(YML, result.text);
}

const invokedDirect = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
if (invokedDirect) main(process.argv.slice(2));
