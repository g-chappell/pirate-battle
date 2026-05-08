---
name: test-all
description: Run every test command defined in .claude/project.json across all workspaces. Reports pass/fail counts per workspace. Used by /autonomous-run step 7 for local validation before push.
user-invocable: true
disable-model-invocation: true
---

# /test-all

Read `.claude/project.json`. For each workspace:
- If `workspaces[i].commands.test` is set, run it in `workspaces[i].path`
- Else, run `commands.test` at the repo root (once)

Capture exit code and the last 30 lines of output for each. Report:

```
Test results:

[PASS] shared     (123 tests, 0 failed, 3.2s)
[PASS] server     (87 tests, 0 failed, 2.1s)
[FAIL] client     (205 tests, 1 failed, 8.4s)
  - last lines:
    > expected true but got false
    > at tests/foo.test.ts:42

Overall: 1 workspace failed.
```

Exit non-zero if any workspace failed.

## When to use

- Before pushing from `/autonomous-run`
- Manually to smoke-test the full suite
- After a CI auto-fix attempt

## Not this skill's job

- Fixing failures — just report
- Running lint or typecheck — use separate commands for those
- Running e2e — e2e is typically only run in CI, not in this local pass
