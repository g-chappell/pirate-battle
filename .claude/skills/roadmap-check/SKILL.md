---
name: roadmap-check
description: Validate roadmap.yml and print the next ready task the autonomous agent would pick. Use to sanity-check the roadmap before enabling the scheduled task, or to manually see what's next.
user-invocable: true
---

# /roadmap-check

Quick read-only health check + "what would `/autonomous-run` do next?"

## Steps

1. Run `node roadmap/validate.mjs` — bail if invalid
2. Load `roadmap/roadmap.yml`
3. Walk tasks and apply selection rules (same as `/autonomous-run` step 4):
   - `status == ready`
   - All `depends_on` tasks have `status == done`
   - No open PR branch matches `{{branchPrefix}}<id>-*`
   - `attempt_count < 3`
4. Order by priority (high > med > low), then by task ID sequence
5. Print:

```
Roadmap valid. <N> total tasks: <done>/<ready>/<in-progress>/<blocked>.

Next task: TASK-XXX — <title>
  Priority: <priority>
  Complexity: <complexity>
  Workspaces: <list>
  Depends on: <list or none>
  Description: <first 200 chars>

Queued after: TASK-YYY, TASK-ZZZ  (next 2 in priority order)

Blocked tasks: <count> — run /autonomous-review to see if any should be unblocked
```

6. If no ready tasks: print the full blocked list with `blocked_reason` for each.
