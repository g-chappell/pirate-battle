// roadmap-update-task.test.mjs — node --test runner.
//
//   node --test scripts/roadmap-update-task.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, findTaskBlock, applyMutations } from './roadmap-update-task.mjs';

const FIXTURE = `version: 1
meta:
  project: Test
  branch_prefix: auto/
epics:
  - id: EPIC-01
    title: First epic
    stories:
      - id: STORY-01
        title: First story
        tasks:
          - id: TASK-001
            title: Scaffold root TS tooling
            status: done
            priority: high
            complexity: small
            workspaces: []
            description: |
              Add tsconfig.
            depends_on: []
            pr: https://github.com/x/y/pull/2
            completed: '2026-04-20T18:25:00Z'
            blocked_reason: null
            last_attempted: '2026-04-20T18:18:00Z'
            attempt_count: 1
          - id: TASK-002
            title: Wire Vite + React
            status: ready
            priority: high
            complexity: small
            workspaces:
              - web
            description: |
              Build the web shell.
            depends_on:
              - TASK-001
            pr: null
            completed: null
            blocked_reason: null
            last_attempted: null
            attempt_count: 0
`;

test('parseArgs accepts task id + all flags', () => {
  const a = parseArgs([
    'TASK-002',
    '--status',
    'in-progress',
    '--increment-attempt-count',
    '--last-attempted-now',
  ]);
  assert.equal(a.taskId, 'TASK-002');
  assert.equal(a.mutations.status, 'in-progress');
  assert.equal(a.flags.incAttempt, true);
  assert.equal(a.flags.stampLastAttempted, true);
});

test('parseArgs throws on unknown flag', () => {
  assert.throws(() => parseArgs(['TASK-001', '--bogus']), /unknown arg/);
});

test('parseArgs throws without a task id', () => {
  assert.throws(() => parseArgs(['--status', 'done']), /task id required/);
});

test('findTaskBlock locates the correct task range', () => {
  const lines = FIXTURE.split('\n');
  const b2 = findTaskBlock(lines, 'TASK-002');
  assert.ok(b2);
  assert.match(lines[b2.start], /- id: TASK-002/);
  assert.equal(b2.end, lines.length); // TASK-002 runs to EOF
  const b1 = findTaskBlock(lines, 'TASK-001');
  assert.match(lines[b1.start], /- id: TASK-001/);
  assert.match(lines[b1.end], /- id: TASK-002/);
});

test('findTaskBlock returns null for missing id', () => {
  assert.equal(findTaskBlock(FIXTURE.split('\n'), 'TASK-999'), null);
});

test('applyMutations sets status and leaves other blocks untouched', () => {
  const out = applyMutations(FIXTURE, 'TASK-002', {
    mutations: { status: 'in-progress' },
    flags: {},
  });
  assert.equal(out.ok, true);
  assert.match(
    out.text,
    /- id: TASK-002\n {12}title: Wire Vite \+ React\n {12}status: in-progress/,
  );
  // TASK-001 status untouched
  assert.match(out.text, /- id: TASK-001\n {12}title: Scaffold root TS tooling\n {12}status: done/);
});

test('applyMutations increments attempt_count', () => {
  const out = applyMutations(FIXTURE, 'TASK-002', {
    mutations: {},
    flags: { incAttempt: true },
  });
  assert.equal(out.ok, true);
  assert.match(out.text, /- id: TASK-002[\s\S]*?attempt_count: 1/);
  // TASK-001 attempt_count still 1 (not 2)
  assert.match(out.text, /- id: TASK-001[\s\S]*?attempt_count: 1/);
});

test('applyMutations stamps last_attempted with ISO', () => {
  const out = applyMutations(FIXTURE, 'TASK-002', {
    mutations: {},
    flags: { stampLastAttempted: true },
  });
  assert.match(
    out.text,
    /- id: TASK-002[\s\S]*?last_attempted: '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z'/,
  );
});

test('applyMutations sets pr URL and completed together', () => {
  const out = applyMutations(FIXTURE, 'TASK-002', {
    mutations: { status: 'done', pr: 'https://github.com/x/y/pull/42' },
    flags: { stampCompleted: true },
  });
  assert.match(out.text, /- id: TASK-002[\s\S]*?status: done/);
  assert.match(out.text, /- id: TASK-002[\s\S]*?pr: https:\/\/github\.com\/x\/y\/pull\/42/);
  assert.match(out.text, /- id: TASK-002[\s\S]*?completed: '\d{4}-\d{2}-\d{2}T/);
});

test('applyMutations returns not-found for missing task', () => {
  const out = applyMutations(FIXTURE, 'TASK-999', { mutations: {}, flags: {} });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'task-not-found');
});

test('applyMutations printTitle returns the title', () => {
  const out = applyMutations(FIXTURE, 'TASK-002', { mutations: {}, flags: { printTitle: true } });
  assert.equal(out.ok, true);
  assert.equal(out.title, 'Wire Vite + React');
});

test('quoting: string that looks like a number is single-quoted', () => {
  const out = applyMutations(FIXTURE, 'TASK-002', {
    mutations: { status: '2026' },
    flags: {},
  });
  assert.match(out.text, /- id: TASK-002[\s\S]*?status: '2026'/);
});

test('mutation preserves the total line count for field edits only', () => {
  const out = applyMutations(FIXTURE, 'TASK-002', {
    mutations: { status: 'in-progress' },
    flags: { incAttempt: true, stampLastAttempted: true },
  });
  const before = FIXTURE.split('\n').length;
  const after = out.text.split('\n').length;
  assert.equal(before, after);
});
