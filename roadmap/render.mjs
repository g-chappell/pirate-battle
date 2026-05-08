#!/usr/bin/env node
// render.mjs — roadmap.yml → ROADMAP.md
//
// Idempotent: same input always produces byte-identical output.
// Emits a "DO NOT EDIT" banner at the top so humans know to edit roadmap.yml.
//
// Usage:   node roadmap/render.mjs
// Output:  writes ROADMAP.md at the repo root.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './yaml-lite.mjs';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SELF_DIR, '..');
const YML_PATH = resolve(SELF_DIR, 'roadmap.yml');
const MD_PATH = resolve(PROJECT_ROOT, 'ROADMAP.md');

const STATUS_BADGE = {
  ready: ':black_circle:',
  'in-progress': ':large_orange_diamond:',
  done: ':white_check_mark:',
  blocked: ':no_entry:',
};

function banner() {
  return [
    '<!-- DO NOT EDIT — this file is generated from roadmap/roadmap.yml -->',
    '<!-- To add tasks: edit roadmap/roadmap.yml, then run `node roadmap/render.mjs` -->',
    '<!-- Or run /roadmap-add or /pm-brainstorm from Claude Code. -->',
    '',
  ].join('\n');
}

function renderTask(task) {
  const badge = STATUS_BADGE[task.status] || '';
  const parts = [`  - ${badge} **${task.id}** — ${task.title}  \`${task.priority}\` \`${task.complexity}\``];
  if (task.workspaces && task.workspaces.length) {
    parts[0] += ` _(${task.workspaces.join(', ')})_`;
  }
  if (task.status === 'done' && task.pr) {
    parts[0] += ` · [PR](${task.pr})`;
  }
  if (task.status === 'blocked' && task.blocked_reason) {
    parts[0] += `  \n    _blocked: ${task.blocked_reason}_`;
  }
  if (task.depends_on && task.depends_on.length) {
    parts[0] += `  \n    _depends on: ${task.depends_on.join(', ')}_`;
  }
  if (task.description) {
    const trimmed = task.description.trim();
    if (trimmed) parts.push(`    > ${trimmed.split('\n').join('\n    > ')}`);
  }
  return parts.join('\n');
}

function renderStory(story) {
  const out = [`- **${story.id}** — ${story.title}`];
  if (story.description) {
    out.push(`  > ${story.description.trim().split('\n').join('\n  > ')}`);
  }
  const tasks = story.tasks || [];
  if (tasks.length) {
    out.push(tasks.map(renderTask).join('\n'));
  }
  return out.join('\n');
}

function renderEpic(epic) {
  const out = [`## ${epic.id} — ${epic.title}`, ''];
  if (epic.description) {
    out.push(epic.description.trim(), '');
  }
  const stories = epic.stories || [];
  if (stories.length === 0) {
    out.push('_No stories yet._');
  } else {
    out.push(stories.map(renderStory).join('\n\n'));
  }
  return out.join('\n');
}

function renderSummary(epics) {
  let total = 0, done = 0, ready = 0, inProg = 0, blocked = 0;
  for (const e of epics || []) {
    for (const s of e.stories || []) {
      for (const t of s.tasks || []) {
        total++;
        if (t.status === 'done') done++;
        else if (t.status === 'in-progress') inProg++;
        else if (t.status === 'blocked') blocked++;
        else ready++;
      }
    }
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return [
    '## Summary',
    '',
    `- **Total tasks:** ${total}`,
    `- **Done:** ${done} (${pct}%)`,
    `- **Ready:** ${ready}`,
    `- **In progress:** ${inProg}`,
    `- **Blocked:** ${blocked}`,
    '',
  ].join('\n');
}

function render(data) {
  const meta = data.meta || {};
  const projectName = meta.project || 'project';
  const parts = [
    banner(),
    `# ${projectName} — Roadmap`,
    '',
  ];
  if (meta.created) parts.push(`_Created: ${meta.created}_`, '');
  parts.push(renderSummary(data.epics));
  parts.push('---', '');
  for (const epic of data.epics || []) {
    parts.push(renderEpic(epic));
    parts.push('');
  }
  return parts.join('\n').replace(/\n{3,}/g, '\n\n');
}

function main() {
  const src = readFileSync(YML_PATH, 'utf8');
  const data = parse(src);
  const md = render(data);
  writeFileSync(MD_PATH, md);
  process.stdout.write(`Wrote ${MD_PATH}\n`);
}

main();
