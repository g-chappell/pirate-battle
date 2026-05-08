#!/usr/bin/env node
// regression-check.mjs — extract /autonomous-run Step 10's regression-
// detection prose into a deterministic script.
//
// Reads the last `Outcome: success` entry in AGENT-LOG.md (via the same
// chronological-max selector that notify-cycle.sh uses), parses its
// `Test counts:` line, and compares the prior counts to the current
// counts passed in as CLI args.
//
// Usage:
//   regression-check.mjs 'core=938, content=181, web=551, server=48, shared=18'
//   echo 'core=938, content=181, ...' | regression-check.mjs
//
// Emits JSON to stdout:
//   {
//     regressed: boolean,
//     workspaces: {
//       core:    { prev: 910, curr: 938, delta:  28 },
//       content: { prev: 179, curr: 181, delta:   2 },
//       ...
//     },
//     missingInCurrent: ['foo'],  // present in prev, absent from curr
//   }
//
// Exit codes:
//   0  clean — no count decreased, curr covers everything in prev
//   1  regression detected (some workspace count decreased)
//   2  unreadable prior entry (missing log, no success entries, bad format)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = resolve(ROOT, 'AGENT-LOG.md');

function normalise(ts) {
  let n = ts;
  n = n.replace(/Z$/, '');
  n = n.replace(/T/, ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(n)) n += ':00';
  return n;
}

function latestSuccessEntry(text) {
  const blocks = text.split(/^### Run /m).slice(1);
  let best = null;
  let bestTs = '';
  for (const b of blocks) {
    const m = b.match(/^\[(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?Z?\]/);
    if (!m) continue;
    const ts = normalise(`${m[1]} ${m[2]}:${m[3] ?? '00'}`);
    const outcome = b.match(/^- Outcome:\s*(\S+)/m)?.[1];
    if (outcome !== 'success' && outcome !== 'success_with_warning') continue;
    if (ts > bestTs) { bestTs = ts; best = b; }
  }
  return best;
}

function parseCounts(s) {
  if (!s) return null;
  const out = {};
  const cleaned = s.replace(/\(.*?\)/g, '').trim();
  for (const pair of cleaned.split(',')) {
    const [k, v] = pair.split('=').map((x) => x?.trim());
    if (!k || !v) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function readCurrentCountsArg() {
  const cli = process.argv.slice(2).join(' ').trim();
  if (cli) return parseCounts(cli);
  try {
    const stdin = readFileSync(0, 'utf8').trim();
    if (stdin) return parseCounts(stdin);
  } catch { /* no-op */ }
  return null;
}

function fail(code, msg) {
  process.stdout.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(code);
}

if (!existsSync(LOG)) fail(2, 'AGENT-LOG.md not found');
const logText = readFileSync(LOG, 'utf8');
const prevEntry = latestSuccessEntry(logText);
if (!prevEntry) fail(2, 'no prior success entry in AGENT-LOG');

const prevLine = prevEntry.match(/^- Test counts:\s*(.+)$/m)?.[1];
const prev = parseCounts(prevLine);
if (!prev) fail(2, `could not parse prior test counts line: ${prevLine ?? '(missing)'}`);

const curr = readCurrentCountsArg();
if (!curr) fail(2, 'current counts missing — pass via argv or stdin (e.g. "core=938, web=551")');

const workspaces = {};
let regressed = false;
const missingInCurrent = [];
for (const [k, v] of Object.entries(prev)) {
  if (!(k in curr)) {
    missingInCurrent.push(k);
    continue;
  }
  const delta = curr[k] - v;
  workspaces[k] = { prev: v, curr: curr[k], delta };
  if (delta < 0) regressed = true;
}
// New workspaces in curr but not prev aren't a regression — surface them
// so the caller sees the shape.
for (const [k, v] of Object.entries(curr)) {
  if (!(k in prev)) workspaces[k] = { prev: null, curr: v, delta: v };
}

process.stdout.write(
  JSON.stringify({ regressed, workspaces, missingInCurrent }) + '\n',
);
process.exit(regressed ? 1 : 0);
