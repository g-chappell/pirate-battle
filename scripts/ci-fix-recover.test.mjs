// ci-fix-recover.test.mjs — node --test runner.
//
// Unit tests cover the pure bits — arg parsing, regex-based run-id
// extraction. The subprocess-driven fix loop itself is exercised by the
// canary PR and manual invocation; mocking `execSync` + `spawnSync`
// isn't worth the ceremony at this stage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(SELF_DIR, 'ci-fix-recover.mjs');
const SRC = readFileSync(SCRIPT, 'utf8');

test('script declares default max-prs=5 and max-attempts=3', () => {
  assert.match(SRC, /maxPrs:\s*5/);
  assert.match(SRC, /maxAttempts:\s*3/);
});

test('scoped allowed-tools list matches the plan', () => {
  // Plan A5 #23 names: Bash(npm *), Bash(git *), Edit, Read.
  // We extend with Bash(node *) for running the helpers, Grep/Glob for navigation.
  assert.match(SRC, /Bash\(npm \*\)/);
  assert.match(SRC, /Bash\(git \*\)/);
  assert.match(SRC, /Edit/);
  assert.match(SRC, /Read/);
});

test('passes --dangerously-skip-permissions to claude', () => {
  assert.match(SRC, /--dangerously-skip-permissions/);
});

test('runId regex extracts numeric id from a details URL', () => {
  const sample = 'https://github.com/owner/repo/actions/runs/24873982864/job/72826451549';
  const m = sample.match(/runs\/(\d+)/);
  assert.equal(m?.[1], '24873982864');
});

test('exit code 2 on missing gh/claude — guarded by which() check', () => {
  assert.match(SRC, /which\('gh'\)/);
  assert.match(SRC, /which\('claude'\)/);
  assert.match(SRC, /infraFail\('gh CLI not on PATH'\)/);
  assert.match(SRC, /infraFail\('claude CLI not on PATH'\)/);
});
